import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download } from 'lucide-react'
import type { ContextEvent, DemoAppointment, DemoClient, DemoHandoff } from '@/data/demo/model'
import { HandoffDocument } from './HandoffDocument'

export default function HandoffPdfAction({
  client,
  handoff,
  appointments,
  events,
  filename,
  onGenerated,
}: {
  client: DemoClient
  handoff: DemoHandoff
  appointments: DemoAppointment[]
  events: ContextEvent[]
  filename: string
  onGenerated: () => void
}) {
  return (
    <PDFDownloadLink
      document={
        <HandoffDocument
          client={client}
          handoff={handoff}
          appointments={appointments}
          events={events}
        />
      }
      fileName={filename}
      className="button button--primary button--lg"
      onClick={onGenerated}
    >
      {({ loading }) =>
        loading ? (
          'Preparing PDF…'
        ) : (
          <>
            <Download size={17} /> Generate & download PDF
          </>
        )
      }
    </PDFDownloadLink>
  )
}
