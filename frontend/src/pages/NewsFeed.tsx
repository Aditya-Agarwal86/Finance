import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Search, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, ErrorState, PageHeader, Skeleton, TypeBadge } from '../components/ui'
import { api, type EventRow } from '../lib/api'
import { fmtUsdM, typeColor, typeLabel } from '../lib/format'
import { slugify } from '../lib/slug'

const TYPES = ['ALL', 'ACQUISITION', 'MERGER', 'DIVESTITURE', 'HOSTILE_TAKEOVER', 'EXECUTIVE_CHANGE', 'IPO']
const parties = (e: EventRow) => [e.acquirer, e.target, e.seller, e.buyer, ...(e.companies ?? [])].filter((x, i, a): x is string => !!x && a.indexOf(x) === i)

function Dossier({ e, onClose }: { e: EventRow; onClose: () => void }) {
  useEffect(() => { const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative h-full w-full max-w-lg overflow-y-auto border-l border-line bg-panel p-6 fade-up">
        <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 text-mute hover:text-ink"><X /></button>
        <TypeBadge type={e.event_type} />
        <h2 className="mt-3 pr-8 text-lg font-semibold leading-snug">{e.title}</h2>
        <p className="mt-1 text-xs text-mute">{e.event_subtype}</p>
        {e.event_brief && <p className="mt-4 text-sm leading-relaxed text-ink/90">{e.event_brief}</p>}
        {e.key_highlights?.length > 0 && <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-mute">{e.key_highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {([['Acquirer', e.acquirer], ['Target', e.target], ['Seller', e.seller], ['Buyer', e.buyer], ['Deal value', e.deal_value], ['USD equivalent', e.numeric_value_usd_m !== null ? fmtUsdM(e.numeric_value_usd_m) : null],
            ['Structure', e.deal_structure], ['Status', e.status], ['Date', e.event_date], ['Expected timeline', e.effective_timeline], ['Classifier confidence', e.confidence !== null ? `${(e.confidence * 100).toFixed(0)}%` : null], ['Source', e.source]] as const)
            .map(([k, v]) => <div key={k} className="rounded-lg bg-panel2/60 p-3"><dt className="text-[11px] uppercase tracking-wider text-mute">{k}</dt><dd className="mt-0.5">{v ?? '—'}</dd></div>)}
        </dl>
        {e.people?.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">People</p>
          {e.people.map((p, i) => <div key={i} className="flex items-center gap-2 text-sm"><Users size={14} className="text-mute" />{p.name} <span className="text-mute">{p.change} {p.role}</span></div>)}</div>}
        <div className="mt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Companies</p>
          <div className="flex flex-wrap gap-2">{parties(e).map((c) => <Link key={c} to={`/companies/${slugify(c)}`} className="rounded-full border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand">{c}</Link>)}</div></div>
        {e.raw_text_snippet && <blockquote className="mt-5 border-l-2 border-line pl-4 text-xs italic leading-relaxed text-mute">{e.raw_text_snippet}</blockquote>}
        {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1 text-sm text-brand">Read source article <ExternalLink size={13} /></a>}
      </aside>
    </div>
  )
}

export default function NewsFeed() {
  const [type, setType] = useState('ALL')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [open, setOpen] = useState<EventRow | null>(null)
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t) }, [q])

  const params = { event_type: type === 'ALL' ? '' : type, keyword: dq, sort, limit: 200 }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['events', params], queryFn: () => api.events(params) })
  const all = useQuery({ queryKey: ['events', 'counts'], queryFn: () => api.events({ limit: 500 }) })
  const counts: Record<string, number> = {}
  all.data?.items.forEach((e) => { counts[e.event_type] = (counts[e.event_type] ?? 0) + 1 })

  return (
    <>
      <PageHeader title="News Intelligence Feed" subtitle="Every analyzed article, classified by the NLP pipeline into corporate-event categories."
        right={<div className="relative w-full sm:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input aria-label="Search news" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines & briefs…" className="w-full rounded-xl border border-line bg-panel px-9 py-2.5 text-sm outline-none focus:border-brand" /></div>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TYPES.map((t) => {
          const active = t === type
          const c = t === 'ALL' ? '#5b8cff' : typeColor(t)
          return <button key={t} onClick={() => setType(t)} className="rounded-full px-3.5 py-1.5 text-xs font-medium transition"
            style={{ background: active ? `${c}33` : 'transparent', color: active ? '#fff' : '#8a99b8', border: `1px solid ${active ? c : '#1c2842'}` }}>
            {t === 'ALL' ? 'All' : typeLabel(t)} <span className="ml-1 opacity-70">{t === 'ALL' ? all.data?.items.length ?? '' : counts[t] ?? 0}</span></button>
        })}
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto rounded-xl border border-line bg-panel px-3 py-2 text-xs outline-none">
          <option value="date_desc">Newest</option><option value="val_desc">Highest value</option><option value="conf_desc">Highest confidence</option><option value="id_desc">Recently ingested</option></select>
      </div>

      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div> :
        !data || data.items.length === 0 ? <Empty title="No news matches" hint="Adjust the category or search, or run the pipeline to ingest more." /> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((e) => (
              <article key={e.id} role="button" tabIndex={0} onClick={() => setOpen(e)} onKeyDown={(ev) => ev.key === 'Enter' && setOpen(e)}
                className="group cursor-pointer rounded-2xl border border-line bg-panel/80 p-5 transition hover:-translate-y-0.5 hover:border-brand/60 fade-up"
                style={{ borderTop: `3px solid ${typeColor(e.event_type)}` }}>
                <div className="flex items-center justify-between"><TypeBadge type={e.event_type} /><span className="text-[11px] text-mute">{e.event_date ?? 'Undated'}</span></div>
                <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-brand">{e.title}</h3>
                {e.event_brief && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-mute">{e.event_brief}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-mute">
                  <span className={e.deal_value ? 'font-semibold text-good' : ''}>{e.deal_value ?? 'No value disclosed'}</span>
                  {e.status && <span>{e.status}</span>}
                  <span className="ml-auto">{e.source}</span>
                </div>
              </article>))}
          </div>)}
      {open && <Dossier e={open} onClose={() => setOpen(null)} />}
    </>
  )
}
