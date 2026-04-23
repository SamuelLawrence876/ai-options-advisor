import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('enrich-and-score invoked', { event });
};
