import { StrategyRecommendation } from '../types';

export interface MaxLossParams {
  costBasis?: number;
  spreadWidth?: number;
  strike: number;
  premiumCollected: number;
}

export function computeMaxLoss(strategy: StrategyRecommendation, params: MaxLossParams): number {
  const { costBasis, spreadWidth, strike, premiumCollected } = params;
  switch (strategy) {
    case 'COVERED_CALL':
      return ((costBasis ?? strike) - premiumCollected) * 100;
    case 'PUT_CREDIT_SPREAD':
    case 'CALL_CREDIT_SPREAD':
      return Math.max(0, ((spreadWidth ?? 5) - premiumCollected) * 100);
    case 'CALL_DEBIT_SPREAD':
    case 'PUT_DEBIT_SPREAD':
      return premiumCollected * 100;
    case 'CSP':
      return (strike - premiumCollected) * 100;
    default:
      return 0;
  }
}

export function computeBpr(
  strategy: StrategyRecommendation,
  sharePrice: number,
  maxLoss: number,
): number {
  switch (strategy) {
    case 'COVERED_CALL':
      return sharePrice * 100;
    case 'PUT_CREDIT_SPREAD':
    case 'CALL_CREDIT_SPREAD':
    case 'CALL_DEBIT_SPREAD':
    case 'PUT_DEBIT_SPREAD':
    case 'CSP':
      return maxLoss;
    default:
      return maxLoss;
  }
}

export function computeRobp(premiumCollected: number, bpr: number, dte: number): number {
  if (bpr <= 0) return 0;
  const robp = (premiumCollected * 100) / bpr;
  return robp * (365 / dte) * 100;
}

export function computeAnnualisedYield(premium: number, strike: number, dte: number): number {
  if (strike === 0 || dte === 0) return 0;
  return (premium / strike) * (365 / dte) * 100;
}
