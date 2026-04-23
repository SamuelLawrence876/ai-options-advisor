type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_RANK: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const minLevel = (): number => {
  const raw = (process.env.LOG_LEVEL ?? 'INFO').toUpperCase();
  return LEVEL_RANK[raw as LogLevel] ?? LEVEL_RANK.INFO;
};

const emit = (level: LogLevel, message: string, extra?: Record<string, unknown>): void => {
  if (LEVEL_RANK[level] < minLevel()) return;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      service: process.env.SERVICE_NAME ?? 'unknown',
      stage: process.env.STAGE ?? 'local',
      ...extra,
    }),
  );
};

export const debug = (message: string, extra?: Record<string, unknown>): void =>
  emit('DEBUG', message, extra);

export const info = (message: string, extra?: Record<string, unknown>): void =>
  emit('INFO', message, extra);

export const warn = (message: string, extra?: Record<string, unknown>): void =>
  emit('WARN', message, extra);

export const error = (message: string, errorOrExtra?: Error | Record<string, unknown>): void => {
  if (errorOrExtra instanceof Error) {
    emit('ERROR', message, {
      errorName: errorOrExtra.name,
      errorMessage: errorOrExtra.message,
      stack: errorOrExtra.stack,
    });
  } else {
    emit('ERROR', message, errorOrExtra);
  }
};
