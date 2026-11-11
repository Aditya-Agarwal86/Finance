import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Empty, ErrorState, PageHeader, Skeleton, Stat, chartTooltipStyle } from '../components/ui'
import { api } from '../lib/api'
import { fmtUsdM, typeColor, typeLabel } from '../lib/format'

const axis = { stroke: '#8a99b8', fontSize: 11 }

export default function Analytics() {
  const ov = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const top = useQuery({ queryKey: ['companies', 'top-value'], queryFn: () => api.companies({ sort: 'value', limit: 8 }) })
  const ev = useQuery({ queryKey: ['model-eval'], queryFn: api.modelEval })

  if (ov.error) return <ErrorState error={ov.error} onRetry={ov.refetch} />
  if (ov.isLoading || !ov.data) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
  const o = ov.data
  const capital = o.capital_by_type.filter((c) => c.total_usd_m !== null).map((c) => ({ ...c, name: typeLabel(c.event_type), value: c.total_usd_m! }))
  const undisclosed = o.capital_by_type.filter((c) => c.total_usd_m === null)
  const status = Object.entries(o.events_by_status).map(([name, value]) => ({ name, value }))
  const valued = (top.data?.items ?? []).filter((c) => c.total_deal_value_usd_m !== null).map((c) => ({ name: c.name, value: c.total_deal_value_usd_m! }))

  return (
    <>
      <PageHeader title="Financial Analytics" subtitle="All figures are derived from deal values stated in the analyzed articles. Undisclosed values are excluded, never counted as zero." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total disclosed value" value={fmtUsdM(o.totals.total_disclosed_value_usd_m)} />
        <Stat label="Events with value" value={`${o.totals.events_with_disclosed_value} / ${o.totals.events}`} />
        <Stat label="Undated events" value={o.totals.undated_events} hint="Excluded from the timeline" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Disclosed capital by event type">
          {capital.length === 0 ? <Empty title="No disclosed values" /> :
            <div className="h-64"><ResponsiveContainer><BarChart data={capital}>
              <CartesianGrid stroke="#1c2842" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={(v) => fmtUsdM(v)} width={60} />
              <Tooltip {...chartTooltipStyle} formatter={(v) => fmtUsdM(Number(v))} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>{capital.map((c) => <Cell key={c.event_type} fill={typeColor(c.event_type)} />)}</Bar>
            </BarChart></ResponsiveContainer></div>}
          {undisclosed.length > 0 && <p className="mt-2 text-xs text-mute">No disclosed value: {undisclosed.map((u) => `${typeLabel(u.event_type)} (${u.count})`).join(', ')}</p>}
        </Card>

        <Card title="Company comparison — disclosed deal value">
          {top.isLoading ? <Skeleton className="h-64" /> : valued.length === 0 ? <Empty title="No companies with disclosed deal values" /> :
            <div className="h-64"><ResponsiveContainer><BarChart data={valued} layout="vertical" margin={{ right: 16 }}>
              <CartesianGrid stroke="#1c2842" horizontal={false} /><XAxis type="number" {...axis} tickFormatter={(v) => fmtUsdM(v)} /><YAxis type="category" dataKey="name" width={120} {...axis} />
              <Tooltip {...chartTooltipStyle} formatter={(v) => fmtUsdM(Number(v))} />
              <Bar dataKey="value" fill="#5b8cff" radius={[0, 6, 6, 0]} />
            </BarChart></ResponsiveContainer></div>}
        </Card>

        <Card title="Event activity by month">
          {o.timeline.length === 0 ? <Empty title="No dated events" /> :
            <div className="h-64"><ResponsiveContainer><LineChart data={o.timeline}>
              <CartesianGrid stroke="#1c2842" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis allowDecimals={false} {...axis} width={30} />
              <Tooltip {...chartTooltipStyle} /><Line type="monotone" dataKey="count" name="Events" stroke="#2dd4a4" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart></ResponsiveContainer></div>}
          <p className="mt-2 text-xs text-mute">{o.totals.undated_events} events carry no extractable date and are not plotted.</p>
        </Card>

        <Card title="Deal status">
          <div className="h-64"><ResponsiveContainer><BarChart data={status}>
            <CartesianGrid stroke="#1c2842" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} width={30} />
            <Tooltip {...chartTooltipStyle} /><Bar dataKey="value" name="Events" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>

      <Card title="Classifier performance (hold-out evaluation on labeled training data)" className="mt-4">
        {ev.isLoading ? <Skeleton className="h-32" /> : ev.error ? <ErrorState error={ev.error} onRetry={ev.refetch} /> : ev.data!.status !== 'ok' ? <Empty title={ev.data!.message ?? 'Unavailable'} /> : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="grid grid-cols-2 gap-3">
              {([['Accuracy', ev.data!.accuracy], ['Precision', ev.data!.precision], ['Recall', ev.data!.recall], ['F1', ev.data!.f1_score]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-panel2/60 p-3"><div className="text-xs text-mute">{k}</div><div className="text-xl font-semibold">{(v * 100).toFixed(1)}%</div></div>))}
              <p className="col-span-2 text-xs text-mute">{ev.data!.test_examples} test / {ev.data!.total_examples} total examples</p>
            </div>
            <div className="overflow-x-auto"><table className="text-xs">
              <thead><tr><th className="p-1.5 text-left text-mute">actual ↓ / predicted →</th>{ev.data!.labels.map((l) => <th key={l} className="p-1.5 text-mute">{typeLabel(l)}</th>)}</tr></thead>
              <tbody>{ev.data!.confusion_matrix.map((row, i) => <tr key={i}><td className="p-1.5 text-mute">{typeLabel(ev.data!.labels[i])}</td>{row.map((v, j) => <td key={j} className="p-1.5 text-center tabular-nums" style={{ background: v ? `rgba(91,140,255,${Math.min(0.15 + v / 12, 0.85)})` : 'transparent' }}>{v}</td>)}</tr>)}</tbody>
            </table></div>
          </div>)}
      </Card>
    </>
  )
}
