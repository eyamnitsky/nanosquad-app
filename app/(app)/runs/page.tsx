'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getRuns, getProjects, type Run, type RunStatus, type Project } from '@/lib/api'
import { RunStatusBadge } from '@/components/run-status-badge'
import { formatDistanceToNow, formatDuration } from '@/lib/time'
import { cn } from '@/lib/utils'

const STATUS_FILTERS: { label: string; value: RunStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Queued', value: 'queued' },
]

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState<RunStatus | 'all'>('all')

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
    getProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  const filtered = runs
    ? filter === 'all' ? runs : runs.filter(r => r.status === filter)
    : null

  const projectName = (id?: string) => {
    if (!id) return null
    return projects.find(p => p.id === id)?.name ?? id
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {runs ? `${runs.length} total` : 'Loading...'}
          </p>
        </div>
        <Link href="/ask">
          <Button size="sm" className="gap-2">
            <Play className="h-4 w-4" />
            New Run
          </Button>
        </Link>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-brand text-brand-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            {f.value !== 'all' && runs && (
              <span className="ml-1.5 opacity-70">
                {runs.filter(r => r.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-lg border border-border">
          <Play className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No runs match this filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map((run, i) => {
            const proj = projectName(run.project_id)
            return (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className={cn(
                  'flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/40 transition-colors',
                  i < filtered.length - 1 && 'border-b border-border'
                )}
              >
                <RunStatusBadge status={run.status} />

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{run.task}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono text-brand">{run.agent}</span>
                    {proj && (
                      <>
                        <span>·</span>
                        <span className="truncate">{proj}</span>
                      </>
                    )}
                    {run.agents_involved.length > 1 && (
                      <>
                        <span>·</span>
                        <span>{run.agents_involved.length} agents</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(run.created_at)}</p>
                  {run.duration_ms != null && (
                    <p className="text-xs text-muted-foreground/60 font-mono">{formatDuration(run.duration_ms)}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
