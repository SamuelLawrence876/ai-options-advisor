import { Duration } from 'aws-cdk-lib';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import {
  Chain,
  DefinitionBody,
  JsonPath,
  Map,
  Parallel,
  Pass,
  StateMachine,
  Succeed,
  TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { addStagePrefix } from '../../utils/naming';

export interface PipelineStateMachineProps {
  stage: string;
  isProd: boolean;
  fetchOptionsData: IFunction;
  fetchFundamentals: IFunction;
  fetchTechnicals: IFunction;
  fetchMarketContext: IFunction;
  enrichAndScore: IFunction;
  runLlmAnalysis: IFunction;
  generateReport: IFunction;
  deliverReport: IFunction;
}

export class PipelineStateMachine extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: PipelineStateMachineProps) {
    super(scope, id);

    const {
      stage,
      fetchOptionsData,
      fetchFundamentals,
      fetchTechnicals,
      fetchMarketContext,
      enrichAndScore,
      runLlmAnalysis,
      generateReport,
      deliverReport,
    } = props;

    // ── Step 1: Fetch market context once ─────────────────────────────────
    const fetchMarketContextStep = new LambdaInvoke(this, 'FetchMarketContext', {
      lambdaFunction: fetchMarketContext,
      comment: 'Fetch VIX, SPY, QQQ, sector ETF IVs and load active watchlist',
      resultSelector: {
        'date.$': '$.Payload.date',
        'marketContext.$': '$.Payload.marketContext',
        'tickers.$': '$.Payload.tickers',
      },
      resultPath: '$',
    });

