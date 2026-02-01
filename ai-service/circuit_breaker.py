"""
Circuit Breaker Pattern Implementation for External Services.

States:
- CLOSED: Normal operation, requests pass through
- OPEN: Service is failing, requests fail fast without calling the service
- HALF_OPEN: Testing if service has recovered

Transitions:
- CLOSED -> OPEN: After `failure_threshold` consecutive failures
- OPEN -> HALF_OPEN: After `recovery_timeout` seconds
- HALF_OPEN -> CLOSED: After `success_threshold` consecutive successes
- HALF_OPEN -> OPEN: After any failure
"""
import asyncio
import time
from typing import TypeVar, Callable, Awaitable, Any, Optional
from enum import Enum
from dataclasses import dataclass, field
from functools import wraps
from agent_logger import logger

T = TypeVar('T')


class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is open and preventing calls."""
    def __init__(self, service_name: str, state: CircuitState, time_until_retry: float = 0):
        self.service_name = service_name
        self.state = state
        self.time_until_retry = time_until_retry
        super().__init__(f"Circuit breaker for {service_name} is {state.value}. Retry in {time_until_retry:.1f}s")


@dataclass
class CircuitBreakerStats:
    """Statistics for a circuit breaker instance."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    state_changes: list = field(default_factory=list)


