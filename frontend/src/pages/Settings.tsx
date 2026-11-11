import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Globe, Loader2, ShieldCheck } from 'lucide-react'
import { Card, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { API_URL, api } from '../lib/api'

export default function Settings() {
  const feeds = useQuery({ queryKey: ['feeds'], queryFn: api.feeds })
  const live = useQuery({ queryKey: ['sources'], queryFn: api.sources, enabled: false })
  const status = new Map(live.data?.sources.map((s) => [s.name, s]))

  return (
    <>
      <PageHeader title="Settings" subtitle="Where the platform collects its data, and how it behaves while doing so." />
      <Card title="Data sources" action={
        <button onClick={() => live.refetch()} disabled={live.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-panel2">
          {live.isFetching ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}Check connectivity</button>}>
        {feeds.error ? <ErrorState error={feeds.error} onRetry={feeds.refetch} /> : feeds.isLoading || !feeds.data ? <Skeleton className="h-48" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-mute"><tr><th className="py-2">Source</th><th>Website</th><th className="hidden md:table-cell">Method</th><th className="hidden sm:table-cell">Feed URL</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {feeds.data.sources.map((s) => {
                const st = status.get(s.name)
                return (
                  <tr key={s.name}>
                    <td className="py-3 font-medium">{s.name}</td>
                    <td><a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand">{s.domain}<ExternalLink size={11} /></a></td>
                    <td className="hidden text-mute md:table-cell">{s.type}</td>
                    <td className="hidden max-w-[320px] truncate text-xs text-mute sm:table-cell" title={s.url}>{s.url}</td>
                    <td className="text-xs">{st ? (st.reachable ? <span className="text-good">Reachable · {st.articles_available} items</span> : <span className="text-bad">{st.error ?? 'Failed'}</span>) : <span className="text-mute">—</span>}</td>
                  </tr>)
              })}
            </tbody></table></div>)}
        {live.error && <div className="mt-4"><ErrorState error={live.error} /></div>}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Crawler policy">
          {feeds.data && (
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 text-good" /><span><b>robots.txt respected.</b> <span className="text-mute">Article pages disallowed by a site are never downloaded.</span></span></li>
              <li className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 text-good" /><span><b>Polite crawling.</b> <span className="text-mute">{feeds.data.policy.delay_between_articles_sec}s pause between articles.</span></span></li>
              <li className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 text-good" /><span><b>Graceful fallback.</b> <span className="text-mute">{feeds.data.policy.fallback}.</span></span></li>
              <li className="text-xs text-mute">User agent: {feeds.data.policy.user_agent}</li>
            </ul>)}
        </Card>
        <Card title="Processing pipeline">
          <ol className="space-y-2 text-sm text-mute">
            <li><b className="text-ink">1 · Ingest</b> — crawl the feeds above and extract article text</li>
            <li><b className="text-ink">2 · Classify</b> — TF-IDF + logistic regression into 6 corporate-event types</li>
            <li><b className="text-ink">3 · Extract</b> — parties, deal value, dates, executives, briefs</li>
            <li><b className="text-ink">4 · Map</b> — ownership relationships into a company graph</li>
            <li><b className="text-ink">5 · Persist</b> — SQLite history, de-duplicated across runs</li>
          </ol>
          <p className="mt-4 text-xs text-mute">Backend API: {API_URL}</p>
        </Card>
      </div>
    </>
  )
}
