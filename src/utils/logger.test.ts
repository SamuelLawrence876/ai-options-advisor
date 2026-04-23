import * as log from './logger';

type LogRecord = {
  level: string;
  message?: string;
  service?: string;
  stage?: string;
  timestamp?: string;
  stack?: string;
  correlationId?: string;
  count?: number;
  errorName?: string;
  errorMessage?: string;
  code?: string;
  retries?: number;
};

describe('logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.SERVICE_NAME = 'test-svc';
    process.env.STAGE = 'test';
    delete process.env.LOG_LEVEL;
  });

  const lastRecord = (): LogRecord => {
    const calls = consoleSpy.mock.calls as string[][];
    return JSON.parse(calls[0][0]) as LogRecord;
  };

  describe('output shape', () => {
    it('writes structured JSON with required fields', () => {
      log.info('hello world');

      expect(lastRecord()).toMatchObject({
        level: 'INFO',
        message: 'hello world',
        service: 'test-svc',
        stage: 'test',
      });
      expect(lastRecord().timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('merges extra fields into the record', () => {
      log.info('with extras', { correlationId: 'abc', count: 5 });

      expect(lastRecord()).toMatchObject({ correlationId: 'abc', count: 5 });
    });

    it('all levels emit to console.log', () => {
      process.env.LOG_LEVEL = 'DEBUG';

      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(consoleSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('log level filtering', () => {
    it('suppresses messages below LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'WARN';

      log.debug('suppressed');
      log.info('suppressed');
      log.warn('visible');
      log.error('visible');

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('defaults to INFO when LOG_LEVEL is unset', () => {
      log.debug('suppressed');
      log.info('visible');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(lastRecord().level).toBe('INFO');
    });

    it('falls back to INFO for unknown LOG_LEVEL values', () => {
      process.env.LOG_LEVEL = 'VERBOSE';

      log.info('still works');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error()', () => {
    it('expands Error objects into structured fields', () => {
      log.error('something failed', new Error('bad things'));

      expect(lastRecord()).toMatchObject({
        level: 'ERROR',
        errorName: 'Error',
        errorMessage: 'bad things',
      });
      expect(lastRecord().stack).toContain('Error: bad things');
    });

    it('accepts plain extra context', () => {
      log.error('failed', { code: 'TIMEOUT', retries: 3 });

      expect(lastRecord()).toMatchObject({ code: 'TIMEOUT', retries: 3 });
    });
  });
});
