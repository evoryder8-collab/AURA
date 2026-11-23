import type { DemoClient, DemoPortrait, DemoTherapist } from '@/data/demo/model'
import type { AuraRole } from './auth-context'
import { getIdentityAge, type IdentityCandidate } from './identity'

/** Who the sign-in shows: a matched synthetic demo person, or in connected mode only the typed name. */
export type EntranceIdentity = IdentityCandidate & {
  firstName: string
  /** Synthetic demo accounts only: what the credential step accepts. */
  account?: { username: string; email: string }
  portrait?: DemoPortrait
}

export const MIN_DEMO_PASSWORD = 8

/** Fills the demo form; any 8+ characters work and nothing leaves the browser. */
export const DEMO_PASSWORD = 'synthetic-demo'

export const tidyName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ')
const nameKey = (value: string) => tidyName(value).toLocaleLowerCase()

export function parseAge(value: string) {
  const age = Number(value)
  return value.trim() && Number.isInteger(age) && age >= 1 && age <= 120 ? age : null
}

const listNames = (names: string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

export function demoIdentities(
  role: AuraRole,
  therapists: readonly DemoTherapist[],
  clients: readonly DemoClient[],
): EntranceIdentity[] {
  if (role === 'therapist') {
    return therapists.map((therapist) => ({
      id: therapist.id,
      name: therapist.displayName,
      firstName: therapist.preferredName,
      dateOfBirth: therapist.dateOfBirth,
      subtitle: therapist.professionalTitle,
      account: { username: therapist.username, email: therapist.email },
      ...(therapist.portrait ? { portrait: therapist.portrait } : {}),
    }))
  }
  return clients.map((client) => {
    const seeing = therapists
      .filter((therapist) => client.assignedTherapistIds.includes(therapist.id))
      .map((therapist) => therapist.preferredName)
    return {
      id: client.id,
      name: client.displayName,
      firstName: client.preferredName,
      dateOfBirth: client.dateOfBirth,
      subtitle: seeing.length ? `Sees ${listNames(seeing)}` : 'Client',
      account: { username: client.username, email: client.email },
    }
  })
}

/** Exact name (ignoring case and spacing) and current age; one answer for every miss. */
export function findIdentity(
  candidates: readonly EntranceIdentity[],
  name: string,
  age: number,
  today = new Date(),
) {
  const wanted = nameKey(name)
  return (
    candidates.find(
      (candidate) => nameKey(candidate.name) === wanted && getIdentityAge(candidate, today) === age,
    ) ?? null
  )
}

/** Connected mode never looks anyone up before sign-in: the preview is the typed name and nothing else. */
export function typedNamePreview(name: string): EntranceIdentity {
  const tidy = tidyName(name)
  return { id: 'typed-name-preview', name: tidy, firstName: tidy.split(' ')[0] ?? tidy }
}

export function matchesDemoAccount(identity: EntranceIdentity, identifier: string) {
  const value = identifier.trim().toLocaleLowerCase()
  const account = identity.account
  return Boolean(
    account &&
    value &&
    (value === account.username.toLocaleLowerCase() || value === account.email.toLocaleLowerCase()),
  )
}

export const initialsOf = (name: string) =>
  tidyName(name)
    .split(' ')
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase() ?? '')
    .join('')

export function portalLanding(role: AuraRole, demoMode: boolean) {
  if (role === 'therapist') return '/therapist/today'
  return demoMode ? '/client/home' : '/client/appointments'
}
