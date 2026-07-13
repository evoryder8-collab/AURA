import { z } from 'zod'
import { supabase } from './client'

const inspectionSchema = z.object({
  recipientName: z.string().min(1).max(160),
  recipientOrganization: z.string().max(160).nullable(),
  purpose: z.string().min(1).max(500),
  includedSections: z.array(z.string().min(1).max(120)).max(32),
  expiresAt: z.iso.datetime(),
  downloadAvailable: z.literal(true),
})

export type SecureHandoffInspection = z.infer<typeof inspectionSchema>

function requireClient() {
  if (!supabase) throw new Error('Link unavailable or expired.')
  return supabase
}

export async function inspectSecureHandoff(token: string): Promise<SecureHandoffInspection> {
  const response = await requireClient().functions.invoke('secure-handoff', {
    body: { action: 'inspect', token },
  })
  if (response.error) throw new Error('Link unavailable or expired.')
  const parsed = inspectionSchema.safeParse(response.data)
  if (!parsed.success) throw new Error('Link unavailable or expired.')
  return parsed.data
}

export async function downloadSecureHandoff(token: string): Promise<Blob> {
  const response = await requireClient().functions.invoke('secure-handoff', {
    body: { action: 'download', token },
  })
  if (response.error || !(response.data instanceof Blob)) {
    throw new Error('Document unavailable or expired.')
  }
  return response.data
}

export async function respondToSecureHandoff(
  token: string,
  response: {
    respondentName?: string
    organization?: string
    message: string
    contactPreference: 'none' | 'email' | 'phone'
  },
) {
  const result = await requireClient().functions.invoke('secure-handoff', {
    body: { action: 'respond', token, response },
  })
  if (result.error || result.data?.submitted !== true) {
    throw new Error('The response could not be submitted.')
  }
}
