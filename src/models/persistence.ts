import { IvRankSource } from './options';

export interface HumanContextEntry {
  pk: string;
  timestamp: string;
  context: string;
  expires?: string;
  source: string;
}

export interface IvSnapshot {
  symbol: string;
  date: string;
  iv30d: number;
  ivRank: number;
  ivPercentile: number;
  ivRankSource?: IvRankSource;
  hv30d: number;
  vrp: number;
}

export type ReportStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED';

export interface ReportTopPickMetadata {
  symbol: string;
  strategy: string;
}

export interface ReportMetadata {
  reportDate: string;
  s3Key: string;
  tickersAnalysed: string[];
  topPicks: ReportTopPickMetadata[];
  status: ReportStatus;
}
