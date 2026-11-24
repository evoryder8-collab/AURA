import type { DemoAppointment } from '@/data/demo/model'

/**
 * Session Mode and Finish share this one rule. Only the booking's therapist runs a session,
 * because its Bonus Care is credited to them.
 */
export function canRunSession(
  appointment: DemoAppointment | undefined,
  therapistId: string | null | undefined,
): appointment is DemoAppointment {
  return Boolean(appointment && therapistId && appointment.therapistId === therapistId)
}
