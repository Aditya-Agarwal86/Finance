import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { typeColor, typeLabel } from '../lib/format'

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel/80 backdrop-blur p-5 fade-up ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold tracking-wide text-ink">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/80 p-5 fade-up">
      <div className="flex items-center justify-between text-mute text-xs uppercase tracking-wider">{label}{icon}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-mute">{hint}</div>}
    </div>
  )
}

export function TypeBadge({ type }: { type: string }) {
  const c = typeColor(type)
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ background: `${c}1f`, color: c, border: `1px solid ${c}44` }}>{typeLabel(type)}</span>
  )
}

export function Skeleton({ className = 'h-24' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="rounded-2xl border border-bad/40 bg-bad/10 p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 text-bad" />
      <p className="text-sm">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-panel2">
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center text-mute">
      <Inbox className="mx-auto mb-2" />
      <p className="text-sm text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export const chartTooltipStyle = {
  contentStyle: { background: '#0d1424', border: '1px solid #1c2842', borderRadius: 12, fontSize: 12, color: '#e6ecf8' },
  itemStyle: { color: '#e6ecf8' },
  labelStyle: { color: '#8a99b8' },
  cursor: { fill: 'rgba(91,140,255,.08)' },
}
