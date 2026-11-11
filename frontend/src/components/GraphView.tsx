import {
  Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider,
  useReactFlow, type Edge, type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type GEdge, type GNode, type GraphData } from '../lib/api'
import { REL_META, fmtUsdM, relMeta } from '../lib/format'
import { Skeleton, TypeBadge } from './ui'

/** Layered top-down layout: depth = longest path from a root (in-degree 0). */
function layout(g: GraphData) {
  const depth = new Map<string, number>()
  const ids = g.nodes.map((n) => n.company_id)
  ids.forEach((i) => depth.set(i, 0))
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false
    for (const e of g.edges) {
      const d = (depth.get(e.source_company_id) ?? 0) + 1
      if (d > (depth.get(e.target_company_id) ?? 0) && d <= ids.length) { depth.set(e.target_company_id, d); changed = true }
    }
    if (!changed) break
  }
  // group into connected components, lay each out as a tree, then pack components in rows
  const parent = new Map(ids.map((i) => [i, i]))
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!))
  g.edges.forEach((e) => parent.set(find(e.source_company_id), find(e.target_company_id)))
  const comps = new Map<string, string[]>()
  ids.forEach((i) => comps.set(find(i), [...(comps.get(find(i)) ?? []), i]))
  const list = [...comps.values()].sort((a, b) => b.length - a.length)
  const pos = new Map<string, { x: number; y: number }>()
  let cx = 0, cy = 0, rowH = 0
  const MAX_W = 1000
  for (const comp of list) {
    const layers = new Map<number, string[]>()
    comp.forEach((i) => { const d = depth.get(i)!; layers.set(d, [...(layers.get(d) ?? []), i]) })
    const maxN = Math.max(...[...layers.values()].map((l) => l.length))
    const w = maxN * 230, h = layers.size * 130
    if (cx > 0 && cx + w > MAX_W) { cx = 0; cy += rowH + 60; rowH = 0 }
    layers.forEach((arr, d) => arr.forEach((id, i) => pos.set(id, { x: cx + (i + (maxN - arr.length) / 2) * 230, y: cy + d * 130 })))
    cx += w + 40; rowH = Math.max(rowH, h)
  }
  return pos
}

/** Full breakdown of the selected company, loaded live from the REST API. */
function NodeDetail({ id }: { id: string }) {
  const co = useQuery({ queryKey: ['company', id], queryFn: () => api.company(id) })
  const fin = useQuery({ queryKey: ['fin', id], queryFn: () => api.financials(id) })
  if (co.isLoading) return <div className="mt-4 space-y-2"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
  if (co.error || !co.data) return <p className="mt-4 text-xs text-mute">No event data for this entity (it only appears as a counterparty in an ownership link).</p>
  const c = co.data
  const f = fin.data
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-panel2/60 p-2.5"><div className="text-mute">Events</div><div className="text-lg font-semibold">{c.event_count}</div></div>
        <div className="rounded-lg bg-panel2/60 p-2.5"><div className="text-mute">Deal value</div><div className="text-lg font-semibold">{fmtUsdM(c.total_deal_value_usd_m)}</div></div>
        <div className="rounded-lg bg-panel2/60 p-2.5"><div className="text-mute">Deployed</div><div className="font-semibold">{f ? fmtUsdM(f.capital_deployed_usd_m) : '…'}</div></div>
        <div className="rounded-lg bg-panel2/60 p-2.5"><div className="text-mute">Received</div><div className="font-semibold">{f ? fmtUsdM(f.capital_received_usd_m) : '…'}</div></div>
      </div>
      {(c.parents.length > 0 || c.subsidiaries.length > 0) && (
        <div className="space-y-1 text-xs">
          {c.parents.length > 0 && <div><span className="text-mute">Parent: </span>{c.parents.join(', ')}</div>}
          {c.subsidiaries.length > 0 && <div><span className="text-mute">Subsidiaries: </span>{c.subsidiaries.join(', ')}</div>}
        </div>)}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Events ({c.events.length})</p>
        <ul className="space-y-2">
          {c.events.map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-panel2/60 p-3 text-xs">
              <div className="flex items-center justify-between"><TypeBadge type={e.event_type} /><span className="text-mute">{e.event_date ?? 'Undated'}</span></div>
              <div className="mt-1.5 font-medium">{e.title}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {([['Acquirer', e.acquirer], ['Target', e.target], ['Seller', e.seller], ['Buyer', e.buyer], ['Deal value', e.deal_value], ['Status', e.status]] as const)
                  .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[10px] uppercase tracking-wider text-mute">{k}</dt><dd className={k === 'Deal value' ? 'font-semibold text-good' : ''}>{v}</dd></div>)}
              </dl>
              {e.event_brief && <p className="mt-2 text-mute">{e.event_brief}</p>}
            </li>))}
        </ul>
      </div>
      {c.people.length > 0 && <div className="text-xs"><p className="mb-1 font-semibold uppercase tracking-wider text-mute">People</p>{c.people.map((p, i) => <div key={i}>{p.name} <span className="text-mute">{p.change} {p.role}</span></div>)}</div>}
    </div>
  )
}

