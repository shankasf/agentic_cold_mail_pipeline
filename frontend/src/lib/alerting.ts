/**
 * Alerting System for Email Marketing Platform
 *
 * Monitors key metrics and triggers alerts when thresholds are breached.
 * Supports multiple notification channels and severity levels.
 */

import { logger } from './logger';
import prisma from './prisma';
import { redis as getRedis } from './redis';
import { getCircuitBreakerStatus } from './circuit-breaker';
import { QUEUE_NAMES } from './queue';

// Alert severity levels
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

// Alert status
export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
}

// Alert types
export type AlertType =
  | 'bounce_rate'
  | 'complaint_rate'
  | 'queue_depth'
  | 'api_latency'
  | 'ai_error_rate'
  | 'circuit_breaker'
  | 'daily_cap'
  | 'warmup_pause';

// Alert thresholds configuration
export interface AlertThreshold {
  metric: AlertType;
  warning: number;
  critical: number;
  unit: string;
  description: string;
}

// Default alert thresholds
export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  {
    metric: 'bounce_rate',
    warning: 2,  // 2%
    critical: 5, // 5%
    unit: '%',
    description: 'Email bounce rate',
  },
  {
    metric: 'complaint_rate',
    warning: 0.05,  // 0.05%
    critical: 0.1,  // 0.1%
    unit: '%',
    description: 'Email complaint rate',
  },
  {
    metric: 'queue_depth',
    warning: 1000,
    critical: 5000,
    unit: 'jobs',
    description: 'Pending jobs in email send queue',
  },
  {
    metric: 'api_latency',
    warning: 3000,   // 3 seconds
    critical: 10000, // 10 seconds
    unit: 'ms',
    description: 'API response time P99',
  },
  {
    metric: 'ai_error_rate',
    warning: 3,   // 3%
    critical: 10, // 10%
    unit: '%',
    description: 'AI service error rate',
  },
];

// Alert interface
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

// In-memory alert store (would be replaced with database in production)
const activeAlerts: Map<string, Alert> = new Map();

/**
 * Generate a unique alert ID
 */
function generateAlertId(type: AlertType): string {
  return `alert_${type}_${Date.now()}`;
}

/**
 * Create and fire an alert
 */
export async function fireAlert(params: {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  metadata?: Record<string, unknown>;
}): Promise<Alert> {
  const alert: Alert = {
    id: generateAlertId(params.type),
    type: params.type,
    severity: params.severity,
    status: AlertStatus.ACTIVE,
    message: params.message,
    value: params.value,
    threshold: params.threshold,
    unit: params.unit,
    createdAt: new Date(),
    metadata: params.metadata,
  };

  // Store alert
  activeAlerts.set(alert.id, alert);

  // Log alert
  const logFn = params.severity === AlertSeverity.CRITICAL ? logger.error : logger.warn;
  logFn(`ALERT [${params.severity}]: ${params.message}`, {
    alertId: alert.id,
    type: params.type,
    value: params.value,
    threshold: params.threshold,
  });

  // Publish to Redis for real-time notifications
  try {
    const redis = getRedis();
    await redis.publish('alerts:new', JSON.stringify(alert));

    // Store in alert history
    await redis.lpush('alerts:history', JSON.stringify(alert));
    await redis.ltrim('alerts:history', 0, 999); // Keep last 1000 alerts
  } catch (e) {
    logger.error('Failed to publish alert to Redis', e);
  }

  return alert;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: string): Promise<boolean> {
  const alert = activeAlerts.get(alertId);
  if (!alert) return false;

  alert.status = AlertStatus.RESOLVED;
  alert.resolvedAt = new Date();

  logger.info(`Alert resolved: ${alert.message}`, { alertId });

  // Publish resolution
  try {
    const redis = getRedis();
    await redis.publish('alerts:resolved', JSON.stringify(alert));
  } catch (e) {
    // Ignore
  }

  activeAlerts.delete(alertId);
  return true;
}

/**
 * Get all active alerts
 */
export function getActiveAlerts(): Alert[] {
  return Array.from(activeAlerts.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Check bounce rate and fire alerts if needed
 */
export async function checkBounceRate(): Promise<void> {
  const threshold = DEFAULT_THRESHOLDS.find(t => t.metric === 'bounce_rate')!;

  // Get bounce rate for last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalSent, bounced] = await Promise.all([
    prisma.emailDraft.count({
      where: { status: 'SENT', sentAt: { gte: since } },
    }),
    prisma.emailDraft.count({
      where: { status: 'BOUNCED', updatedAt: { gte: since } },
    }),
  ]);

  if (totalSent === 0) return;

  const bounceRate = (bounced / totalSent) * 100;

  if (bounceRate >= threshold.critical) {
    await fireAlert({
      type: 'bounce_rate',
      severity: AlertSeverity.CRITICAL,
      message: `Critical bounce rate: ${bounceRate.toFixed(2)}% (threshold: ${threshold.critical}%)`,
      value: bounceRate,
      threshold: threshold.critical,
      unit: threshold.unit,
      metadata: { totalSent, bounced },
    });
  } else if (bounceRate >= threshold.warning) {
    await fireAlert({
      type: 'bounce_rate',
      severity: AlertSeverity.WARNING,
      message: `High bounce rate: ${bounceRate.toFixed(2)}% (threshold: ${threshold.warning}%)`,
      value: bounceRate,
      threshold: threshold.warning,
      unit: threshold.unit,
      metadata: { totalSent, bounced },
    });
  }
}

/**
 * Check complaint rate and fire alerts if needed
 */
