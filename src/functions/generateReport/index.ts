import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('generate-report invoked', { event });
};
