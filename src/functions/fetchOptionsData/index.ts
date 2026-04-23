import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('fetch-options-data invoked', { event });
};
