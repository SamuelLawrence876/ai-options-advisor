import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('fetch-fundamentals invoked', { event });
};
