import { supabase } from './client'

export type TotpFactor = {
  id: string
  friendlyName: string
}

export type TotpEnrollment = TotpFactor & {
  qrCodeUrl: string
  secret: string
  uri: string
}

function requireClient() {
  if (!supabase) throw new Error('Connected account security is unavailable.')
  return supabase
}

export async function listVerifiedTotpFactors(): Promise<TotpFactor[]> {
  const response = await requireClient().auth.mfa.listFactors()
  if (response.error) throw new Error('Authenticator status could not be loaded.')
  return response.data.totp
    .filter((factor) => factor.status === 'verified')
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? 'Authenticator app',
    }))
}

export async function beginTotpEnrollment(): Promise<TotpEnrollment> {
  const response = await requireClient().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'AURA authenticator',
    issuer: 'AURA',
  })
  if (response.error) throw new Error('Authenticator setup could not be started.')
  const rawQrCode = response.data.totp.qr_code
  return {
    id: response.data.id,
    friendlyName: response.data.friendly_name ?? 'AURA authenticator',
    qrCodeUrl: rawQrCode.startsWith('data:')
      ? rawQrCode
      : `data:image/svg+xml;utf-8,${encodeURIComponent(rawQrCode)}`,
    secret: response.data.totp.secret,
    uri: response.data.totp.uri,
  }
}

export async function verifyTotpEnrollment(factorId: string, code: string) {
  const response = await requireClient().auth.mfa.challengeAndVerify({ factorId, code })
  if (response.error) throw new Error('That verification code could not be confirmed.')
}

export async function discardTotpEnrollment(factorId: string) {
  const response = await requireClient().auth.mfa.unenroll({ factorId })
  if (response.error) throw new Error('Incomplete authenticator setup could not be removed.')
}
