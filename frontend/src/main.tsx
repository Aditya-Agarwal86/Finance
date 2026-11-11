import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import './index.css'
import Analytics from './pages/Analytics'
import CompanyProfile from './pages/CompanyProfile'
import Companies from './pages/Companies'
import Dashboard from './pages/Dashboard'
import GraphPage from './pages/GraphPage'
import NewsFeed from './pages/NewsFeed'
import Pipeline from './pages/Pipeline'
import Settings from './pages/Settings'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="news" element={<NewsFeed />} />
            <Route path="companies" element={<Companies />} />
            <Route path="companies/:id" element={<CompanyProfile />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<div className="p-10 text-center text-mute">Page not found</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
