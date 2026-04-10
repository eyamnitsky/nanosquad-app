'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { getArtifacts, getProjects, type Artifact, type ArtifactType, type Project } from '@/lib/api'
import { ArtifactTypeBadge } from '@/components/artifact-type-badge'
import { formatDistanceToNow } from '@/lib/time'
import { cn } from '@/lib/utils'

const TYPE_FILTERS: { label: string; value: ArtifactType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Code', value: 'code' },
  { label: 'JSON', value: 'json' },
  { label: 'Text', value: 'text' },
  { label: 'CSV', value: 'csv' },
]

export default function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState<ArtifactType | 'all'>('all')

  useEffect(() => {
    getArtifacts()
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
    getProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  const filtered = artifacts
    ? filter === 'all' ? artifacts : artifacts.filter(a => a.type === filter)
    : null

  const projectName = (id?: string) => {
    if (!id) return null
    return projects.find(p => p.id === id)?.name ?? null
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Artifacts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {artifacts ? `${artifacts.length} total` : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TYPE_FILTERS.map(f => (
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
            {f.value !== 'all' && artifacts && (
              <span className="ml-1.5 opacity-70">
                {artifacts.filter(a => a.type === f.value).length}
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
          <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No artifacts match this filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map((art, i) => {
            const proj = projectName(art.project_id)
            return (
              <Link
                key={art.id}
                href={`/artifacts/${art.id}`}
                className={cn(
                  'flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/40 transition-colors',
                  i < filtered.length - 1 && 'border-b border-border'
                )}
              >
                <ArtifactTypeBadge type={art.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{art.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono text-brand">{art.agent}</span>
                    {proj && (
                      <>
                        <span>·</span>
                        <span className="truncate">{proj}</span>
                      </>
                    )}
                    <span>·</span>
                    <Link
                      href={`/runs/${art.run_id}`}
                      onClick={e => e.stopPropagation()}
                      className="font-mono hover:text-brand transition-colors"
                    >
                      {art.run_id}
                    </Link>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(art.created_at)}</p>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
