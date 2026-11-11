import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import GraphView from '../components/GraphView'
import { Card, Empty, ErrorState, Skeleton, Stat, TypeBadge, chartTooltipStyle } from '../components/ui'
import { api } from '../lib/api'
import { fmtUsdM, typeColor } from '../lib/format'

export default function CompanyProfile() {
  const { id = '' } = useParams()
  const co = useQuery({ queryKey: ['company', id], queryFn: () => api.company(id) })
  const fin = useQuery({ queryKey: ['fin', id], queryFn: () => api.financials(id) })
  const ana = useQuery({ queryKey: ['ana', id], queryFn: () => api.analysis(id) })
  const gr = useQuery({ queryKey: ['cg', id], queryFn: () => api.companyGraph(id, 1) })

  if (co.error) return <><Link to="/companies" className="mb-4 inline-flex items-center gap-1 text-sm text-mute"><ArrowLeft size={14} />Companies</Link><ErrorState error={co.error} onRetry={co.refetch} /></>
  if (co.isLoading || !co.data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
  const c = co.data
  const f = fin.data
  const chart = (f?.deals ?? []).filter((d) => d.value_usd_m !== null).map((d) => ({ name: d.title.length > 34 ? d.title.slice(0, 33) + '…' : d.title, value: d.value_usd_m!, type: d.event_type }))

  return (
    <>
      <Link to="/companies" className="mb-4 inline-flex items-center gap-1 text-sm text-mute hover:text-ink"><ArrowLeft size={14} />Companies</Link>
      <div className="mb-6 rounded-2xl border border-line bg-gradient-to-br from-panel2 to-panel p-6 fade-up">
        <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mute">
          {c.entity_type && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs">{c.entity_type}</span>}
          {Object.keys(c.event_types).map((t) => <TypeBadge key={t} type={t} />)}
          {c.parents.length > 0 && <span>Parent: {c.parents.join(', ')}</span>}
          {c.subsidiaries.length > 0 && <span>Subsidiaries: {c.subsidiaries.join(', ')}</span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Events" value={c.event_count} />
        <Stat label="Disclosed deal value" value={fmtUsdM(c.total_deal_value_usd_m)} hint={`${c.deals_with_value} of ${c.event_count} events disclose a value`} />
        <Stat label="Capital deployed" value={f ? fmtUsdM(f.capital_deployed_usd_m) : '…'} hint="As acquirer / buyer" />
        <Stat label="Capital received" value={f ? fmtUsdM(f.capital_received_usd_m) : '…'} hint="As target / seller" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Deal values (USD millions)" className="lg:col-span-2">
          {chart.length === 0 ? <Empty title="No disclosed deal values" hint="Events for this company do not state a monetary value." /> :
            <div style={{ height: Math.max(180, chart.length * 52) }}>
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke="#1c2842" horizontal={false} />
                  <XAxis type="number" stroke="#8a99b8" fontSize={11} /><YAxis type="category" dataKey="name" width={130} stroke="#8a99b8" fontSize={10} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => fmtUsdM(Number(v))} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>{chart.map((d, i) => <Cell key={i} fill={typeColor(d.type)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>}
          {f && <p className="mt-3 text-xs text-mute">{f.note}</p>}
        </Card>

        <Card title="NLP-extracted analysis" className="lg:col-span-3">
          {ana.isLoading ? <Skeleton className="h-40" /> : ana.error ? <ErrorState error={ana.error} onRetry={ana.refetch} /> : (
            <div className="space-y-4">
              {ana.data!.analyses.map((a) => (
                <article key={a.event_id} className="rounded-xl border border-line bg-panel2/50 p-4">
                  <div className="flex flex-wrap items-center gap-2"><TypeBadge type={a.event_type} />
                    {a.event_subtype && <span className="text-xs text-mute">{a.event_subtype}</span>}
                    <span className="ml-auto text-xs text-mute">{a.status ?? 'Status n/a'} · {a.date ?? 'Undated'}</span></div>
                  <h4 className="mt-2 text-sm font-semibold">{a.title}</h4>
                  {a.brief && <p className="mt-1 text-sm text-mute">{a.brief}</p>}
                  {a.key_highlights.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-mute">{a.key_highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
                  <div className="mt-3 flex items-center gap-3 text-xs text-mute">
                    {a.classifier_confidence !== null && <span>Classifier confidence <b className="text-ink">{(a.classifier_confidence * 100).toFixed(0)}%</b></span>}
                    {a.source && <span>Source: {a.source}</span>}
                    {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand">Article <ExternalLink size={11} /></a>}
                  </div>
                </article>))}
            </div>)}
        </Card>
      </div>

      {c.people.length > 0 && (
        <Card title="Leadership changes" className="mt-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {c.people.map((p, i) => <li key={i} className="flex items-center gap-3 rounded-xl bg-panel2/60 p-3 text-sm"><User size={16} className="text-mute" /><span><b>{p.name}</b> <span className="text-mute">{p.change} {p.role}</span></span></li>)}
          </ul>
        </Card>)}

      <div className="mt-4">
        <Card title="Relationships">
          {gr.isLoading ? <Skeleton className="h-64" /> : gr.error ? <ErrorState error={gr.error} onRetry={gr.refetch} /> :
            gr.data!.nodes.length === 0 ? <Empty title="No ownership relationships extracted for this company" /> :
              <GraphView data={gr.data!} height={380} centerId={id} />}
        </Card>
      </div>
    </>
  )
}
