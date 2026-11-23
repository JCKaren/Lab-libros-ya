/** Logger mínimo con niveles; reemplazable por pino/winston sin tocar el resto del código. */
type Level = 'info' | 'warn' | 'error';

function log(level: Level, message: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta === undefined) out(line);
  else out(line, meta);
}

export const logger = {
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
};
