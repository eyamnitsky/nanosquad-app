'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { getArtifacts, getProjects, getRuns, getSquads, type Artifact, type ArtifactType, type Project, type Run, type Squad } from '@/lib/api'
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
  const [runs, setRuns] = useState<Run[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [filter, setFilter] = useState<ArtifactType | 'all'>('all')

  useEffect(() => {
    getArtifacts()
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
    getProjects().then(setProjects).catch(() => setProjects([]))
    getRuns().then(setRuns).catch(() => setRuns([]))
    getSquads().then(setSquads).catch(() => setSquads([]))
  }, [])

  const filtered = artifacts
    ? filter === 'all' ? artifacts : artifacts.filter(a => a.type === filter)
    : null

  const projectName = (id?: string) => {
    if (!id) return null
    return projects.find(p => p.id === id)?.name ?? null
  }

  const runById = useMemo(() => new Map(runs.map(run => [run.id, run])), [runs])

  const sections = useMemo(() => {
    if (!filtered) return null
    const byKey = new Map<string, { key: string; label: string; color: string; items: Artifact[] }>()
    for (const artifact of filtered) {
      const run = runById.get(artifact.run_id)
      const squadId = run?.squad
      const squad = squadId ? squads.find(item => item.id === squadId) : undefined
      const key = squad?.id ?? 'unassigned'
      const section = byKey.get(key)
      if (section) {
        section.items.push(artifact)
        continue
      }
      byKey.set(key, {
        key,
        label: squad?.name ?? (squadId ? squadId : 'No squad'),
        color: squad?.color ?? '#6b7280',
        items: [artifact],
      })
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered, runById, squads])

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

      {sections === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-lg border border-border">
          <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No artifacts match this filter.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map(section => (
            <div key={section.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: section.color }} />
                <h2 className="text-sm font-medium text-foreground">{section.label}</h2>
                <span className="text-xs text-muted-foreground">{section.items.length} artifacts</span>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                {section.items.map((art, i) => {
                  const proj = projectName(art.project_id)
                  return (
                    <Link
                      key={art.id}
                      href={`/artifacts/${art.id}`}
                      className={cn(
                        'flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/40 transition-colors',
                        i < section.items.length - 1 && 'border-b border-border'
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
            </div>
          ))}
        </div>
      )}
    </>
  )
}
