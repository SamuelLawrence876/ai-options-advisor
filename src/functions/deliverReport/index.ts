import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('deliver-report invoked', { event });
};
