import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { createDemoRepositories } from './demo'
import { AuraRepositoryError } from './errors'
import { createAuraRepositories } from './factory'
import { createSupabaseRepositories } from './supabase'

type FakeResponse = { data: unknown; error: unknown }
type QueryCall = { method: string; arguments: readonly unknown[] }

class FakeQuery implements PromiseLike<FakeResponse> {
  readonly calls: QueryCall[] = []
  private readonly response: FakeResponse

  constructor(response: FakeResponse) {
    this.response = response
  }

  select(...args: readonly unknown[]) {
    return this.record('select', args)
  }

  order(...args: readonly unknown[]) {
    return this.record('order', args)
  }

  eq(...args: readonly unknown[]) {
    return this.record('eq', args)
  }

  in(...args: readonly unknown[]) {
    return this.record('in', args)
  }

  gte(...args: readonly unknown[]) {
    return this.record('gte', args)
  }

  lt(...args: readonly unknown[]) {
    return this.record('lt', args)
  }

  insert(...args: readonly unknown[]) {
    return this.record('insert', args)
  }

  update(...args: readonly unknown[]) {
    return this.record('update', args)
  }

  async maybeSingle() {
    return this.response
  }

  async single() {
    return this.response
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected)
  }

  private record(method: string, args: readonly unknown[]) {
    this.calls.push({ method, arguments: args })
    return this
  }
}

function fakeSupabase(query: FakeQuery) {
  return {
    from: vi.fn(() => query),
  } as unknown as SupabaseClient
}

describe('demo repositories', () => {
  beforeEach(() => {
    useDemoStore.setState({ ...createDemoState(), hydrated: true })
  })

  it('reads a detached snapshot and applies core client and appointment writes', async () => {
    const repositories = createDemoRepositories()
    const createdClient = await repositories.clients.create({
      preferredName: 'Atlas Demo',
      email: 'atlas@example.invalid',
      phone: '+00 000 000 0999',
    })
    const createdAppointment = await repositories.appointments.create({
      clientId: createdClient.id,
      startsAt: '2026-08-10T12:00:00.000Z',
      durationMinutes: 60,
      sessionType: 'First visit',
      status: 'pending',
      intakeStatusSnapshot: 'pending',
      room: 'Studio',
    })
    const updated = await repositories.appointments.update(createdAppointment.id, {
      status: 'confirmed',
      durationMinutes: 75,
    })
    const snapshot = await repositories.readSnapshot()

    expect(createdClient.source).toBe('demo')
    expect(updated).toMatchObject({ status: 'confirmed', durationMinutes: 75 })
    expect(snapshot.mode).toBe('demo')
    expect(snapshot.clients.some((client) => client.id === createdClient.id)).toBe(true)
    expect(snapshot.appointments.some((appointment) => appointment.id === updated.id)).toBe(true)
    expect(snapshot.capturedAt).toMatch(/Z$/u)
  })

  it('validates writes without exposing supplied record values in errors', async () => {
    const repositories = createDemoRepositories()
    try {
      await repositories.clients.create({ preferredName: 'private value'.repeat(20) })
      expect.unreachable('invalid input should reject')
    } catch (error) {
      expect(error).toBeInstanceOf(AuraRepositoryError)
      expect(error).toMatchObject({ code: 'invalid_input', operation: 'clients.create' })
      expect((error as Error).message).not.toContain('private value')
    }
  })
})

