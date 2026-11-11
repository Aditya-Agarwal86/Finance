import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Globe, Loader2, Play, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Empty, ErrorState, PageHeader, TypeBadge } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { fmtDuration, relMeta } from '../lib/format'

const field = 'rounded-xl border border-line bg-panel px-3 py-2.5 text-sm outline-none focus:border-brand'

function PipelineRunner() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'sample' | 'live'>('live')
  const [perFeed, setPerFeed] = useState(10)
  const [retrain, setRetrain] = useState(false)
  const [startedId, setJobId] = useState<string | null>(null)
  // The backend keeps running jobs when you navigate away; on return we re-attach to the latest job.
  const jobsQ = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchOnMount: 'always', staleTime: 0 })
  const jobId = startedId ?? jobsQ.data?.items[0]?.job_id ?? null

  const start = useMutation({
    mutationFn: () => api.runScrape({ mode, per_feed: perFeed, retrain }),
    onSuccess: (j) => { setJobId(j.job_id); qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['health'] }) },
  })
  const job = useQuery({
    queryKey: ['job', jobId], queryFn: () => api.job(jobId!), enabled: !!jobId, staleTime: 0, refetchOnMount: 'always',
    refetchInterval: (q) => (q.state.data && ['completed', 'failed'].includes(q.state.data.status) ? false : 1000),
  })
  const j = job.data
  const running = start.isPending || (!!j && ['queued', 'running'].includes(j.status))
  const done = j?.status === 'completed'
  useEffect(() => {
    if (done) qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'job' })
  }, [done, jobId, qc])

  return (
    <Card title="Run pipeline">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs text-mute">Mode
          <select className={`${field} mt-1 block`} value={mode} onChange={(e) => setMode(e.target.value as 'sample' | 'live')} disabled={running}>
            <option value="live">Live (crawl RSS feeds)</option><option value="sample">Offline (bundled articles)</option>
          </select></label>
        <label className="text-xs text-mute">Articles per feed
          <input type="number" min={1} max={50} className={`${field} mt-1 block w-28`} value={perFeed} onChange={(e) => setPerFeed(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={running || mode === 'sample'} /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={retrain} onChange={(e) => setRetrain(e.target.checked)} disabled={running} /> Retrain classifier</label>
        <button onClick={() => start.mutate()} disabled={running}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand2 px-5 py-2.5 text-sm font-medium disabled:opacity-50">
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}{running ? 'Running…' : 'Run pipeline'}
        </button>
      </div>
      {mode === 'live' && <p className="mt-3 text-xs text-mute">Live mode crawls the real news feeds (about 1 second per article, so 10 per feed takes roughly a minute).</p>}
      {start.error && <div className="mt-4"><ErrorState error={start.error} /></div>}
      {(start.error as ApiError | null)?.status === 409 && <p className="mt-2 text-xs text-mute">Another job is already running; wait for it to finish.</p>}

      {j && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div>
            <ul className="space-y-3">
              {j.stages.map((s) => (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  {s.status === 'completed' ? <CheckCircle2 size={18} className="text-good" /> : s.status === 'running' ? <Loader2 size={18} className="animate-spin text-brand" /> : s.status === 'failed' ? <XCircle size={18} className="text-bad" /> : <Circle size={18} className="text-line" />}
                  <span className={s.status === 'pending' ? 'text-mute' : ''}>{s.name}</span>
                </li>))}
            </ul>
            <div className="mt-4 text-xs text-mute">Job {j.job_id} · {j.status} · {fmtDuration(j.started_at, j.finished_at ?? Date.now() / 1000)}</div>
            {j.status === 'completed' && <div className="mt-3 flex gap-2"><Link to="/" className="rounded-lg bg-good/15 px-3 py-1.5 text-xs text-good">View dashboard</Link><Link to="/graph" className="rounded-lg bg-brand/15 px-3 py-1.5 text-xs text-brand">View graph</Link></div>}
            {j.status === 'failed' && <p className="mt-3 rounded-lg bg-bad/10 p-3 text-xs text-bad">{j.error}</p>}
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl border border-line bg-bg p-3 text-[11.5px] leading-relaxed">
            {j.logs.length === 0 ? 'Waiting for output…' : j.logs.map((l, i) => <div key={i} className={l.level === 'ERROR' ? 'text-bad' : 'text-mute'}><span className="text-line">{l.t}</span> {l.message}</div>)}
          </pre>
        </div>)}
    </Card>
  )
}

