import { MacroEvent } from '../../types';
import { buildFinnhubUrl } from './finnhubRequest';
import { daysBetween } from '../dates';

interface FinnhubEconomicEvent {
  country: string;
  event: string;
  impact: string;
  time: string;
}

interface FinnhubEconomicCalendarResponse {
  economicCalendar: FinnhubEconomicEvent[];
}

export async function fetchFinnhubEconomicCalendar(
  fromDate: string,
  toDate: string,
  referenceDate: string,
  apiKey: string,
): Promise<MacroEvent[]> {
  const url = buildFinnhubUrl('/calendar/economic', {
    from: fromDate,
    to: toDate,
    token: apiKey,
  });
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = (await response.json()) as FinnhubEconomicCalendarResponse;

  return (data.economicCalendar ?? [])
    .filter(e => e.country === 'US' && e.impact === 'high')
    .map(e => ({
      event: e.event,
      date: e.time.slice(0, 10),
      daysAway: daysBetween(e.time.slice(0, 10), referenceDate),
      impact: 'HIGH' as const,
    }))
    .filter(e => e.daysAway >= 0)
    .sort((a, b) => a.daysAway - b.daysAway);
}
