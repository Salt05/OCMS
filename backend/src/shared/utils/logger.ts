/**
 * Minimal structured logger.
 * Prefixes every message with ISO timestamp and level.
 * Debug output is suppressed in production.
 */
export const logger = {
  info: (...args: unknown[]) =>
    console.log(`[${new Date().toISOString()}] [INFO]`, ...args),

  error: (...args: unknown[]) =>
    console.error(`[${new Date().toISOString()}] [ERROR]`, ...args),

  warn: (...args: unknown[]) =>
    console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),

  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${new Date().toISOString()}] [DEBUG]`, ...args);
    }
  },
};
