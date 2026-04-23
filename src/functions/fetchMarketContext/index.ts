import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('fetch-market-context invoked', { event });
};