export async function checkComplaintRate(): Promise<void> {
  const threshold = DEFAULT_THRESHOLDS.find(t => t.metric === 'complaint_rate')!;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalSent, complaints] = await Promise.all([
    prisma.emailDraft.count({
      where: { status: 'SENT', sentAt: { gte: since } },
    }),
    prisma.emailDraft.count({
      where: { status: 'COMPLAINT', updatedAt: { gte: since } },
    }),
  ]);

  if (totalSent === 0) return;

  const complaintRate = (complaints / totalSent) * 100;

  if (complaintRate >= threshold.critical) {
    await fireAlert({
      type: 'complaint_rate',
      severity: AlertSeverity.CRITICAL,
      message: `Critical complaint rate: ${complaintRate.toFixed(3)}% (threshold: ${threshold.critical}%)`,
      value: complaintRate,
      threshold: threshold.critical,
      unit: threshold.unit,
      metadata: { totalSent, complaints },
    });
  } else if (complaintRate >= threshold.warning) {
    await fireAlert({
      type: 'complaint_rate',
      severity: AlertSeverity.WARNING,
      message: `High complaint rate: ${complaintRate.toFixed(3)}% (threshold: ${threshold.warning}%)`,
      value: complaintRate,
      threshold: threshold.warning,
      unit: threshold.unit,
      metadata: { totalSent, complaints },
    });
  }
}

/**
 * Check queue depth and fire alerts if needed
 */
export async function checkQueueDepth(): Promise<void> {
  const threshold = DEFAULT_THRESHOLDS.find(t => t.metric === 'queue_depth')!;

  try {
    const redis = getRedis();

    // Get waiting jobs count for email-send queue
    const waitingCount = await redis.llen(`bull:${QUEUE_NAMES.EMAIL_SEND}:wait`);
    const delayedCount = await redis.zcard(`bull:${QUEUE_NAMES.EMAIL_SEND}:delayed`);
    const totalPending = waitingCount + delayedCount;

    if (totalPending >= threshold.critical) {
      await fireAlert({
        type: 'queue_depth',
        severity: AlertSeverity.CRITICAL,
        message: `Critical queue depth: ${totalPending} jobs (threshold: ${threshold.critical})`,
        value: totalPending,
        threshold: threshold.critical,
        unit: threshold.unit,
        metadata: { waitingCount, delayedCount },
      });
    } else if (totalPending >= threshold.warning) {
      await fireAlert({
        type: 'queue_depth',
        severity: AlertSeverity.WARNING,
        message: `High queue depth: ${totalPending} jobs (threshold: ${threshold.warning})`,
        value: totalPending,
        threshold: threshold.warning,
        unit: threshold.unit,
        metadata: { waitingCount, delayedCount },
      });
    }
  } catch (e) {
    logger.error('Failed to check queue depth', e);
  }
}

/**
 * Check circuit breaker status and fire alerts
 */
export async function checkCircuitBreakers(): Promise<void> {
  const status = getCircuitBreakerStatus();

  for (const [service, info] of Object.entries(status)) {
    if (info.state === 'OPEN') {
      await fireAlert({
        type: 'circuit_breaker',
        severity: AlertSeverity.CRITICAL,
        message: `Circuit breaker OPEN for ${service}`,
        value: info.failureCount,
        threshold: 5, // Default failure threshold
        unit: 'failures',
        metadata: {
          service,
          state: info.state,
          timeUntilRetry: info.timeUntilRetry,
        },
      });
    } else if (info.state === 'HALF_OPEN') {
      await fireAlert({
        type: 'circuit_breaker',
        severity: AlertSeverity.WARNING,
        message: `Circuit breaker HALF_OPEN for ${service} - testing recovery`,
        value: info.failureCount,
        threshold: 5,
        unit: 'failures',
        metadata: {
          service,
          state: info.state,
        },
      });
    }
  }
}

/**
 * Run all alert checks
 */
export async function runAlertChecks(): Promise<{
  alertsFired: number;
  checks: string[];
}> {
  const checks: string[] = [];
  const initialAlertCount = activeAlerts.size;

  try {
    await checkBounceRate();
    checks.push('bounce_rate');
  } catch (e) {
    logger.error('Failed to check bounce rate', e);
  }

  try {
    await checkComplaintRate();
    checks.push('complaint_rate');
  } catch (e) {
    logger.error('Failed to check complaint rate', e);
  }

  try {
    await checkQueueDepth();
    checks.push('queue_depth');
  } catch (e) {
    logger.error('Failed to check queue depth', e);
  }

  try {
    await checkCircuitBreakers();
    checks.push('circuit_breakers');
  } catch (e) {
    logger.error('Failed to check circuit breakers', e);
  }

  const alertsFired = activeAlerts.size - initialAlertCount;

  logger.info('Alert checks completed', {
    checks: checks.length,
    alertsFired,
    activeAlerts: activeAlerts.size,
  });

  return {
    alertsFired: Math.max(0, alertsFired),
    checks,
  };
}

/**
 * Get alert summary for dashboard
 */
export async function getAlertSummary(): Promise<{
  activeCount: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<string, number>;
  recentAlerts: Alert[];
}> {
  const alerts = getActiveAlerts();

  const bySeverity: Record<AlertSeverity, number> = {
    [AlertSeverity.INFO]: 0,
    [AlertSeverity.WARNING]: 0,
    [AlertSeverity.CRITICAL]: 0,
  };

  const byType: Record<string, number> = {};

  for (const alert of alerts) {
    bySeverity[alert.severity]++;
    byType[alert.type] = (byType[alert.type] || 0) + 1;
  }

  return {
    activeCount: alerts.length,
    bySeverity,
    byType,
    recentAlerts: alerts.slice(0, 10),
  };
}