describe('Supabase repositories', () => {
  it('maps schema-shaped client rows and selects no therapist-private columns', async () => {
    const query = new FakeQuery({
      data: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          practice_id: '10000000-0000-4000-8000-000000000001',
          auth_user_id: '30000000-0000-4000-8000-000000000001',
          preferred_name: 'Synthetic Client',
          legal_name: null,
          email: 'synthetic@example.invalid',
          phone: null,
          date_of_birth: '1990-01-01',
          intake_status: 'complete',
          active: true,
          created_by: '20000000-0000-4000-8000-000000000001',
          created_at: '2026-07-13T12:00:00.000Z',
          updated_at: '2026-07-13T12:00:00.000Z',
        },
      ],
      error: null,
    })
    const repositories = createSupabaseRepositories(fakeSupabase(query))
    const records = await repositories.clients.list({
      active: true,
      intakeStatuses: ['complete'],
    })
    const selectedColumns = String(
      query.calls.find((call) => call.method === 'select')?.arguments[0],
    )

    expect(records[0]).toMatchObject({
      source: 'supabase',
      preferredName: 'Synthetic Client',
      intakeStatus: 'complete',
    })
    expect(selectedColumns).not.toMatch(/private|note|restriction/u)
    expect(query.calls).toContainEqual({ method: 'eq', arguments: ['active', true] })
    expect(query.calls).toContainEqual({
      method: 'in',
      arguments: ['intake_status', ['complete']],
    })
  })

  it('turns malformed provider data into a privacy-safe response error', async () => {
    const query = new FakeQuery({
      data: [{ id: 'not-a-uuid', email: 'do-not-echo@example.invalid' }],
      error: null,
    })
    const repositories = createSupabaseRepositories(fakeSupabase(query))

    try {
      await repositories.clients.list()
      expect.unreachable('malformed provider data should reject')
    } catch (error) {
      expect(error).toBeInstanceOf(AuraRepositoryError)
      expect(error).toMatchObject({ code: 'invalid_response', operation: 'clients.list' })
      expect((error as Error).message).not.toContain('do-not-echo')
    }
  })

  it('routes client appointment requests and cancellations through narrow RPCs', async () => {
    const userId = '30000000-0000-4000-8000-000000000001'
    const therapistId = '20000000-0000-4000-8000-000000000001'
    const appointmentId = '50000000-0000-4000-8000-000000000001'
    const appointment = {
      id: appointmentId,
      practice_id: '10000000-0000-4000-8000-000000000001',
      client_id: '40000000-0000-4000-8000-000000000001',
      therapist_user_id: therapistId,
      starts_at: '2026-08-10T12:00:00.000Z',
      duration_minutes: 60,
      session_type: 'Restorative massage',
      status: 'requested',
      intake_status_snapshot: 'complete',
      requested_by: userId,
      room: null,
      created_at: '2026-07-13T12:00:00.000Z',
      updated_at: '2026-07-13T12:00:00.000Z',
    }
    const profileQuery = new FakeQuery({
      data: { practice_id: appointment.practice_id, role: 'client' },
      error: null,
    })
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'cancel_appointment' ? { ...appointment, status: 'cancelled' } : appointment,
      error: null,
    }))
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
      from: vi.fn(() => profileQuery),
      rpc,
    } as unknown as SupabaseClient
    const repositories = createSupabaseRepositories(client)

    const created = await repositories.appointments.create({
      clientId: appointment.client_id,
      therapistUserId: therapistId,
      startsAt: appointment.starts_at,
      durationMinutes: appointment.duration_minutes,
      sessionType: appointment.session_type,
      status: 'requested',
      intakeStatusSnapshot: 'complete',
    })
    const cancelled = await repositories.appointments.update(appointmentId, {
      status: 'cancelled',
    })

    expect(created.status).toBe('requested')
    expect(cancelled.status).toBe('cancelled')
    expect(rpc).toHaveBeenNthCalledWith(1, 'request_appointment', {
      requested_therapist_user_id: therapistId,
      requested_starts_at: appointment.starts_at,
      requested_duration_minutes: appointment.duration_minutes,
      requested_session_type: appointment.session_type,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'cancel_appointment', {
      target_appointment_id: appointmentId,
    })
  })
})

describe('repository factory', () => {
  it('fails closed when connected mode has no Supabase client', () => {
    expect(() => createAuraRepositories({ mode: 'supabase', supabaseClient: null })).toThrowError(
      AuraRepositoryError,
    )
  })
})
