import { info } from '../../utils/logger';

export const handler = async (event: unknown): Promise<void> => {
  info('fetch-fundamentals invoked', { event });
};