function Inner({ data, height, centerId }: { data: GraphData; height: number; centerId?: string }) {
  const [sel, setSel] = useState<string | null>(centerId ?? null)
  const [profile, setProfile] = useState<string | null>(null)
  const pos = useMemo(() => layout(data), [data])
  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.company_id, n])), [data])

  const connected = useMemo(() => {
    if (!sel) return null
    const s = new Set([sel])
    data.edges.forEach((e) => { if (e.source_company_id === sel) s.add(e.target_company_id); if (e.target_company_id === sel) s.add(e.source_company_id) })
    return s
  }, [sel, data])

  const rf = useReactFlow()
  useEffect(() => {
    // zoom to the selected company and its neighbours
    if (connected) rf.fitView({ nodes: [...connected].map((id) => ({ id })), duration: 600, padding: 0.5, maxZoom: 1.2 })
    else rf.fitView({ duration: 600, padding: 0.25 })
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const nodes: Node[] = data.nodes.map((n) => {
    const dim = connected && !connected.has(n.company_id)
    const isSel = n.company_id === sel
    return {
      id: n.company_id, position: pos.get(n.company_id)!, data: { label: n.name },
      style: {
        background: isSel ? 'linear-gradient(135deg,#5b8cff,#8b5cf6)' : n.in_degree === 0 ? '#16264a' : '#111a2e',
        color: '#e6ecf8', border: `1px solid ${isSel ? '#fff' : '#2a3b63'}`, borderRadius: 12, padding: '8px 12px', fontSize: 12.5, fontWeight: 600,
        opacity: dim ? 0.25 : 1, width: 190, textAlign: 'center' as const, transition: 'opacity .2s',
      },
    }
  })
  const edges: Edge[] = data.edges.map((e, i) => {
    const m = relMeta(e.relation)
    const active = !connected || (connected.has(e.source_company_id) && connected.has(e.target_company_id) && (e.source_company_id === sel || e.target_company_id === sel))
    return {
      id: `e${i}`, source: e.source_company_id, target: e.target_company_id, animated: e.relation === 'contested_takeover' || (!!sel && active),
      label: e.pct ? `${e.pct}%` : m.label, markerEnd: { type: MarkerType.ArrowClosed, color: m.color },
      style: { stroke: m.color, strokeWidth: active ? 2 : 1, opacity: active ? 1 : 0.15, strokeDasharray: e.relation.startsWith('proposed') ? '6 4' : undefined },
      labelStyle: { fill: '#e6ecf8', fontSize: 10 }, labelBgStyle: { fill: '#0d1424' }, labelBgPadding: [4, 2] as [number, number],
    }
  })

  const selNode: GNode | undefined = sel ? nodeMap.get(sel) : undefined
  const selEdges: GEdge[] = sel ? data.edges.filter((e) => e.source_company_id === sel || e.target_company_id === sel) : []

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel/60" style={{ height }}>
        <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.2} maxZoom={2}
          nodesConnectable={false} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)} proOptions={{ hideAttribution: true }}>
          <Background color="#1c2842" gap={22} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable maskColor="rgba(7,11,20,.7)" style={{ background: '#0d1424' }} nodeColor="#2a3b63" />
        </ReactFlow>
      </div>
      <aside className="rounded-2xl border border-line bg-panel/80 p-4 text-sm" style={{ maxHeight: height, overflow: 'auto' }}>
        {!selNode ? (
          <>
            <p className="font-semibold">Legend</p>
            <ul className="mt-3 space-y-2">
              {Object.entries(REL_META).filter(([k]) => data.edges.some((e) => e.relation === k)).map(([k, m]) => (
                <li key={k} className="flex items-center gap-2 text-xs"><i className="h-0.5 w-6" style={{ background: m.color }} />{m.label}</li>))}
            </ul>
            <p className="mt-4 text-xs text-mute">Click a company to highlight its connections. Scroll to zoom, drag to pan.</p>
          </>
        ) : (
          <>
            <p className="text-base font-semibold">{selNode.name}</p>
            <p className="text-xs text-mute">{selNode.type}</p>
            <button onClick={() => setProfile(selNode.company_id)} className="mt-3 inline-block rounded-lg bg-brand/20 px-3 py-1.5 text-xs text-brand hover:bg-brand/30">Open profile →</button>
            <NodeDetail id={selNode.company_id} />
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-mute">Relationships ({selEdges.length})</p>
            <ul className="mt-2 space-y-3">
              {selEdges.map((e, i) => {
                const other = e.source_company_id === sel ? e.target_company_id : e.source_company_id
                return (
                <li key={i} className="rounded-xl border border-line bg-panel2/60 p-3 text-xs">
                  <div className="font-medium" style={{ color: relMeta(e.relation).color }}>{e.evidence}</div>
                  <div className="mt-1"><button className="hover:text-brand" onClick={() => setSel(e.source_company_id)}>{e.source_name}</button> → <button className="hover:text-brand" onClick={() => setSel(e.target_company_id)}>{e.target_name}</button></div>
                  {e.deal_value && <div className="text-mute">Value: {e.deal_value}</div>}
                  {e.deal_status && <div className="text-mute">Status: {e.deal_status}</div>}
                  {e.former_parent && <div className="text-mute">Formerly under {e.former_parent}</div>}
                  {e.event_title && <div className="mt-1 text-mute">“{e.event_title}”</div>}
                  <div className="mt-1 flex gap-3">{nodeMap.has(other) && <button className="text-brand" onClick={() => setSel(other)}>Select counterparty</button>}
                    {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="text-brand">Source ↗</a>}</div>
                </li>)})}
            </ul>
          </>
        )}
      </aside>
      {profile && <ProfileDrawer id={profile} onClose={() => setProfile(null)} />}
    </div>
  )
}