function Sources() {
  const q = useQuery({ queryKey: ['sources'], queryFn: api.sources, enabled: false })
  return (
    <Card title="News source connectivity" action={<button onClick={() => q.refetch()} disabled={q.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-panel2">{q.isFetching ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}Check live feeds</button>}>
      {q.error ? <ErrorState error={q.error} /> : !q.data ? <p className="text-sm text-mute">Runs real network requests (robots.txt + RSS fetch) against each configured source.</p> : (
        <table className="w-full text-sm"><thead className="text-left text-xs text-mute"><tr><th className="py-1">Source</th><th>HTTP</th><th>Articles</th><th>robots.txt</th><th>Result</th></tr></thead>
          <tbody className="divide-y divide-line">{q.data.sources.map((s) => (
            <tr key={s.name}><td className="py-2">{s.name}</td><td>{s.http_status ?? '—'}</td><td>{s.articles_available}</td><td>{s.robots}</td>
              <td className={s.reachable ? 'text-good' : 'text-bad'}>{s.reachable ? 'Reachable' : s.error ?? 'Failed'}</td></tr>))}</tbody></table>)}
    </Card>
  )
}

function TextAnalyzer() {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const m = useMutation({ mutationFn: () => api.analyzeText(title, text) })
  const r = m.data
  return (
    <Card title="Analyze an article (live NLP)">
      <div className="space-y-3">
        <input className={`${field} w-full`} placeholder="Headline, e.g. Acme Corp to acquire Beta Ltd for $500 million" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={`${field} h-28 w-full`} placeholder="Article text (optional but improves extraction)…" value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={() => m.mutate()} disabled={title.trim().length < 3 || m.isPending} className="inline-flex items-center gap-2 rounded-xl bg-brand/90 px-4 py-2 text-sm disabled:opacity-50">{m.isPending && <Loader2 size={14} className="animate-spin" />}Analyze</button>
      </div>
      {m.error && <div className="mt-4"><ErrorState error={m.error} /></div>}
      {r && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3"><TypeBadge type={r.classification.event_type} /><span className="text-sm">{r.classification.event_subtype}</span>
            <span className="text-xs text-mute">confidence {(r.classification.confidence * 100).toFixed(0)}% · {r.classification.is_corporate_event ? 'corporate event' : 'not a corporate event'}</span></div>
          {r.events.length === 0 && <Empty title="No structured event extracted" />}
          {r.events.map((e, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel2/50 p-4 text-sm">
              <p>{e.event_brief}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {([['Acquirer', e.acquirer], ['Target', e.target], ['Seller', e.seller], ['Buyer', e.buyer], ['Deal value', e.deal_value], ['Structure', e.deal_structure], ['Date', e.event_date], ['Status', e.status]] as const).map(([k, v]) => (
                  <div key={k}><dt className="text-mute">{k}</dt><dd>{v ?? '—'}</dd></div>))}
              </dl>
            </div>))}
          {r.relationships.edges.length > 0 && (
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Relationships mined</p>
              <ul className="space-y-1 text-sm">{r.relationships.edges.map((e, i) => <li key={i}><span style={{ color: relMeta(e.relation).color }}>●</span> {e.source_name} → {e.target_name} <span className="text-xs text-mute">({e.evidence}{e.deal_value ? `, ${e.deal_value}` : ''})</span></li>)}</ul></div>)}
        </div>)}
    </Card>
  )
}

export default function Pipeline() {
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs })
  return (
    <>
      <PageHeader title="Scrape & Analyze" subtitle="Runs the original crawl → classify → extract → graph pipeline on the backend." />
      <div className="space-y-4">
        <PipelineRunner />
        <div className="grid gap-4 lg:grid-cols-2"><Sources /><TextAnalyzer /></div>
        {jobs.data && jobs.data.items.length > 0 && (
          <Card title="Jobs this session"><ul className="space-y-1 text-sm">{jobs.data.items.map((j) => <li key={j.job_id} className="flex justify-between"><span>{j.job_id} · {j.mode}</span><span className={j.status === 'failed' ? 'text-bad' : 'text-mute'}>{j.status}</span></li>)}</ul></Card>)}
      </div>
    </>
  )
}
