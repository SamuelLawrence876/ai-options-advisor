import { info } from '../../utils/logger';

export const handler = (event: unknown): void => {
  info('run-llm-analysis invoked', { event });
};
