import { buildReportContent, type DoctorReport } from '@/domain/care'
import { hasActiveConsent } from '@/domain/rules'
import type { DemoState } from '@/data/demo/model'
import { demoConsentRecords } from '@/lib/security/demoConsent'
import type { ReportInputs, ReportPhoto } from './model'

const time = (iso: string) => new Date(iso).getTime()

/**
 * A client's photographs in a period, only while their photography consent is on: the same
 * consent `view_photo` requires on the progress photos.
 */
export function photosInPeriod(state: DemoState, clientId: string, from: string, to: string): ReportPhoto[] {
  const client = state.clients.find((item) => item.id === clientId)
  if (!client || !hasActiveConsent(demoConsentRecords(client), clientId, 'photography')) return []
  return state.photos
    .filter((photo) => photo.clientId === clientId && time(photo.capturedAt) >= time(from) && time(photo.capturedAt) <= time(to))
    .map((photo) => ({ id: photo.id, capturedAt: photo.capturedAt, view: photo.view, src: photo.dataUrl }))
}

/**
 * Collects one client's records for a report. Note bodies never pass through here: the report
 * carries its own `noteText`; only the chosen report note's author and date are read, for credit.
 */
export function reportInputs(state: DemoState, report: DoctorReport): ReportInputs {
  const { clientId } = report
  const mine = <T extends { clientId: string }>(items: readonly T[]) => items.filter((item) => item.clientId === clientId)
  const content = buildReportContent({
    report,
    observations: mine(state.observations),
    confirmations: mine(state.confirmations),
    rom: mine(state.rom),
    goals: mine(state.goals),
    goalScores: mine(state.goalScores),
  })
  const therapistNames = Object.fromEntries(state.therapists.map((therapist) => [therapist.id, therapist.displayName]))
  const client = state.clients.find((item) => item.id === clientId)
  const preparer = state.therapists.find((therapist) => therapist.id === report.preparedBy)
  const note = state.notes.find(
    (item) => item.id === report.noteId && item.clientId === clientId && item.visibility === 'report',
  )
  const edited = note !== undefined && note.body.trim() !== report.noteText.trim()
  const preparerName = preparer?.displayName ?? 'Therapist'

  return {
    content,
    client: { name: client?.displayName ?? 'Client', ...(client ? { dateOfBirth: client.dateOfBirth } : {}) },
    preparedBy: { name: preparerName, title: preparer?.professionalTitle ?? 'Massage therapist' },
    therapistNames,
    visits: mine(state.appointments)
      .filter((appointment) => appointment.status === 'completed')
      .map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.startsAt,
        therapistId: appointment.therapistId,
        ...(appointment.arrival ? { arrivalAt: appointment.arrival.completedAt } : {}),
      })),
    ...(note
      ? {
          note: {
            authorName: therapistNames[note.therapistId] ?? 'Therapist',
            writtenAt: note.updatedAt,
            ...(edited ? { editedBy: { name: preparerName, at: report.updatedAt } } : {}),
          },
        }
      : {}),
    photos: report.includePhotos ? photosInPeriod(state, clientId, report.dateFrom, report.dateTo) : [],
  }
}
