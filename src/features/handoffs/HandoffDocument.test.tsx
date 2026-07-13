import { renderToBuffer } from '@react-pdf/renderer'
import { addDays, format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { createDemoState } from '@/data/demo/fixtures'
import type { DemoHandoff } from '@/data/demo/model'
import { HandoffDocument } from './HandoffDocument'

describe('HandoffDocument', () => {
  it('renders a scoped PDF with the selected graphs and records', async () => {
    const state = createDemoState()
    const client = state.clients[0]!
    const handoff: DemoHandoff = {
      id: 'handoff-pdf-test',
      clientId: client.id,
      status: 'approved',
      recipientName: 'Dr. Synthetic Recipient',
      recipientOrganization: 'Example Practice',
      purpose: 'Review recorded progress',
      therapistNote: 'Synthetic therapist-reviewed context.',
      dateFrom: format(addDays(new Date(), -90), 'yyyy-MM-dd'),
      dateTo: format(new Date(), 'yyyy-MM-dd'),
      includedSections: [
        'Functional goals',
        'Progress overview',
        'Pain graph',
        'Stiffness graph',
        'ROM graph',
        'Function graph',
        'Session response',
        'Body-map timeline',
        'Recorded interventions',
        'Context events',
        'Pattern observation',
        'Therapist note',
      ],
      includePhotos: false,
      expiresAt: addDays(new Date(), 7).toISOString(),
      createdAt: new Date().toISOString(),
    }

    const buffer = await renderToBuffer(
      <HandoffDocument
        client={client}
        handoff={handoff}
        appointments={state.appointments.filter((item) => item.clientId === client.id)}
        events={state.events.filter((item) => item.clientId === client.id)}
      />,
    )

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    expect(buffer.byteLength).toBeGreaterThan(10_000)
  }, 30_000)
})
