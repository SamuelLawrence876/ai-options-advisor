import { SymbolSnapshot } from './symbolSnapshot';

export type OptionType = 'call' | 'put';
export type IvRankSource = 'HISTORICAL' | 'CHAIN_PROXY';

export interface VolSurfacePoint {
  expiry: string;
  strike: number;
  iv: number;
  delta: number;
}

export interface CandidateStrike {
  expiry: string;
  dte: number;
  strike: number;
  optionType: OptionType;
  delta: number;
  theta: number;
  vega: number;
  bid: number;
  ask: number;
  mid: number;
  openInterest: number;
  volume: number;
}

export interface OptionsData extends SymbolSnapshot {
  ivRank: number;
  ivPercentile: number;
  ivRankSource?: IvRankSource;
  iv30d: number;
  hv30d: number;
  volSurface: VolSurfacePoint[];
  candidateStrikes: CandidateStrike[];
  gammaFlip?: number;
  callWall?: number;
  putWall?: number;
}
