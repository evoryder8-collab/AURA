import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Search,
  SlidersHorizontal,
  Target,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { ProgressRing } from '@/components/design-system/ProgressRing'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { clientsAssignedToTherapist } from '@/data/demo/team'
import { deriveClientMetrics } from '@/data/demo/derive'
import { useAuth } from '@/features/auth/auth-context'
import { formatDay, patternLabel } from '@/lib/formatting/labels'
import { ConnectedClientsPage } from './ConnectedClientsPage'

type Filter = 'all' | 'pending' | 'caution' | 'goal' | 'review'

export function ClientsPage() {
  return env.demoMode ? <DemoClientsPage /> : <ConnectedClientsPage />
}

function DemoClientsPage() {
  const auth = useAuth()
  const allClients = useDemoStore((state) => state.clients)
  const appointments = useDemoStore((state) => state.appointments)
  const therapists = useDemoStore((state) => state.therapists)
  const therapist = therapists.find((item) => item.id === auth.demoTherapistId)
  const clients = clientsAssignedToTherapist(
    { clients: allClients, therapists },
    auth.demoTherapistId,
  )
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'name' | 'recovery' | 'next'>('next')
  const navigate = useNavigate()

  const results = useMemo(() => {
    return [...clients]
      .filter((client) => client.displayName.toLowerCase().includes(query.toLowerCase()))
      .filter((client) => {
        if (filter === 'pending') return client.intakeStatus !== 'complete'
        if (filter === 'caution') return Boolean(client.caution)
        if (filter === 'goal') return client.goals.some((goal) => goal.status === 'active')
        if (filter === 'review') return client.reviewProgress
        return true
      })
      .sort((a, b) =>
        sort === 'name'
          ? a.preferredName.localeCompare(b.preferredName)
          : sort === 'recovery'
            ? deriveClientMetrics(b).recoveryIndex - deriveClientMetrics(a).recoveryIndex
            : (appointments.find((item) => item.clientId === a.id)?.startsAt ?? '').localeCompare(
                appointments.find((item) => item.clientId === b.id)?.startsAt ?? '',
              ),
      )
  }, [appointments, clients, filter, query, sort])

  return (
    <div>
      <PageHeader
        eyebrow={`${therapist?.preferredName ?? 'Your'} · assigned client records`}
        title={
          <>
            Every journey,
            <br />
            held clearly.
          </>
        }
        lead={`${clients.length} active fictional demo records · therapist-private detail remains separated from client-safe views`}
      />
      <div className="client-toolbar">
        <label className="client-search">
          <Search size={18} />
          <span className="sr-only">Search clients</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fictional clients…"
          />
        </label>
        <div className="filter-row" role="group" aria-label="Filter clients">
          {(['all', 'pending', 'caution', 'goal', 'review'] as Filter[]).map((item) => (
            <button
              key={item}
              className={filter === item ? 'is-active' : ''}
              onClick={() => setFilter(item)}
            >
              {item === 'all'
                ? 'All clients'
                : item === 'goal'
                  ? 'Active goal'
                  : item === 'review'
                    ? 'Review progress'
                    : item[0]?.toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <label className="sort-select">
          <SlidersHorizontal size={16} />
          <span className="sr-only">Sort clients</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="next">Next appointment</option>
            <option value="name">Name</option>
            <option value="recovery">Recovery Index</option>
          </select>
        </label>
      </div>
      <section className="client-grid" aria-live="polite">
        {results.map((client) => {
          const derived = deriveClientMetrics(client)
          const clientAppointments = appointments
            .filter((item) => item.clientId === client.id)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          const next = clientAppointments.find(
            (item) => new Date(item.startsAt) >= new Date() && item.status !== 'cancelled',
          )
          const last = [...clientAppointments].reverse().find((item) => item.status === 'completed')
          const latestPain = client.metrics.at(-1)?.pain
          return (
            <Card
              key={client.id}
              className="client-card"
              interactive
              onClick={() => navigate(`/therapist/clients/${client.id}`)}
            >
              <div className="client-card__top">
                <div className="client-avatar">{client.preferredName[0]}</div>
                <div className="client-card__identity">
                  <div>
                    {client.intakeStatus !== 'complete' && (
                      <Badge tone="pending">Pending Intake</Badge>
                    )}
                    {client.reviewProgress && (
                      <Badge tone="concern" icon={<AlertTriangle size={12} />}>
                        Review
                      </Badge>
                    )}
                  </div>
                  <h2>{client.preferredName}</h2>
                  <span>{client.phase}</span>
                </div>
                <ProgressRing size={84} value={derived.recoveryIndex} label="Recovery Index" />
              </div>
              {client.caution && (
                <div className="client-caution">
                  <AlertTriangle size={15} />
                  <span>{client.caution.label}</span>
                </div>
              )}
              <div className="client-card__metrics">
                <div>
                  <span>Latest pain</span>
                  <strong>
                    {latestPain ?? '—'}
                    <small>/10</small>
                  </strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>
                    {derived.confidence}
                    <small>%</small>
                  </strong>
                </div>
                <div>
                  <span>Pattern</span>
                  <strong className="client-card__pattern">{patternLabel[derived.pattern]}</strong>
                </div>
              </div>
              <div className="client-card__goal">
                <Target size={16} />
                <div>
                  <span>Active goal</span>
                  <strong>{client.goals[0]?.wording ?? 'No active goal yet'}</strong>
                </div>
              </div>
              <div className="client-card__dates">
                <div>
                  <CalendarDays size={14} />
                  <span>Next</span>
                  <strong>{next ? formatDay(next.startsAt) : 'Not booked'}</strong>
                </div>
                <div>
                  <span>Last</span>
                  <strong>{last ? formatDay(last.startsAt) : 'Building baseline'}</strong>
                </div>
              </div>
              <Button
                className="client-card__open"
                variant="ghost"
                size="sm"
                iconAfter={<ArrowUpRight size={15} />}
                onClick={(event) => {
                  event.stopPropagation()
                  navigate(`/therapist/clients/${client.id}`)
                }}
              >
                Open dashboard
              </Button>
            </Card>
          )
        })}
      </section>
      {!results.length && (
        <Card tone="soft" className="empty-results">
          <Search size={24} />
          <h2>No matching records</h2>
          <p>Change the search or filter to see another synthetic client.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('')
              setFilter('all')
            }}
          >
            Clear filters
          </Button>
        </Card>
      )}
    </div>
  )
}
