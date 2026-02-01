/**
 * Circuit Breaker Pattern Implementation for External Services
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast without calling the service
 * - HALF_OPEN: Testing if service has recovered
 *
 * Transitions:
 * - CLOSED -> OPEN: After `failureThreshold` consecutive failures
 * - OPEN -> HALF_OPEN: After `recoveryTimeout` milliseconds
 * - HALF_OPEN -> CLOSED: After `successThreshold` consecutive successes
 * - HALF_OPEN -> OPEN: After any failure
 */

import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  stateChanges: Array<{
    from: CircuitState;
    to: CircuitState;
    time: number;
  }>;
}

export interface CircuitBreakerConfig {
  serviceName: string;
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  halfOpenMaxCalls: number;
  excludeErrors?: string[];
}

export class CircuitBreakerError extends Error {
  serviceName: string;
  state: CircuitState;
  timeUntilRetry: number;

  constructor(serviceName: string, state: CircuitState, timeUntilRetry: number = 0) {
    super(`Circuit breaker for ${serviceName} is ${state}. Retry in ${(timeUntilRetry / 1000).toFixed(1)}s`);
    this.name = 'CircuitBreakerError';
    this.serviceName = serviceName;
    this.state = state;
    this.timeUntilRetry = timeUntilRetry;
  }
}

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private halfOpenCalls: number = 0;
  private stats: CircuitBreakerStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    rejectedCalls: 0,
    lastFailureTime: null,
    lastSuccessTime: null,
    stateChanges: [],
  };

  constructor(config: Partial<CircuitBreakerConfig> & { serviceName: string }) {
    this.config = {
      serviceName: config.serviceName,
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 30000, // 30 seconds
      successThreshold: config.successThreshold ?? 2,
      halfOpenMaxCalls: config.halfOpenMaxCalls ?? 3,
      excludeErrors: config.excludeErrors ?? [],
    };
  }

  /**
   * Get current state, automatically transitioning OPEN -> HALF_OPEN if timeout passed
   */
  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && this.lastFailureTime) {
      if (Date.now() - this.lastFailureTime >= this.config.recoveryTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return { ...this.stats };
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters based on new state
    switch (newState) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenCalls = 0;
        break;
      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        this.halfOpenCalls = 0;
        break;
      case CircuitState.OPEN:
        this.successCount = 0;
        break;
    }

    // Log state change
    this.stats.stateChanges.push({
      from: oldState,
      to: newState,
      time: Date.now(),
    });

    logger.info(`Circuit breaker state change`, {
      service: this.config.serviceName,
      from: oldState,
      to: newState,
      failureCount: this.failureCount,
      successCount: this.successCount,
    });
  }

  private recordSuccess(): void {
    this.stats.totalCalls++;
    this.stats.successfulCalls++;
    this.stats.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  private recordFailure(error: Error): void {
    this.stats.totalCalls++;
    this.stats.failedCalls++;
    this.stats.lastFailureTime = Date.now();
    this.lastFailureTime = Date.now();

    // Don't count excluded errors as failures
    const errorName = error.name || error.constructor.name;
    if (this.config.excludeErrors?.includes(errorName)) {
      logger.debug(`Circuit breaker ignoring excluded error: ${errorName}`, {
        service: this.config.serviceName,
      });
      return;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately opens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }

    logger.warn(`Circuit breaker recorded failure: ${errorName}: ${error.message?.substring(0, 100)}`, {
      service: this.config.serviceName,
      failureCount: this.failureCount,
      state: this.state,
    });
  }

  private canProceed(): boolean {
    const currentState = this.getState(); // This may transition OPEN -> HALF_OPEN

    switch (currentState) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        return false;
      case CircuitState.HALF_OPEN:
        // Allow limited calls in HALF_OPEN state
        return this.halfOpenCalls < this.config.halfOpenMaxCalls;
      default:
        return false;
    }
  }

  timeUntilRetry(): number {
    if (this.state !== CircuitState.OPEN || !this.lastFailureTime) {
      return 0;
    }

    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = this.config.recoveryTimeout - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Execute a function through the circuit breaker
   */
  async call<T>(
    fn: () => Promise<T>,
    options?: {
      fallback?: () => Promise<T>;
    }
  ): Promise<T> {
    if (!this.canProceed()) {
      this.stats.rejectedCalls++;

      if (options?.fallback) {
        logger.info(`Circuit open, using fallback for ${this.config.serviceName}`, {
          service: this.config.serviceName,
          timeUntilRetry: this.timeUntilRetry(),
        });
        return options.fallback();
      }

      throw new CircuitBreakerError(
        this.config.serviceName,
        this.state,
        this.timeUntilRetry()
      );
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.lastFailureTime = null;
    logger.info(`Circuit breaker manually reset`, { service: this.config.serviceName });
  }

  /**
   * Get current status as an object
   */
  getStatus(): {
    service: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    timeUntilRetry: number;
    stats: {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      rejectedCalls: number;
    };
  } {
    return {
      service: this.config.serviceName,
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      timeUntilRetry: this.timeUntilRetry(),
      stats: {
        totalCalls: this.stats.totalCalls,
        successfulCalls: this.stats.successfulCalls,
        failedCalls: this.stats.failedCalls,
        rejectedCalls: this.stats.rejectedCalls,
      },
    };
  }
}

// Global circuit breakers for external services
export const sesCircuitBreaker = new CircuitBreaker({
  serviceName: 'ses',
  failureThreshold: 5,
  recoveryTimeout: 30000, // 30 seconds
  successThreshold: 2,
  halfOpenMaxCalls: 3,
});

export const openaiCircuitBreaker = new CircuitBreaker({
  serviceName: 'openai',
  failureThreshold: 5,
  recoveryTimeout: 30000,
  successThreshold: 2,
  halfOpenMaxCalls: 3,
});

export const databaseCircuitBreaker = new CircuitBreaker({
  serviceName: 'database',
  failureThreshold: 3,
  recoveryTimeout: 10000, // 10 seconds for database
  successThreshold: 2,
  halfOpenMaxCalls: 2,
});

/**
 * Get status of all circuit breakers
 */
export function getCircuitBreakerStatus(): Record<string, ReturnType<CircuitBreaker['getStatus']>> {
  return {
    ses: sesCircuitBreaker.getStatus(),
    openai: openaiCircuitBreaker.getStatus(),
    database: databaseCircuitBreaker.getStatus(),
  };
}

/**
 * Reset a circuit breaker by service name
 */
export function resetCircuitBreaker(serviceName: string): boolean {
  switch (serviceName) {
    case 'ses':
      sesCircuitBreaker.reset();
      return true;
    case 'openai':
      openaiCircuitBreaker.reset();
      return true;
    case 'database':
      databaseCircuitBreaker.reset();
      return true;
    default:
      return false;
  }
}

/**
 * Check if a service is healthy (circuit is closed)
 */
export function isServiceHealthy(serviceName: string): boolean {
  switch (serviceName) {
    case 'ses':
      return sesCircuitBreaker.getState() === CircuitState.CLOSED;
    case 'openai':
      return openaiCircuitBreaker.getState() === CircuitState.CLOSED;
    case 'database':
      return databaseCircuitBreaker.getState() === CircuitState.CLOSED;
    default:
      return true;
  }
}
