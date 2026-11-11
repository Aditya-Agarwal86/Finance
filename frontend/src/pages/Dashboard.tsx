import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Database, GitBranch, Search, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Empty, ErrorState, PageHeader, Skeleton, Stat, TypeBadge, chartTooltipStyle } from '../components/ui'
import { api } from '../lib/api'
import { fmtUsdM, typeColor, typeLabel } from '../lib/format'

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const [q, setQ] = useState('')
  const nav = useNavigate()

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading || !data) return <div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-72 md:col-span-2" /><Skeleton className="h-72 md:col-span-2" /></div>
  const t = data.totals
  if (t.events === 0)
    return <><PageHeader title="Dashboard" /><Empty title="No events indexed yet" hint="Run the pipeline to ingest and analyze articles." action={<Link to="/pipeline" className="rounded-lg bg-brand px-4 py-2 text-sm">Open Scrape & Analyze</Link>} /></>

  const pie = Object.entries(data.events_by_type).map(([k, v]) => ({ name: k, value: v }))
  const lastRun = data.recent_pipeline_runs[0]

  return (
    <>
      <PageHeader title="Market Intelligence" subtitle="Corporate events detected, classified and structured from financial news."
        right={
          <form onSubmit={(e) => { e.preventDefault(); nav(`/companies?q=${encodeURIComponent(q)}`) }} className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…"
              className="w-full rounded-xl border border-line bg-panel px-9 py-2.5 text-sm outline-none focus:border-brand" />
          </form>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Companies indexed" value={t.companies} hint="Entities named in extracted events" icon={<Building2 size={16} />} />
        <Stat label="Corporate events" value={t.events} hint={`${t.events_with_disclosed_value} with disclosed value`} icon={<Database size={16} />} />
        <Stat label="Disclosed deal value" value={fmtUsdM(t.total_disclosed_value_usd_m)} hint="Sum of disclosed deals, USD-normalized" icon={<Wallet size={16} />} />
        <Stat label="Ownership links" value={t.relationships} hint="Extracted parent → child relations" icon={<GitBranch size={16} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Events by type" className="lg:col-span-1">
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="none">
                  {pie.map((p) => <Cell key={p.name} fill={typeColor(p.name)} />)}
                </Pie>
                <Tooltip {...chartTooltipStyle} formatter={(v, n) => [v, typeLabel(String(n))]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {pie.map((p) => <li key={p.name} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: typeColor(p.name) }} />{typeLabel(p.name)} <b className="ml-auto">{p.value}</b></li>)}
          </ul>
        </Card>

        <Card title="Recent events" className="lg:col-span-2" action={<Link to="/companies" className="flex items-center gap-1 text-xs text-brand">All companies <ArrowRight size={12} /></Link>}>
          <ul className="divide-y divide-line">
            {data.recent_events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <TypeBadge type={e.event_type} />
                <span className="min-w-0 flex-1 truncate text-sm" title={e.title}>{e.title}</span>
                <span className="hidden shrink-0 text-xs text-mute sm:block">{e.value ?? '—'}</span>
                <span className="w-28 shrink-0 text-right text-xs text-mute">{e.date ?? 'Undated'}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Most active companies">
          <ul className="space-y-2">
            {data.most_active_companies.slice(0, 6).map((c) => (
              <li key={c.company_id}>
                <Link to={`/companies/${c.company_id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
                  <span>{c.name}</span><span className="text-xs text-mute">{c.event_count} events</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Top capital deployers (disclosed)">
          {data.top_capital_deployers.length === 0 ? <p className="text-sm text-mute">No acquirers with disclosed deal values.</p> :
            <ul className="space-y-2">
              {data.top_capital_deployers.slice(0, 6).map((c) => (
                <li key={c.company_id}>
                  <Link to={`/companies/${c.company_id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
                    <span>{c.name}</span><span className="text-xs text-good">{fmtUsdM(c.capital_deployed_usd_m)}</span>
                  </Link>
                </li>
              ))}
            </ul>}
        </Card>

        <Card title="Pipeline activity" action={<Link to="/pipeline" className="text-xs text-brand">Run pipeline</Link>}>
          {!lastRun ? <p className="text-sm text-mute">No pipeline runs recorded.</p> :
            <ul className="space-y-2 text-sm">
              {data.recent_pipeline_runs.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg bg-panel2/60 px-3 py-2">
                  <span><b className="capitalize">{r.mode}</b> · {r.articles_count} articles → {r.events_count} events</span>
                  <span className="text-xs text-mute">{r.duration_sec}s</span>
                </li>
              ))}
            </ul>}
          <p className="mt-3 text-xs text-mute">Sources in data: {data.data_provenance.join(', ')}</p>
        </Card>
      </div>
    </>
  )
}
