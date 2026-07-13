import { classifyPattern } from '@/domain/engine'
import type { DemoClient } from './model'

export function deriveClientMetrics(client: DemoClient) {
  const result = classifyPattern(
    client.metrics.map((point) => ({
      id: point.id,
      observedAt: point.recordedAt,
      pain: point.pain,
      stiffness: point.stiffness,
      rom: { value: point.rom, method: 'synthetic-scale-v1' },
      functionalAbility: point.function,
      ...(point.events
        ? {
            contextEvents: point.events.map((event, index) => ({
              id: `${point.id}-event-${index}`,
              type: event,
              occurredAt: point.recordedAt,
            })),
          }
        : {}),
    })),
  )

  return {
    result,
    pattern: result.pattern,
    confidence: result.confidence.score,
    recoveryIndex: result.evidence.includedPoints.at(-1)?.recoveryIndex ?? 0,
  }
}
