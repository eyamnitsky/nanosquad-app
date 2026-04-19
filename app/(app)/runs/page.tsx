'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getRuns, getProjects, getSquads, type Run, type RunStatus, type Project, type Squad } from '@/lib/api'
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

type RunGroup = {
  id: string
  primary: Run
  runs: Run[]
  status: RunStatus
}

type SquadRunSection = {
  key: string
  label: string
  color: string
  groups: RunGroup[]
}

function runTs(run: Run): number {
  const ts = Date.parse(run.created_at)
  return Number.isFinite(ts) ? ts : 0
}

function lower(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function hasDelegationStep(run: Run, delegatedAgent: string): boolean {
  const needle = `delegated: ${lower(delegatedAgent)}`
  return run.steps.some(step => lower(step.label) === needle)
}

function getDelegatedPair(run: Run): { parentAgent: string; childAgent: string } | null {
  const summary = run.orchestrator_summary ?? ''
  const match = summary.match(/^Imported delegated run from ([a-z0-9_-]+) to ([a-z0-9_-]+)\./i)
  if (!match) return null
  const parentAgent = match[1]?.trim()
  const childAgent = match[2]?.trim()
  if (!parentAgent || !childAgent) return null
  return { parentAgent, childAgent }
}

function resolveGroupStatus(runs: Run[]): RunStatus {
  if (runs.some(run => run.status === 'running')) return 'running'
  if (runs.some(run => run.status === 'failed')) return 'failed'
  if (runs.some(run => run.status === 'queued')) return 'queued'
  return 'completed'
}

function resolveGroupSquad(group: RunGroup): string | undefined {
  if (group.primary.squad) return group.primary.squad
  return group.runs.find(run => run.squad)?.squad
}

function groupRuns(sourceRuns: Run[]): RunGroup[] {
  if (sourceRuns.length === 0) return []

  const runs = [...sourceRuns].sort((a, b) => runTs(a) - runTs(b))
  const groupByRunId = new Map<string, string>()

  for (const run of runs) {
    groupByRunId.set(run.id, run.id)
  }

  for (const run of runs) {
    const pair = getDelegatedPair(run)
    if (!pair) continue

    const childTs = runTs(run)
    const parentAgent = lower(pair.parentAgent)
    const childAgent = lower(pair.childAgent)
    let selectedParent: Run | null = null
    let selectedDelta = Number.POSITIVE_INFINITY

    for (const candidate of runs) {
      if (candidate.id === run.id) continue
      if (lower(candidate.agent) !== parentAgent) continue
      if (!candidate.agents_involved.some(name => lower(name) === childAgent)) continue
      if (!hasDelegationStep(candidate, childAgent)) continue

      const candidateTs = runTs(candidate)
      if (candidateTs > childTs) continue

      const delta = childTs - candidateTs
      if (delta > 1000 * 60 * 120) continue
      if (delta < selectedDelta) {
        selectedParent = candidate
        selectedDelta = delta
      }
    }

    if (selectedParent) {
      groupByRunId.set(run.id, selectedParent.id)
    }
  }

  const grouped = new Map<string, Run[]>()
  for (const run of runs) {
    const groupId = groupByRunId.get(run.id) ?? run.id
    const bucket = grouped.get(groupId) ?? []
    bucket.push(run)
    grouped.set(groupId, bucket)
  }

  const groups: RunGroup[] = [...grouped.entries()].map(([groupId, groupRuns]) => {
    const sorted = [...groupRuns].sort((a, b) => runTs(a) - runTs(b))
    const primary = sorted.find(run => run.id === groupId) ?? sorted[0]
    return {
      id: groupId,
      primary,
      runs: sorted,
      status: resolveGroupStatus(sorted),
    }
  })

  return groups.sort((a, b) => runTs(b.primary) - runTs(a.primary))
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [filter, setFilter] = useState<RunStatus | 'all'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
    getProjects().then(setProjects).catch(() => setProjects([]))
    getSquads().then(setSquads).catch(() => setSquads([]))
  }, [])

  const groups = useMemo(() => (runs ? groupRuns(runs) : null), [runs])
  const filteredGroups = groups
    ? filter === 'all' ? groups : groups.filter(group => group.status === filter)
    : null

  const projectName = (id?: string) => {
    if (!id) return null
    return projects.find(p => p.id === id)?.name ?? id
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const sections = useMemo(() => {
    if (!filteredGroups) return null
    const byKey = new Map<string, SquadRunSection>()
    for (const group of filteredGroups) {
      const squadId = resolveGroupSquad(group)
      const squad = squadId ? squads.find(item => item.id === squadId) : undefined
      const key = squad?.id ?? 'unassigned'
      const existing = byKey.get(key)
      if (existing) {
        existing.groups.push(group)
        continue
      }
      byKey.set(key, {
        key,
        label: squad?.name ?? (squadId ? squadId : 'No squad'),
        color: squad?.color ?? '#6b7280',
        groups: [group],
      })
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredGroups, squads])

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {groups ? `${groups.length} grouped runs` : 'Loading...'}
            {runs && runs.length > 0 && groups && runs.length !== groups.length && (
              <span className="ml-1 text-muted-foreground/70">from {runs.length} run records</span>
            )}
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
            {f.value !== 'all' && groups && (
              <span className="ml-1.5 opacity-70">
                {groups.filter(group => group.status === f.value).length}
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
          <Play className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No runs match this filter.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map(section => (
            <div key={section.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: section.color }} />
                <h2 className="text-sm font-medium text-foreground">{section.label}</h2>
                <span className="text-xs text-muted-foreground">{section.groups.length} grouped runs</span>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                {section.groups.map((group, i) => {
                  const run = group.primary
                  const proj = projectName(run.project_id)
                  const isExpanded = Boolean(expandedGroups[group.id])
                  return (
                    <div
                      key={group.id}
                      className={cn(
                        i < section.groups.length - 1 && 'border-b border-border'
                      )}
                    >
                      <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40 transition-colors">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          aria-label={isExpanded ? 'Collapse run group' : 'Expand run group'}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>

                        <RunStatusBadge status={group.status} />

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
                            {group.runs.length > 1 && (
                              <>
                                <span>·</span>
                                <span>{group.runs.length} interactions</span>
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

                        <Link
                          href={`/runs/${run.id}`}
                          className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          Open
                        </Link>
                      </div>

                      {isExpanded && group.runs.length > 1 && (
                        <div className="bg-secondary/20 border-t border-border px-4 py-2.5">
                          <div className="space-y-1.5">
                            {group.runs.map(item => (
                              <Link
                                key={item.id}
                                href={`/runs/${item.id}`}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/70 transition-colors"
                              >
                                <RunStatusBadge status={item.status} />
                                <span className="font-mono text-[11px] text-brand">{item.agent}</span>
                                <span className="text-xs text-foreground truncate flex-1">{item.task}</span>
                                <span className="text-[11px] text-muted-foreground shrink-0">{formatDistanceToNow(item.created_at)}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
