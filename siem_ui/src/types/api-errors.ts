/**
 * Base class for all API-related errors
 * Provides consistent error structure across the application
 */
export abstract class ApiError extends Error {
  abstract readonly type: string;
  abstract readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging or transmission
   */
  toJSON() {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Network-related errors (connection issues, timeouts, etc.)
 */
export class NetworkError extends ApiError {
  readonly type = 'NETWORK_ERROR';
  readonly code: string;

  constructor(
    message: string,
    code: 'CONNECTION_FAILED' | 'TIMEOUT' | 'CORS_ERROR' | 'UNKNOWN_NETWORK',
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.code = code;
  }

  static fromFetchError(error: unknown, url: string): NetworkError {
    if (error instanceof TypeError) {
      // TypeError usually indicates network issues in fetch
      if (error.message.includes('Failed to fetch')) {
        return new NetworkError(
          'Network request failed - check connection and CORS settings',
          'CONNECTION_FAILED',
          { url, originalError: error.message }
        );
      }
    }
    
    return new NetworkError(
      `Network error: ${error}`,
      'UNKNOWN_NETWORK',
      { url, originalError: String(error) }
    );
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends ApiError {
  readonly type = 'AUTH_ERROR';
  readonly code: string;

  constructor(
    message: string,
    code: 'NO_TOKEN' | 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'UNAUTHORIZED' | 'FORBIDDEN',
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.code = code;
  }

  static noToken(): AuthError {
    return new AuthError(
      'No authentication token available',
      'NO_TOKEN'
    );
  }

  static fromResponse(status: number, statusText: string, url: string): AuthError {
    if (status === 401) {
      return new AuthError(
        'Authentication required - token may be invalid or expired',
        'UNAUTHORIZED',
        { status, statusText, url }
      );
    }
    
    if (status === 403) {
      return new AuthError(
        'Access forbidden - insufficient permissions',
        'FORBIDDEN',
        { status, statusText, url }
      );
    }
    
    return new AuthError(
      `Authentication error: ${status} ${statusText}`,
      'INVALID_TOKEN',
      { status, statusText, url }
    );
  }
}

/**
 * Server-side errors (4xx, 5xx responses)
 */
export class ServerError extends ApiError {
  readonly type = 'SERVER_ERROR';
  readonly code: string;
  public readonly status: number;
  public readonly statusText: string;

  constructor(
    message: string,
    status: number,
    statusText: string,
    code: 'CLIENT_ERROR' | 'SERVER_ERROR' | 'BAD_REQUEST' | 'NOT_FOUND' | 'INTERNAL_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.code = code;
    this.status = status;
    this.statusText = statusText;
  }

  static fromResponse(response: Response, url: string, responseBody?: string): ServerError {
    const { status, statusText } = response;
    const context = { url, status, statusText, responseBody };

    if (status >= 400 && status < 500) {
      const code = status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : 'CLIENT_ERROR';
      return new ServerError(
        `Client error: ${status} ${statusText}`,
        status,
        statusText,
        code,
        context
      );
    }

    if (status >= 500) {
      return new ServerError(
        `Server error: ${status} ${statusText}`,
        status,
        statusText,
        'SERVER_ERROR',
        context
      );
    }

    return new ServerError(
      `HTTP error: ${status} ${statusText}`,
      status,
      statusText,
      'INTERNAL_ERROR',
      context
    );
  }
}

/**
 * Data validation errors (schema validation, parsing errors)
 */
export class ValidationError extends ApiError {
  readonly type = 'VALIDATION_ERROR';
  readonly code: string;
  public readonly zodError?: unknown;

  constructor(
    message: string,
    code: 'SCHEMA_VALIDATION' | 'PARSE_ERROR' | 'INVALID_FORMAT',
    zodError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.code = code;
    this.zodError = zodError;
  }

  static fromZodError(zodError: unknown, data: unknown): ValidationError {
    return new ValidationError(
      'Response data does not match expected schema',
      'SCHEMA_VALIDATION',
      zodError,
      { receivedData: data }
    );
  }

  static parseError(error: unknown, rawData: string): ValidationError {
    return new ValidationError(
      'Failed to parse response data',
      'PARSE_ERROR',
      error,
      { rawData: rawData.substring(0, 500) } // Limit raw data for logging
    );
  }
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check specific error types
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Error handler utility for consistent error processing
 */
export class ErrorHandler {
  /**
   * Convert unknown error to appropriate ApiError type
   */
  static categorizeError(error: unknown, url: string, response?: Response): ApiError {
    // If already an ApiError, return as-is
    if (isApiError(error)) {
      return error;
    }

    // Handle fetch/network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NetworkError.fromFetchError(error, url);
    }

    // Handle response errors
    if (response && !response.ok) {
      if (response.status === 401 || response.status === 403) {
        return AuthError.fromResponse(response.status, response.statusText, url);
      }
      return ServerError.fromResponse(response, url);
    }

    // Fallback to generic network error
    return new NetworkError(
      `Unexpected error: ${error}`,
      'UNKNOWN_NETWORK',
      { url, originalError: String(error) }
    );
  }

  /**
   * Log error with appropriate level based on error type
   */
  static logError(error: ApiError, component: string): void {
    const logData = {
      ...error.toJSON(),
      component,
    };

    // Use different log levels based on error type
    if (isNetworkError(error) || isAuthError(error)) {
      console.warn(`[${component}] ${error.type}:`, logData);
    } else if (isServerError(error) && error.status >= 500) {
      console.error(`[${component}] ${error.type}:`, logData);
    } else {
      console.error(`[${component}] ${error.type}:`, logData);
    }

    // Send to external error tracking in production
    if (import.meta.env.PROD && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        tags: {
          component,
          errorType: error.type,
          errorCode: error.code,
        },
        extra: error.context,
      });
    }
  }
}