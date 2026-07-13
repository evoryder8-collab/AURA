import { z } from 'zod'
import { appointmentStatuses, intakeStatuses } from './contracts'

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)
const nullableText = (maximum: number) => boundedText(maximum).nullable()
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
const timestamp = z.string().datetime({ offset: true })

export const clientRowSchema = z.object({
  id: z.string().uuid(),
  practice_id: z.string().uuid(),
  auth_user_id: z.string().uuid().nullable(),
  preferred_name: boundedText(120),
  legal_name: nullableText(180),
  email: z.string().max(320).nullable(),
  phone: z.string().max(80).nullable(),
  date_of_birth: dateOnly.nullable(),
  intake_status: z.enum(intakeStatuses),
  active: z.boolean(),
  created_by: z.string().uuid().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const appointmentRowSchema = z.object({
  id: z.string().uuid(),
  practice_id: z.string().uuid(),
  client_id: z.string().uuid(),
  therapist_user_id: z.string().uuid(),
  starts_at: timestamp,
  duration_minutes: z.number().int().min(10).max(480),
  session_type: boundedText(80),
  status: z.enum(appointmentStatuses),
  intake_status_snapshot: z.enum(intakeStatuses),
  requested_by: z.string().uuid().nullable(),
  room: z.string().max(80).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const actorProfileSchema = z.object({
  practice_id: z.string().uuid(),
  role: z.enum(['therapist', 'client']),
})

export const publicTherapistDirectoryRowSchema = z.object({
  practice_name: boundedText(120),
  directory_slug: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/u),
  professional_name: boundedText(160),
  professional_title: nullableText(120),
  public_portrait_path: z.string().max(512).nullable(),
})

export const bookableTherapistRowSchema = z.object({
  user_id: z.string().uuid(),
  directory_slug: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/u),
  professional_name: boundedText(160),
  professional_title: nullableText(120),
  public_portrait_path: z.string().max(512).nullable(),
})

export const createClientSchema = z.object({
  preferredName: boundedText(120),
  legalName: nullableText(180).optional(),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  dateOfBirth: dateOnly.nullable().optional(),
})

export const createAppointmentSchema = z.object({
  clientId: z.string().min(1).max(200),
  therapistUserId: z.string().min(1).max(200).optional(),
  startsAt: timestamp,
  durationMinutes: z.number().int().min(10).max(480),
  sessionType: boundedText(80),
  status: z.enum(appointmentStatuses),
  intakeStatusSnapshot: z.enum(intakeStatuses),
  requestedBy: z.string().min(1).max(200).nullable().optional(),
  room: z.string().max(80).nullable().optional(),
})

export const updateAppointmentSchema = z
  .object({
    startsAt: timestamp.optional(),
    durationMinutes: z.number().int().min(10).max(480).optional(),
    sessionType: boundedText(80).optional(),
    status: z.enum(appointmentStatuses).optional(),
    intakeStatusSnapshot: z.enum(intakeStatuses).optional(),
    room: z.string().max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)
