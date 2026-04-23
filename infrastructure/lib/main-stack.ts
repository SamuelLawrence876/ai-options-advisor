import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from './config';
import { Tables } from './constructs/data/tables';
import { Storage } from './constructs/data/storage';
import { Secrets } from './constructs/secrets/secrets';
import { FetchOptionsData } from './constructs/functions/fetch-options-data';
import { FetchFundamentals } from './constructs/functions/fetch-fundamentals';
import { FetchTechnicals } from './constructs/functions/fetch-technicals';
import { FetchMarketContext } from './constructs/functions/fetch-market-context';
import { EnrichAndScore } from './constructs/functions/enrich-and-score';
import { RunLlmAnalysis } from './constructs/functions/run-llm-analysis';
import { GenerateReport } from './constructs/functions/generate-report';
import { DeliverReport } from './constructs/functions/deliver-report';
import { PipelineStateMachine } from './constructs/state-machine/state-machine';
import { Scheduler } from './constructs/scheduler/scheduler';

export type StackType = 'prod' | 'dev';

export interface OptionsAnalysisStackProps extends StackProps {
  stackType: StackType;
  stage: string;
}

export class OptionsAnalysisStack extends Stack {
  constructor(scope: Construct, id: string, props: OptionsAnalysisStackProps) {
    super(scope, id, props);

    const { stackType, stage } = props;
    const isProd = stackType === 'prod';

    const tables = new Tables(this, 'Tables', { stage, isProd });
    const storage = new Storage(this, 'Storage', { stage, isProd });
    const secrets = new Secrets(this, 'Secrets', { stage });

    const fetchOptionsData = new FetchOptionsData(this, 'FetchOptionsData', {
      stage,
      bucket: storage.bucket,
      watchlistTable: tables.watchlistTable,
      flashAlphaApiKey: secrets.flashAlphaApiKey,
    });

    const fetchFundamentals = new FetchFundamentals(this, 'FetchFundamentals', {
      stage,
      bucket: storage.bucket,
      watchlistTable: tables.watchlistTable,
      alphaVantageApiKey: secrets.alphaVantageApiKey,
    });

    const fetchTechnicals = new FetchTechnicals(this, 'FetchTechnicals', {
      stage,
      bucket: storage.bucket,
      watchlistTable: tables.watchlistTable,
      alphaVantageApiKey: secrets.alphaVantageApiKey,
    });

    const fetchMarketContext = new FetchMarketContext(this, 'FetchMarketContext', {
      stage,
      bucket: storage.bucket,
      watchlistTable: tables.watchlistTable,
      flashAlphaApiKey: secrets.flashAlphaApiKey,
      alphaVantageApiKey: secrets.alphaVantageApiKey,
    });

    const enrichAndScore = new EnrichAndScore(this, 'EnrichAndScore', {
      stage,
      bucket: storage.bucket,
      watchlistTable: tables.watchlistTable,
      humanContextTable: tables.humanContextTable,
    });

    const runLlmAnalysis = new RunLlmAnalysis(this, 'RunLlmAnalysis', {
      stage,
      bucket: storage.bucket,
      watchlistTable: tables.watchlistTable,
      humanContextTable: tables.humanContextTable,
    });

    const generateReport = new GenerateReport(this, 'GenerateReport', {
      stage,
      bucket: storage.bucket,
    });

    const deliverReport = new DeliverReport(this, 'DeliverReport', {
      stage,
      bucket: storage.bucket,
      reportsTable: tables.reportsTable,
      ivHistoryTable: tables.ivHistoryTable,
      senderEmail: config.email.senderEmail,
      recipientEmail: config.email.recipientEmail,
    });

    const stateMachine = new PipelineStateMachine(this, 'StateMachine', {
      stage,
      isProd,
      fetchOptionsData: fetchOptionsData.fn,
      fetchFundamentals: fetchFundamentals.fn,
      fetchTechnicals: fetchTechnicals.fn,
      fetchMarketContext: fetchMarketContext.fn,
      enrichAndScore: enrichAndScore.fn,
      runLlmAnalysis: runLlmAnalysis.fn,
      generateReport: generateReport.fn,
      deliverReport: deliverReport.fn,
    });

    new Scheduler(this, 'Scheduler', {
      stage,
      stateMachine: stateMachine.stateMachine,
    });
  }
}