/** Slide-over company profile (same style as the News dossier), opened from the graph. */
function ProfileDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const co = useQuery({ queryKey: ['company', id], queryFn: () => api.company(id) })
  const fin = useQuery({ queryKey: ['fin', id], queryFn: () => api.financials(id) })
  const ana = useQuery({ queryKey: ['ana', id], queryFn: () => api.analysis(id) })
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const c = co.data, f = fin.data
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-line bg-panel p-6 fade-up">
        <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 text-mute hover:text-ink"><X /></button>
        {co.isLoading ? <Skeleton className="h-40" /> : !c ? <p className="text-sm text-mute">No event data for this entity: it appears only as a counterparty in an ownership link.</p> : (
          <>
            <h2 className="pr-8 text-xl font-semibold">{c.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">{c.entity_type && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-mute">{c.entity_type}</span>}{Object.keys(c.event_types).map((t) => <TypeBadge key={t} type={t} />)}</div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['Events', String(c.event_count)], ['Deal value', fmtUsdM(c.total_deal_value_usd_m)], ['Deployed', f ? fmtUsdM(f.capital_deployed_usd_m) : '…'], ['Received', f ? fmtUsdM(f.capital_received_usd_m) : '…']] as const)
                .map(([k, v]) => <div key={k} className="rounded-lg bg-panel2/60 p-3"><div className="text-[11px] uppercase tracking-wider text-mute">{k}</div><div className="mt-0.5 font-semibold">{v}</div></div>)}
            </div>
            {(c.parents.length > 0 || c.subsidiaries.length > 0) && <div className="mt-4 space-y-1 text-sm">
              {c.parents.length > 0 && <div><span className="text-mute">Parent: </span>{c.parents.join(', ')}</div>}
              {c.subsidiaries.length > 0 && <div><span className="text-mute">Subsidiaries: </span>{c.subsidiaries.join(', ')}</div>}</div>}
            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-mute">NLP-extracted analysis</p>
            <div className="space-y-4">
              {(ana.data?.analyses ?? []).map((a) => {
                const ev = c.events.find((e) => e.id === a.event_id)
                return (
                  <article key={a.event_id} className="rounded-xl border border-line bg-panel2/50 p-4">
                    <div className="flex items-center gap-2"><TypeBadge type={a.event_type} />{a.event_subtype && <span className="text-xs text-mute">{a.event_subtype}</span>}<span className="ml-auto text-xs text-mute">{a.date ?? 'Undated'}</span></div>
                    <h4 className="mt-2 text-sm font-semibold">{a.title}</h4>
                    {a.brief && <p className="mt-1 text-sm text-mute">{a.brief}</p>}
                    {a.key_highlights.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-mute">{a.key_highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
                    {ev && <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {([['Acquirer', ev.acquirer], ['Target', ev.target], ['Seller', ev.seller], ['Buyer', ev.buyer], ['Deal value', ev.deal_value], ['Structure', ev.deal_structure], ['Status', ev.status], ['Timeline', ev.effective_timeline]] as const)
                        .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[10px] uppercase tracking-wider text-mute">{k}</dt><dd>{v}</dd></div>)}</dl>}
                    <div className="mt-3 flex items-center gap-3 text-xs text-mute">
                      {a.classifier_confidence !== null && <span>Confidence <b className="text-ink">{(a.classifier_confidence * 100).toFixed(0)}%</b></span>}{a.source && <span>{a.source}</span>}
                      {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="ml-auto text-brand">Article ↗</a>}</div>
                  </article>)
              })}
            </div>
            {c.people.length > 0 && <div className="mt-5 text-sm"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">People</p>{c.people.map((p, i) => <div key={i}>{p.name} <span className="text-mute">{p.change} {p.role}</span></div>)}</div>}
            <Link to={`/companies/${id}`} className="mt-6 inline-block rounded-lg bg-brand/20 px-4 py-2 text-sm text-brand hover:bg-brand/30">Go to full profile page →</Link>
          </>)}
      </aside>
    </div>
  )
}

export default function GraphView(props: { data: GraphData; height?: number; centerId?: string }) {
  return <ReactFlowProvider><Inner data={props.data} height={props.height ?? 560} centerId={props.centerId} /></ReactFlowProvider>
}
