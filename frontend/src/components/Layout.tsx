import { useQuery } from '@tanstack/react-query'
import { Activity, BarChart3, Building2, LayoutDashboard, Menu, Network, Newspaper, Settings, PlayCircle, Radar, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { API_URL, api } from '../lib/api'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/news', label: 'News Feed', icon: Newspaper },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/graph', label: 'Relationship Graph', icon: Network },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/pipeline', label: 'Scrape & Analyze', icon: PlayCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function ApiStatus() {
  const { data, isError, isLoading } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 4000, retry: false })
  const state = isLoading ? 'checking' : isError ? 'offline' : data?.pipeline_busy ? 'busy' : 'online'
  const color = { checking: 'bg-warn', offline: 'bg-bad', busy: 'bg-warn', online: 'bg-good' }[state]
  return (
    <div className="rounded-xl border border-line bg-panel2/60 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color} ${state !== 'offline' ? 'animate-pulse' : ''}`} />
        <span className="font-medium capitalize">API {state === 'busy' ? 'online · pipeline running' : state}</span>
      </div>
      <div className="mt-1 truncate text-mute">{API_URL}</div>
      {data && <div className="mt-0.5 text-mute">{data.events} events · v{data.version}</div>}
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 4000, retry: false })
  const side = (
    <div className="flex h-full flex-col gap-6 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand2"><Radar size={18} /></div>
        <div>
          <div className="text-sm font-semibold leading-tight">Event Miner</div>
          <div className="text-[11px] text-mute">Financial Intelligence</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {nav.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-brand/15 text-white ring-1 ring-brand/40' : 'text-mute hover:bg-panel2 hover:text-ink'}`}>
            <I size={17} />{label}
            {to === '/pipeline' && health?.pipeline_busy && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] text-warn"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />Running</span>)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-mute hover:text-ink"><Activity size={14} /> API documentation</a>
        <ApiStatus />
      </div>
    </div>
  )
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-panel/60 lg:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-line bg-panel">{side}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur lg:hidden">
          <button aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
          <span className="text-sm font-semibold">Event Miner</span>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