    // ── Step 2: Per-ticker data collection (parallel within each ticker) ──
    const fetchOptionsDataStep = new LambdaInvoke(this, 'FetchOptionsData', {
      lambdaFunction: fetchOptionsData,
      comment: 'Fetch IV rank, Greeks, vol surface from MarketData.app',
      payload: TaskInput.fromObject({
        'ticker.$': '$.ticker',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultPath: JsonPath.DISCARD,
    });

    const fetchFundamentalsStep = new LambdaInvoke(this, 'FetchFundamentals', {
      lambdaFunction: fetchFundamentals,
      comment: 'Fetch earnings, dividends, short interest, analyst ratings',
      payload: TaskInput.fromObject({
        'ticker.$': '$.ticker',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultPath: JsonPath.DISCARD,
    });

    const fetchTechnicalsStep = new LambdaInvoke(this, 'FetchTechnicals', {
      lambdaFunction: fetchTechnicals,
      comment: 'Fetch price history, compute MAs, ATR, trend classification',
      payload: TaskInput.fromObject({
        'ticker.$': '$.ticker',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultPath: JsonPath.DISCARD,
    });

    const parallelDataFetch = new Parallel(this, 'ParallelDataFetch', {
      comment: 'Fetch options, fundamentals, and technicals in parallel',
      resultPath: JsonPath.DISCARD,
    });
    parallelDataFetch.branch(fetchOptionsDataStep);
    parallelDataFetch.branch(fetchFundamentalsStep);
    parallelDataFetch.branch(fetchTechnicalsStep);

    const mapDataCollection = new Map(this, 'MapDataCollection', {
      comment: 'Run parallel data fetch for each ticker',
      itemsPath: '$.tickers',
      itemSelector: {
        'ticker.$': '$$.Map.Item.Value',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      },
      resultPath: JsonPath.DISCARD,
      maxConcurrency: 1,
    });
    mapDataCollection.itemProcessor(parallelDataFetch);

    // ── Step 3: Per-ticker enrichment ──────────────────────────────────────
    const enrichAndScoreStep = new LambdaInvoke(this, 'EnrichAndScore', {
      lambdaFunction: enrichAndScore,
      comment: 'Compute VRP, event flags, candidate strikes, ROBP metrics',
      payload: TaskInput.fromObject({
        'ticker.$': '$.ticker',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultSelector: {
        'enriched.$': '$.Payload',
      },
    });

    const mapEnrichment = new Map(this, 'MapEnrichment', {
      comment: 'Enrich each ticker with computed signals',
      itemsPath: '$.tickers',
      itemSelector: {
        'ticker.$': '$$.Map.Item.Value',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      },
      resultPath: '$.enrichedTickers',
      maxConcurrency: 10,
    });
    mapEnrichment.itemProcessor(enrichAndScoreStep);

    // ── Step 4: Per-ticker LLM analysis (Stage 1) ─────────────────────────
    const llmStage1Step = new LambdaInvoke(this, 'RunLlmStage1', {
      lambdaFunction: runLlmAnalysis,
      comment: 'Per-ticker Bedrock/Claude analysis',
      payload: TaskInput.fromObject({
        stage: 1,
        'ticker.$': '$.ticker',
        'enriched.$': '$.enriched',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultSelector: {
        'analysis.$': '$.Payload',
      },
    });

    const llmStage1FailedPass = new Pass(this, 'TickerLlmFailed', {
      comment:
        'LLM failure — produce a SKIP analysis so collectAnalyses [*].analysis has an entry for every item',
      parameters: {
        analysis: {
          'symbol.$': '$.ticker.symbol',
          recommendation: 'SKIP',
          confidence: 'LOW',
          reasoning: 'LLM analysis failed; excluded from portfolio synthesis.',
          risks: ['Pipeline error'],
          flags: ['LLM_FAILED'],
        },
      },
    });
    llmStage1Step.addCatch(llmStage1FailedPass, { resultPath: '$.error' });

    const mapLlmStage1 = new Map(this, 'MapLlmStage1', {
      comment: 'Run LLM Stage 1 analysis for each enriched ticker',
      itemsPath: '$.enrichedTickers',
      itemSelector: {
        'ticker.$': '$$.Map.Item.Value.enriched.ticker',
        'enriched.$': '$$.Map.Item.Value.enriched',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      },
      resultPath: '$.tickerAnalysesRaw',
      maxConcurrency: 5,
    });
    mapLlmStage1.itemProcessor(llmStage1Step);

    // ── Step 5: Collect ticker analyses array ─────────────────────────────
    const collectAnalyses = new Pass(this, 'CollectAnalyses', {
      comment: 'Flatten ticker analyses from Map output',
      parameters: {
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
        'enrichedTickers.$': '$.enrichedTickers',
        'tickerAnalyses.$': '$.tickerAnalysesRaw[*].analysis',
      },
    });

    // ── Step 6: Portfolio synthesis (Stage 2) ─────────────────────────────
    const portfolioSynthesisStep = new LambdaInvoke(this, 'PortfolioSynthesis', {
      lambdaFunction: runLlmAnalysis,
      comment: 'Portfolio-level Bedrock synthesis ranked by ROBP',
      payload: TaskInput.fromObject({
        stage: 2,
        'tickerAnalyses.$': '$.tickerAnalyses',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultSelector: {
        'synthesis.$': '$.Payload',
      },
      resultPath: '$.synthesisResult',
    });

    // ── Step 7: Generate HTML report ──────────────────────────────────────
    const generateReportStep = new LambdaInvoke(this, 'GenerateReport', {
      lambdaFunction: generateReport,
      comment: 'Build colour-coded HTML report and write to S3',
      payload: TaskInput.fromObject({
        'synthesis.$': '$.synthesisResult.synthesis',
        'tickerAnalyses.$': '$.tickerAnalyses',
        'enrichedTickers.$': '$.enrichedTickers[*].enriched',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultSelector: {
        'reportKey.$': '$.Payload.reportKey',
        'synthesis.$': '$.Payload.synthesis',
        'tickerAnalyses.$': '$.Payload.tickerAnalyses',
        'enrichedTickers.$': '$.Payload.enrichedTickers',
        'date.$': '$.Payload.date',
        'marketContext.$': '$.Payload.marketContext',
      },
      resultPath: '$',
    });

    // ── Step 8: Deliver report ────────────────────────────────────────────
    const deliverReportStep = new LambdaInvoke(this, 'DeliverReport', {
      lambdaFunction: deliverReport,
      comment: 'Send SES email, write IV history snapshots and report metadata',
      payload: TaskInput.fromObject({
        'reportKey.$': '$.reportKey',
        'synthesis.$': '$.synthesis',
        'tickerAnalyses.$': '$.tickerAnalyses',
        'enrichedTickers.$': '$.enrichedTickers',
        'date.$': '$.date',
        'marketContext.$': '$.marketContext',
      }),
      resultPath: JsonPath.DISCARD,
    });

    const succeed = new Succeed(this, 'Succeed');

    // ── Wire the chain ────────────────────────────────────────────────────
    const definition = Chain.start(fetchMarketContextStep)
      .next(mapDataCollection)
      .next(mapEnrichment)
      .next(mapLlmStage1)
      .next(collectAnalyses)
      .next(portfolioSynthesisStep)
      .next(generateReportStep)
      .next(deliverReportStep)
      .next(succeed);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      stateMachineName: addStagePrefix(stage, 'options-analysis'),
      definitionBody: DefinitionBody.fromChainable(definition),
      timeout: Duration.hours(4),
    });
  }
}
