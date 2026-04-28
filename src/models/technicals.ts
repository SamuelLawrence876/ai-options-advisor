import { TrendClassification } from './market';
import { SymbolSnapshot } from './symbolSnapshot';

export interface TechnicalsData extends SymbolSnapshot {
  price: number;
  high52w: number;
  low52w: number;
  distanceFromHigh52wPct: number;
  ma20: number | undefined;
  ma50: number | undefined;
  trend: TrendClassification | undefined;
  atr14: number;
  atrPct: number;
  hv30d: number;
  priceVsMa20Pct: number;
  priceVsMa50Pct: number;
}
