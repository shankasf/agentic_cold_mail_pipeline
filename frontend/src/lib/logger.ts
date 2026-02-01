/**
 * Structured Logging Utility
 *
 * Provides JSON-formatted logging with:
 * - Log levels (debug, info, warn, error)
 * - Request context (requestId, userId, endpoint, method, duration)
 * - Environment-aware behavior (LOG_LEVEL env var)
 * - Request ID generation for correlation
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  duration?: number;
  statusCode?: number;
  errorCode?: string;
  httpStatus?: number;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  service: string;
}

const SERVICE_NAME = process.env.SERVICE_NAME || 'email-marketing-frontend';

function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel;
  }
  // Default: debug in development, info in production
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    const result: LogEntry['error'] = {
      name: error.name,
      message: error.message,
    };

    // Include code if it exists (e.g., Prisma errors)
    if ('code' in error && typeof error.code === 'string') {
      result.code = error.code;
    }

    // Only include stack in non-production
    if (process.env.NODE_ENV !== 'production') {
      result.stack = error.stack;
    }

    return result;
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (error) {
    entry.error = formatError(error);
  }

  return entry;
}

// Redis publishing for real-time log streaming
const LOGS_CHANNEL = 'service:logs';

async function publishToRedis(entry: LogEntry): Promise<void> {
  try {
    const { redisPub } = await import('@/lib/redis');
    const redis = redisPub();
    await redis.publish(LOGS_CHANNEL, JSON.stringify({
      ...entry,
      metadata: entry.context,
    }));
  } catch {
    // Silently fail - don't break logging if Redis is unavailable
  }
}

function writeLog(entry: LogEntry): void {
  const output = JSON.stringify(entry);

  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }

  // Also publish to Redis for real-time streaming (fire and forget)
  publishToRedis(entry).catch(() => {});
}

/**
 * Generate a unique request ID for correlation
 */
export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Base logger with context
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: unknown): void {
    if (!shouldLog(level)) return;

    const mergedContext = { ...this.context, ...data };
    const entry = createLogEntry(level, message, mergedContext, error);
    writeLog(entry);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>, error?: unknown): void {
    this.log('warn', message, data, error);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log('error', message, data, error);
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Get the current context
   */
  getContext(): LogContext {
    return { ...this.context };
  }
}

/**
 * Request logger context
 */
export interface RequestLoggerContext {
  requestId: string;
  userId?: string;
  endpoint: string;
  method: string;
}

/**
 * Create a logger for API request handling
 */
export function createRequestLogger(
  request: Request,
  user?: { id: string } | null
): Logger {
  const url = new URL(request.url);
  const requestId = generateRequestId();

  return new Logger({
    requestId,
    userId: user?.id,
    endpoint: url.pathname,
    method: request.method,
  });
}

/**
 * Worker logger context
 */
export interface WorkerLoggerContext {
  worker: string;
  jobId?: string;
}

/**
 * Create a logger for background worker jobs
 */
export function createWorkerLogger(
  workerName: string,
  jobId?: string
): Logger {
  return new Logger({
    worker: workerName,
    jobId,
  });
}

/**
 * Default logger instance for simple use cases
 */
export const logger = new Logger();

/**
 * Log a completed request with timing
 */
export function logRequestComplete(
  logger: Logger,
  statusCode: number,
  startTime: number
): void {
  const duration = Date.now() - startTime;
  const context = logger.getContext();
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  const message = `${context.method} ${context.endpoint} ${statusCode} ${duration}ms`;

  if (level === 'error') {
    logger.error(message, undefined, { statusCode, duration });
  } else if (level === 'warn') {
    logger.warn(message, { statusCode, duration });
  } else {
    logger.info(message, { statusCode, duration });
  }
}
