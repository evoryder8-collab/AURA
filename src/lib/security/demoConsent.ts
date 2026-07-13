import type { DemoClient } from '@/data/demo/model'
import type { ConsentRecord, ConsentType } from '@/domain/rules'

const mapping: Record<keyof DemoClient['consents'], ConsentType> = {
  healthData: 'health_data',
  photography: 'photography',
  reminders: 'reminders',
  handoff: 'handoff',
  aiProcessing: 'ai_processing',
}

export function demoConsentRecords(client: DemoClient): ConsentRecord[] {
  return Object.entries(client.consents).map(([key, granted]) => ({
    id: `demo-consent-${client.id}-${key}`,
    clientId: client.id,
    consentType: mapping[key as keyof DemoClient['consents']],
    version: 1,
    granted,
    grantedAt: granted ? new Date(Date.now() - 86_400_000).toISOString() : null,
    revokedAt: null,
  }))
}