class CircuitBreaker:
    """
    Circuit breaker for protecting external service calls.

    Usage:
        breaker = CircuitBreaker("openai", failure_threshold=5, recovery_timeout=30)

        try:
            result = await breaker.call(async_function, arg1, arg2)
        except CircuitBreakerError as e:
            # Handle circuit open - use fallback or return cached data
            pass
    """

    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        success_threshold: int = 2,
        half_open_max_calls: int = 3,
        exclude_exceptions: tuple = (),
    ):
        """
        Initialize circuit breaker.

        Args:
            service_name: Name of the service (for logging)
            failure_threshold: Number of consecutive failures before opening circuit
            recovery_timeout: Seconds to wait before trying again (OPEN -> HALF_OPEN)
            success_threshold: Number of consecutive successes needed to close circuit
            half_open_max_calls: Max concurrent calls allowed in HALF_OPEN state
            exclude_exceptions: Exception types that should NOT count as failures
        """
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        self.half_open_max_calls = half_open_max_calls
        self.exclude_exceptions = exclude_exceptions

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls = 0
        self._lock = asyncio.Lock()
        self._stats = CircuitBreakerStats()

    @property
    def state(self) -> CircuitState:
        """Get current state, automatically transitioning OPEN -> HALF_OPEN if timeout passed."""
        if self._state == CircuitState.OPEN:
            if self._last_failure_time and time.time() - self._last_failure_time >= self.recovery_timeout:
                self._transition_to(CircuitState.HALF_OPEN)
        return self._state

    @property
    def stats(self) -> CircuitBreakerStats:
        """Get circuit breaker statistics."""
        return self._stats

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state with logging."""
        old_state = self._state
        self._state = new_state

        # Reset counters based on new state
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._success_count = 0
            self._half_open_calls = 0
        elif new_state == CircuitState.OPEN:
            self._success_count = 0

        # Log state change
        self._stats.state_changes.append({
            "from": old_state.value,
            "to": new_state.value,
            "time": time.time(),
        })

        logger.info(
            f"Circuit breaker state change: {old_state.value} -> {new_state.value}",
            service=self.service_name,
            failure_count=self._failure_count,
            success_count=self._success_count,
        )

    def _record_success(self) -> None:
        """Record a successful call."""
        self._stats.total_calls += 1
        self._stats.successful_calls += 1
        self._stats.last_success_time = time.time()

        if self._state == CircuitState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.success_threshold:
                self._transition_to(CircuitState.CLOSED)
        elif self._state == CircuitState.CLOSED:
            # Reset failure count on success
            self._failure_count = 0

    def _record_failure(self, error: Exception) -> None:
        """Record a failed call."""
        self._stats.total_calls += 1
        self._stats.failed_calls += 1
        self._stats.last_failure_time = time.time()
        self._last_failure_time = time.time()

        # Don't count excluded exceptions as failures
        if isinstance(error, self.exclude_exceptions):
            logger.debug(
                f"Circuit breaker ignoring excluded exception: {type(error).__name__}",
                service=self.service_name,
            )
            return

        if self._state == CircuitState.HALF_OPEN:
            # Any failure in HALF_OPEN immediately opens the circuit
            self._transition_to(CircuitState.OPEN)
        elif self._state == CircuitState.CLOSED:
            self._failure_count += 1
            if self._failure_count >= self.failure_threshold:
                self._transition_to(CircuitState.OPEN)

        logger.warn(
            f"Circuit breaker recorded failure: {type(error).__name__}: {str(error)[:100]}",
            service=self.service_name,
            failure_count=self._failure_count,
            state=self._state.value,
        )

    def _can_proceed(self) -> bool:
        """Check if a call can proceed."""
        current_state = self.state  # This may transition OPEN -> HALF_OPEN

        if current_state == CircuitState.CLOSED:
            return True
        elif current_state == CircuitState.OPEN:
            return False
        elif current_state == CircuitState.HALF_OPEN:
            # Allow limited calls in HALF_OPEN state
            return self._half_open_calls < self.half_open_max_calls

        return False

    def time_until_retry(self) -> float:
        """Get seconds until circuit will transition to HALF_OPEN."""
        if self._state != CircuitState.OPEN or not self._last_failure_time:
            return 0.0

        elapsed = time.time() - self._last_failure_time
        remaining = self.recovery_timeout - elapsed
        return max(0.0, remaining)

    async def call(
        self,
        func: Callable[..., Awaitable[T]],
        *args,
        fallback: Optional[Callable[..., Awaitable[T]]] = None,
        **kwargs,
    ) -> T:
        """
        Execute a function through the circuit breaker.

        Args:
            func: Async function to call
            *args: Positional arguments for func
            fallback: Optional fallback function to call when circuit is open
            **kwargs: Keyword arguments for func

        Returns:
            Result from func or fallback

        Raises:
            CircuitBreakerError: If circuit is open and no fallback provided
            Exception: If func raises and circuit is not tripped
        """
        async with self._lock:
            if not self._can_proceed():
                self._stats.rejected_calls += 1

                if fallback:
                    logger.info(
                        f"Circuit open, using fallback for {self.service_name}",
                        service=self.service_name,
                        time_until_retry=self.time_until_retry(),
                    )
                    return await fallback(*args, **kwargs)

                raise CircuitBreakerError(
                    self.service_name,
                    self._state,
                    self.time_until_retry(),
                )

            if self._state == CircuitState.HALF_OPEN:
                self._half_open_calls += 1

        try:
            result = await func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure(e)
            raise

    def reset(self) -> None:
        """Manually reset the circuit breaker to CLOSED state."""
        self._transition_to(CircuitState.CLOSED)
        self._last_failure_time = None
        logger.info(f"Circuit breaker manually reset", service=self.service_name)

    def get_status(self) -> dict:
        """Get current status as a dictionary."""
        return {
            "service": self.service_name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "time_until_retry": self.time_until_retry(),
            "stats": {
                "total_calls": self._stats.total_calls,
                "successful_calls": self._stats.successful_calls,
                "failed_calls": self._stats.failed_calls,
                "rejected_calls": self._stats.rejected_calls,
            },
        }


def circuit_breaker(
    breaker: CircuitBreaker,
    fallback: Optional[Callable[..., Awaitable[Any]]] = None,
):
    """
    Decorator to wrap async functions with circuit breaker protection.

    Usage:
        openai_breaker = CircuitBreaker("openai")

        @circuit_breaker(openai_breaker)
        async def call_openai(prompt: str):
            ...
    """
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            return await breaker.call(func, *args, fallback=fallback, **kwargs)

        # Attach breaker to wrapper for inspection
        wrapper.circuit_breaker = breaker
        return wrapper

    return decorator


# Global circuit breakers for external services
openai_circuit_breaker = CircuitBreaker(
    service_name="openai",
    failure_threshold=5,
    recovery_timeout=30.0,
    success_threshold=2,
    half_open_max_calls=3,
)

ses_circuit_breaker = CircuitBreaker(
    service_name="ses",
    failure_threshold=5,
    recovery_timeout=30.0,
    success_threshold=2,
    half_open_max_calls=3,
)


def get_circuit_breaker_status() -> dict:
    """Get status of all circuit breakers."""
    return {
        "openai": openai_circuit_breaker.get_status(),
        "ses": ses_circuit_breaker.get_status(),
    }


async def reset_circuit_breaker(service_name: str) -> bool:
    """Reset a circuit breaker by service name."""
    if service_name == "openai":
        openai_circuit_breaker.reset()
        return True
    elif service_name == "ses":
        ses_circuit_breaker.reset()
        return True
    return False
