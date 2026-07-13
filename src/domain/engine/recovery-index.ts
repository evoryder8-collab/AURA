import { PROTOTYPE_V1_CONFIG } from './config'
import { normalizePain, normalizeRom, normalizeStiffness } from './normalization'
import {
  RECOVERY_STREAMS,
  type RecoveryIndexInput,
  type RecoveryIndexResult,
  type RecoveryIndexWeights,
  type RecoveryStream,
} from './types'

const ROUNDING_FACTOR = 100

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * ROUNDING_FACTOR) / ROUNDING_FACTOR
}

function validateWeights(weights: RecoveryIndexWeights): void {
  const values = RECOVERY_STREAMS.map((stream) => weights[stream])
  if (values.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError('Recovery Index weights must be finite and non-negative.')
  }
  if (values.every((weight) => weight === 0)) {
    throw new RangeError('At least one Recovery Index weight must be positive.')
  }
}

export function computeRecoveryIndex(
  input: RecoveryIndexInput,
  weights: RecoveryIndexWeights = PROTOTYPE_V1_CONFIG.recoveryWeights,
): RecoveryIndexResult {
  validateWeights(weights)

  const favourableScores: Record<RecoveryStream, number | null> = {
    pain: input.pain == null ? null : normalizePain(input.pain),
    stiffness: input.stiffness == null ? null : normalizeStiffness(input.stiffness),
    rom: input.rom == null ? null : normalizeRom(input.rom),
  }

  const includedStreams = RECOVERY_STREAMS.filter(
    (stream) => favourableScores[stream] != null && weights[stream] > 0,
  )
  const missingStreams = RECOVERY_STREAMS.filter((stream) => !includedStreams.includes(stream))
  const availableWeight = includedStreams.reduce((total, stream) => total + weights[stream], 0)

  const appliedWeights: Record<RecoveryStream, number> = {
    pain: 0,
    stiffness: 0,
    rom: 0,
  }

  if (availableWeight === 0) {
    return {
      score: null,
      favourableScores,
      appliedWeights,
      availableWeight,
      includedStreams,
      missingStreams,
    }
  }

  let score = 0
  for (const stream of includedStreams) {
    const appliedWeight = weights[stream] / availableWeight
    const favourableScore = favourableScores[stream]
    appliedWeights[stream] = round(appliedWeight)
    if (favourableScore != null) {
      score += favourableScore * appliedWeight
    }
  }

  return {
    score: round(score),
    favourableScores,
    appliedWeights,
    availableWeight: round(availableWeight),
    includedStreams,
    missingStreams,
  }
}
