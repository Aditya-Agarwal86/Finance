import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Empty, ErrorState, PageHeader, Skeleton, TypeBadge } from '../components/ui'
import { api } from '../lib/api'
import { fmtUsdM, typeLabel } from '../lib/format'

const TYPES = ['ACQUISITION', 'MERGER', 'DIVESTITURE', 'HOSTILE_TAKEOVER', 'EXECUTIVE_CHANGE', 'IPO']
const select = 'rounded-xl border border-line bg-panel px-3 py-2.5 text-sm outline-none focus:border-brand'

export default function Companies() {
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [minV, setMinV] = useState('')
  const [sort, setSort] = useState('events')
  const [dq, setDq] = useState(q)

  useEffect(() => { const t = setTimeout(() => { setDq(q); if (q) setSp({ q }); else setSp({}) }, 300); return () => clearTimeout(t) }, [q, setSp])

  const params = { q: dq, event_type: type, status, min_value_usd_m: minV, sort, limit: 100 }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['companies', params], queryFn: () => api.companies(params) })

  return (
    <>
      <PageHeader title="Company Discovery" subtitle="Every company named in an extracted corporate event." />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by company name…" className={`${select} w-full pl-9`} />
        </div>
        <select aria-label="Event type" className={select} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All event types</option>{TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option><option>Announced</option><option>Completed</option><option>Contested</option>
        </select>
        <select aria-label="Minimum deal value" className={select} value={minV} onChange={(e) => setMinV(e.target.value)}>
          <option value="">Any deal value</option><option value="100">≥ $100M</option><option value="500">≥ $500M</option><option value="1000">≥ $1B</option>
        </select>
        <select aria-label="Sort" className={select} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="events">Most events</option><option value="value">Highest value</option><option value="recent">Most recent</option><option value="name">Name A–Z</option>
        </select>
      </div>

      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div> :
        !data || data.items.length === 0 ? <Empty title="No companies match your filters" hint="Try clearing the search or filters." /> : (
          <>
            <p className="mb-2 text-xs text-mute">{data.total} companies</p>
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-panel2 text-left text-xs uppercase tracking-wider text-mute">
                  <tr><th className="px-4 py-3">Company</th><th className="hidden px-4 py-3 md:table-cell">Event types</th><th className="px-4 py-3 text-right">Events</th><th className="hidden px-4 py-3 text-right sm:table-cell">Deal value</th><th className="hidden px-4 py-3 lg:table-cell">Relationships</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-line bg-panel/60">
                  {data.items.map((c) => (
                    <tr key={c.id} className="transition hover:bg-panel2/70">
                      <td className="px-4 py-3"><Link to={`/companies/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link>{c.entity_type && <div className="text-xs text-mute">{c.entity_type}</div>}</td>
                      <td className="hidden px-4 py-3 md:table-cell"><div className="flex flex-wrap gap-1">{Object.keys(c.event_types).map((t) => <TypeBadge key={t} type={t} />)}</div></td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.event_count}</td>
                      <td className={`hidden px-4 py-3 text-right tabular-nums sm:table-cell ${c.total_deal_value_usd_m === null ? 'text-mute' : ''}`}>{fmtUsdM(c.total_deal_value_usd_m)}</td>
                      <td className="hidden px-4 py-3 text-xs text-mute lg:table-cell">{c.parents.length ? `Parent: ${c.parents[0]}` : c.subsidiaries.length ? `${c.subsidiaries.length} subsidiar${c.subsidiaries.length > 1 ? 'ies' : 'y'}` : '—'}</td>
                      <td className="px-2"><Link to={`/companies/${c.id}`} aria-label={`Open ${c.name}`}><ChevronRight size={16} className="text-mute" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}
    </>
  )
}
