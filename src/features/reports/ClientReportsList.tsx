import { ChevronRight, FileText } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { useDemoStore } from '@/data/demo/store'
import type { DoctorReport } from '@/domain/care'
import { fmtMed } from './model'
import './report.css'

const STATUS: Record<Exclude<DoctorReport['status'], 'draft'>, { label: string; tone: 'gold' | 'favourable' | 'neutral' }> = {
  awaiting_consent: { label: 'Awaiting your review', tone: 'gold' },
  consented: { label: 'Shared', tone: 'favourable' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

/** The client's own reports for a doctor, newest first. Drafts stay with the therapist. */
export function ClientReportsList({ clientId }: { clientId: string }) {
  const reports = useDemoStore((state) => state.reports)
  const therapists = useDemoStore((state) => state.therapists)
  const mine = useMemo(
    () =>
      reports
        .filter((report) => report.clientId === clientId && report.status !== 'draft')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [reports, clientId],
  )
  return (
    <section className="stack" aria-labelledby="client-reports-title">
      <h2 className="title-md" id="client-reports-title">
        Reports for a doctor
      </h2>
      {mine.length ? (
        <ul className="list report-links">
          {mine.map((report) => {
            if (report.status === 'draft') return null
            const status = STATUS[report.status]
            const preparer = therapists.find((therapist) => therapist.id === report.preparedBy)
            return (
              <li key={report.id}>
                <Link to={`/client/reports/${report.id}`} className="report-link">
                  <FileText size={20} aria-hidden="true" />
                  <span className="report-link__text">
                    <strong>For {report.recipient}</strong>
                    <span>
                      {preparer ? `${preparer.displayName} · ` : ''}
                      {fmtMed(report.updatedAt)}
                    </span>
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">When a therapist prepares a report for your doctor, it appears here for you to read before anything is shared.</p>
      )}
    </section>
  )
}
