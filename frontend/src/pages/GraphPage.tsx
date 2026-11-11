import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import GraphView from '../components/GraphView'
import { Empty, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { api } from '../lib/api'

export default function GraphPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['graph'], queryFn: api.graph })
  return (
    <>
      <PageHeader title="Company Relationship Graph" subtitle={data ? `${data.nodes.length} companies · ${data.edges.length} relationships extracted from articles` : undefined} />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <Skeleton className="h-[560px]" /> :
        !data || data.nodes.length === 0 ? <Empty title="No relationships extracted yet" action={<Link to="/pipeline" className="rounded-lg bg-brand px-4 py-2 text-sm">Run the pipeline</Link>} /> :
          <GraphView data={data} height={620} />}
    </>
  )
}
