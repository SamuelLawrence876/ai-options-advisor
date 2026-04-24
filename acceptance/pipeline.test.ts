import { getBucketName, getRegion, getStage, resourceNames } from './utils/config';
import { getItem, scanTable } from './utils/dynamodb';
import { getJsonObject, listObjects, objectExists } from './utils/s3';
import { getStateMachineArn, pollExecution, startExecution } from './utils/stepfunctions';

jest.setTimeout(25 * 60 * 1000);

const TEST_DATE = process.env.TEST_DATE ?? new Date().toISOString().slice(0, 10);
const stage = getStage();
const region = getRegion();
const names = resourceNames(stage);

let bucket: string;
let executionArn: string;

beforeAll(async () => {
  bucket = await getBucketName(stage, region);
  const smArn = await getStateMachineArn(names.stateMachineName);
  executionArn = await startExecution(smArn, { date: TEST_DATE });
  console.log(`Pipeline started — execution: ${executionArn}`);
  console.log(`Date under test: ${TEST_DATE}`);
});

describe('pipeline end-to-end', () => {
  it('completes successfully within 20 minutes', async () => {
    await pollExecution(executionArn, 20 * 60 * 1000);
  });

  describe('S3 outputs', () => {
    it('writes market context to S3', async () => {
      const key = `raw-data/${TEST_DATE}/market-context.json`;
      await expect(objectExists(bucket, key)).resolves.toBe(true);

      const ctx = await getJsonObject<Record<string, unknown>>(bucket, key);
      expect(ctx).toHaveProperty('vix');
      expect(ctx).toHaveProperty('vixRegime');
      expect(ctx).toHaveProperty('marketTrend');
      expect(ctx).toHaveProperty('sectorIvs');
    });

    it('writes raw data for every active ticker', async () => {
      const keys = await listObjects(bucket, `raw-data/${TEST_DATE}/`);
      const prefixes = new Set(keys.map(k => k.split('/')[2]));
      expect(prefixes.size).toBeGreaterThan(0);

      for (const symbol of prefixes) {
        if (symbol === undefined) continue;
        expect(keys).toContain(`raw-data/${TEST_DATE}/${symbol}/options.json`);
        expect(keys).toContain(`raw-data/${TEST_DATE}/${symbol}/fundamentals.json`);
        expect(keys).toContain(`raw-data/${TEST_DATE}/${symbol}/technicals.json`);
      }
    });

    it('writes enriched data for every ticker', async () => {
      const enrichedKeys = await listObjects(bucket, `enriched/${TEST_DATE}/`);
      expect(enrichedKeys.length).toBeGreaterThan(0);

      const sample = await getJsonObject<Record<string, unknown>>(bucket, enrichedKeys[0]);
      expect(sample).toHaveProperty('vrp');
      expect(sample).toHaveProperty('ivRankSignal');
      expect(sample).toHaveProperty('suggestedStrategy');
    });

    it('writes the HTML report to S3', async () => {
      const key = `reports/${TEST_DATE}/full-report.html`;
      await expect(objectExists(bucket, key)).resolves.toBe(true);
    });
  });

  describe('DynamoDB outputs', () => {
    it('writes report metadata to the reports table', async () => {
      const record = await getItem<Record<string, unknown>>(names.reportsTable, {
        reportDate: TEST_DATE,
      });
      expect(record).toBeDefined();
      expect(record).toHaveProperty('s3Key');
      expect(record).toHaveProperty('topPicks');
      expect(record!.status).toBe('COMPLETE');
    });

    it('writes IV history snapshots for each ticker', async () => {
      const snapshots = await scanTable<Record<string, unknown>>(names.ivHistoryTable);
      const forToday = snapshots.filter(s => s.date === TEST_DATE);
      expect(forToday.length).toBeGreaterThan(0);

      const sample = forToday[0];
      expect(sample).toHaveProperty('iv30d');
      expect(sample).toHaveProperty('ivRank');
      expect(sample).toHaveProperty('hv30d');
      expect(sample).toHaveProperty('vrp');
    });
  });
});
