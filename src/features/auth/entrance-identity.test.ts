import { createDemoState, createDemoTherapists } from '@/data/demo/fixtures'
import {
  demoIdentities,
  findIdentity,
  initialsOf,
  matchesDemoAccount,
  parseAge,
  portalLanding,
  typedNamePreview,
} from './entrance-identity'

const today = new Date(2026, 10, 23)
const { therapists, clients } = createDemoState(today)

describe('entrance identity rules', () => {
  it('matches a full name regardless of case and spacing, but only with the right age', () => {
    const people = demoIdentities('therapist', therapists, clients)
    expect(findIdentity(people, '  pratana   HALSTRICK ', 35, today)?.id).toBe(
      'demo-therapist-amara',
    )
    expect(findIdentity(people, 'Wassana Schlaepfer', 55, today)?.id).toBe('demo-therapist-sora')
    expect(findIdentity(people, 'Pratana Halstrick', 36, today)).toBeNull()
    expect(findIdentity(people, 'Pratana', 35, today)).toBeNull()
  })

  it('builds therapists with their portrait and clients with who they see', () => {
    const [pratana] = demoIdentities('therapist', therapists, clients)
    expect(pratana).toMatchObject({
      firstName: 'Pratana',
      account: { username: 'pratana', email: 'pratana@aura-demo.invalid' },
      portrait: { hero: 'portraits/pratana-hero.webp' },
    })
    const people = demoIdentities('client', therapists, clients)
    expect(people.map((person) => person.name)).toEqual([
      'Mira Ellison',
      'Noa Lindqvist',
      'Sage Okafor',
    ])
    expect(people[0]?.subtitle).toBe('Sees Pratana and Wassana')
    expect(people[0]).not.toHaveProperty('portrait')
  })

  it('accepts only the matched demo username or email', () => {
    const [pratana] = demoIdentities('therapist', createDemoTherapists(), [])
    if (!pratana) throw new Error('missing fixture')
    expect(matchesDemoAccount(pratana, ' Pratana ')).toBe(true)
    expect(matchesDemoAccount(pratana, 'PRATANA@aura-demo.invalid')).toBe(true)
    expect(matchesDemoAccount(pratana, 'wassana')).toBe(false)
    expect(matchesDemoAccount(pratana, '')).toBe(false)
    expect(matchesDemoAccount(typedNamePreview('Pratana Halstrick'), 'pratana')).toBe(false)
  })

  it('previews a typed name with nothing looked up', () => {
    expect(typedNamePreview('  jamie   rivera ')).toEqual({
      id: 'typed-name-preview',
      name: 'jamie rivera',
      firstName: 'jamie',
    })
    expect(initialsOf('jamie rivera')).toBe('JR')
  })

  it('reads ages as whole years from 1 to 120', () => {
    expect(parseAge('34')).toBe(34)
    expect(['', '0', '121', '3.5', 'abc'].map(parseAge)).toEqual([null, null, null, null, null])
  })

  it('lands each role on its home', () => {
    expect(portalLanding('therapist', true)).toBe('/therapist/today')
    expect(portalLanding('client', true)).toBe('/client/home')
    expect(portalLanding('client', false)).toBe('/client/appointments')
  })
})
