/**
 * Error Handling Utilities
 *
 * Provides:
 * - AppError class with code, httpStatus, field
 * - Error factory functions
 * - Prisma error mapping
 * - handleError function for consistent error responses
 */

import { NextResponse } from 'next/server';
import { Logger } from './logger';

/**
 * Error codes used throughout the application
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR';

/**
 * Custom application error with structured information
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    httpStatus: number,
    options?: {
      field?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.field = options?.field;
    this.details = options?.details;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace
    Error.captureStackTrace?.(this, AppError);
  }
}

/**
 * Error factory functions for common error types
 */
export const Errors = {
  badRequest(message: string, field?: string): AppError {
    return new AppError(message, 'BAD_REQUEST', 400, { field });
  },

  unauthorized(message = 'Authentication required'): AppError {
    return new AppError(message, 'UNAUTHORIZED', 401);
  },

  forbidden(message = 'Access denied'): AppError {
    return new AppError(message, 'FORBIDDEN', 403);
  },

  notFound(resource = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 'NOT_FOUND', 404);
  },

  conflict(message: string, field?: string): AppError {
    return new AppError(message, 'CONFLICT', 409, { field });
  },

  validation(message: string, field?: string): AppError {
    return new AppError(message, 'VALIDATION_ERROR', 422, { field });
  },

  rateLimited(message = 'Too many requests'): AppError {
    return new AppError(message, 'RATE_LIMITED', 429);
  },

  internal(message = 'Internal server error', cause?: Error): AppError {
    return new AppError(message, 'INTERNAL_ERROR', 500, { cause });
  },

  database(message: string, cause?: Error): AppError {
    return new AppError(message, 'DATABASE_ERROR', 500, { cause });
  },

  externalService(serviceName: string, message: string, cause?: Error): AppError {
    return new AppError(
      `${serviceName}: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      { cause, details: { service: serviceName } }
    );
  },
};

/**
 * Prisma error code mappings
 * https://www.prisma.io/docs/reference/api-reference/error-reference
 */
interface PrismaError extends Error {
  code?: string;
  meta?: {
    target?: string[];
    cause?: string;
    field_name?: string;
    model_name?: string;
  };
}

function isPrismaError(error: unknown): error is PrismaError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as PrismaError).code === 'string' &&
    (error as PrismaError).code?.startsWith('P')
  );
}

// User-friendly field name mappings
const FIELD_NAME_MAP: Record<string, string> = {
  canonical_name: 'name',
  canonicalName: 'name',
  email: 'email',
};

/**
 * Map Prisma errors to AppErrors
 */
export function mapPrismaError(error: PrismaError): AppError {
  const code = error.code;
  const meta = error.meta;

  switch (code) {
    // Unique constraint violation
    case 'P2002': {
      const rawFields = meta?.target || ['field'];
      // Map to user-friendly names
      const friendlyFields = rawFields.map(f => FIELD_NAME_MAP[f] || f).join(', ');
      return new AppError(
        `A record with this ${friendlyFields} already exists`,
        'CONFLICT',
        409,
        { field: meta?.target?.[0], cause: error }
      );
    }

    // Record not found
    case 'P2025':
      return new AppError(
        meta?.cause || 'Record not found',
        'NOT_FOUND',
        404,
        { cause: error }
      );

    // Foreign key constraint failed
    case 'P2003': {
      const field = meta?.field_name || 'relation';
      return new AppError(
        `Related ${field} does not exist`,
        'BAD_REQUEST',
        400,
        { field, cause: error }
      );
    }

    // Required relation not found
    case 'P2018':
      return new AppError(
        'Required related record not found',
        'NOT_FOUND',
        404,
        { cause: error }
      );

    // Input value too long
    case 'P2000': {
      const field = meta?.field_name;
      return new AppError(
        `Value too long${field ? ` for ${field}` : ''}`,
        'VALIDATION_ERROR',
        422,
        { field, cause: error }
      );
    }

    // Null constraint violation
    case 'P2011': {
      const field = meta?.field_name;
      return new AppError(
        `${field || 'Field'} is required`,
        'VALIDATION_ERROR',
        422,
        { field, cause: error }
      );
    }

    // Invalid ID format
    case 'P2023':
      return new AppError(
        'Invalid ID format',
        'BAD_REQUEST',
        400,
        { cause: error }
      );

    // Connection/timeout errors
    case 'P1001':
    case 'P1002':
    case 'P1008':
    case 'P1017':
      return new AppError(
        'Database connection error',
        'DATABASE_ERROR',
        503,
        { cause: error }
      );

    default:
      return new AppError(
        'Database operation failed',
        'DATABASE_ERROR',
        500,
        { cause: error, details: { prismaCode: code } }
      );
  }
}

/**
 * Error response structure sent to clients
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
    requestId?: string;
  };
}

/**
 * Handle an error and return a NextResponse
 * Logs the error and returns a sanitized response to the client
 */
export function handleError(
  error: unknown,
  logger?: Logger
): NextResponse<ErrorResponse> {
  let appError: AppError;

  // Convert to AppError if needed
  if (error instanceof AppError) {
    appError = error;
  } else if (isPrismaError(error)) {
    appError = mapPrismaError(error);
  } else if (error instanceof Error) {
    appError = Errors.internal(
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message,
      error
    );
  } else {
    appError = Errors.internal('An unexpected error occurred');
  }

  // Get request ID from logger context if available
  const requestId = logger?.getContext().requestId as string | undefined;

  // Log the error
  if (logger) {
    const logData = {
      errorCode: appError.code,
      httpStatus: appError.httpStatus,
      field: appError.field,
    };

    if (appError.httpStatus >= 500) {
      // Log full error for server errors
      logger.error(appError.message, error, logData);
    } else if (appError.httpStatus >= 400) {
      // Log as warning for client errors
      logger.warn(appError.message, logData);
    }
  }

  // Build client response
  const response: ErrorResponse = {
    error: {
      code: appError.code,
      message: appError.message,
      requestId,
    },
  };

  // Include field for validation/conflict errors
  if (appError.field && ['VALIDATION_ERROR', 'CONFLICT', 'BAD_REQUEST'].includes(appError.code)) {
    response.error.field = appError.field;
  }

  // Create response with request ID header
  const headers: HeadersInit = {};
  if (requestId) {
    headers['X-Request-Id'] = requestId;
  }

  return NextResponse.json(response, {
    status: appError.httpStatus,
    headers,
  });
}

/**
 * Type guard to check if an error is an AppError with a specific code
 */
export function isAppError(error: unknown, code?: ErrorCode): error is AppError {
  if (!(error instanceof AppError)) return false;
  if (code && error.code !== code) return false;
  return true;
}
