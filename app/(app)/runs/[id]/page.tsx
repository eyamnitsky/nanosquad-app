'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText, CheckCircle2, Circle, Loader2, XCircle, Clock } from 'lucide-react'
import { getRun, getArtifacts, getProject, type Run, type Artifact, type RunStep, type Project } from '@/lib/api'
import { RunStatusBadge } from '@/components/run-status-badge'
import { ArtifactTypeBadge } from '@/components/artifact-type-badge'
import { formatDistanceToNow, formatDuration } from '@/lib/time'
import { cn } from '@/lib/utils'

function StepIcon({ status }: { status: RunStep['status'] }) {
  if (status === 'done')    return <CheckCircle2 className="h-4 w-4 text-brand shrink-0" />
  if (status === 'running') return <Loader2 className="h-4 w-4 text-status-running animate-spin shrink-0" />
  if (status === 'error')   return <XCircle className="h-4 w-4 text-destructive shrink-0" />
  return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<Run | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null)
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    getRun(id)
      .then(setRun)
      .catch(() => setRun(null))
    getArtifacts({ run_id: id })
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
  }, [id])

  useEffect(() => {
    if (!run?.project_id) {
      setProject(null)
      return
    }
    getProject(run.project_id).then(setProject).catch(() => setProject(null))
  }, [run?.project_id])

  if (!run) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/runs" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
            <RunStatusBadge status={run.status} />
          </div>
          <h1 className="text-base font-semibold text-foreground mt-1 leading-snug">{run.task}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: details + steps + output */}
        <div className="lg:col-span-2 space-y-6">

          {/* Meta */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Primary agent</dt>
                <dd className="font-mono text-brand font-medium">
                  <Link href={`/agents/${encodeURIComponent(run.agent)}`} className="hover:underline">
                    {run.agent}
                  </Link>
                </dd>
              </div>
              {run.agents_involved.length > 1 && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">All agents</dt>
                  <dd className="font-mono text-xs text-foreground">{run.agents_involved.join(', ')}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Started</dt>
                <dd className="text-foreground">{new Date(run.created_at).toLocaleString()}</dd>
              </div>
              {run.completed_at && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Completed</dt>
                  <dd className="text-foreground">{new Date(run.completed_at).toLocaleString()}</dd>
                </div>
              )}
              {run.duration_ms != null && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Duration</dt>
                  <dd className="font-mono text-foreground">{formatDuration(run.duration_ms)}</dd>
                </div>
              )}
              {project && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Project</dt>
                  <dd>
                    <Link href={`/projects/${project.id}`} className="text-foreground hover:text-brand transition-colors">
                      {project.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Orchestrator summary */}
          {run.orchestrator_summary && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-foreground mb-2">Orchestrator Summary</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{run.orchestrator_summary}</p>
            </div>
          )}

          {/* Step timeline */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-foreground mb-4">Execution Trace</h2>
            <ol className="space-y-0">
              {run.steps.map((step, i) => (
                <li key={i} className="flex gap-3 relative">
                  {/* Connector line */}
                  {i < run.steps.length - 1 && (
                    <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
                  )}
                  <div className="mt-0.5 z-10">
                    <StepIcon status={step.status} />
                  </div>
                  <div className={cn('pb-4 min-w-0 flex-1', i === run.steps.length - 1 && 'pb-0')}>
                    <p className={cn(
                      'text-sm',
                      step.status === 'error' ? 'text-destructive-foreground' :
                      step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                    )}>
                      {step.label}
                    </p>
                    {step.started_at && step.completed_at && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(new Date(step.completed_at).getTime() - new Date(step.started_at).getTime())}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Final output */}
          {run.final_output && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-foreground mb-3">Output</h2>
              <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed bg-secondary/50 rounded-md p-4">
                {run.final_output}
              </pre>
            </div>
          )}
        </div>

        {/* Right: artifacts */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-foreground mb-4">
              Artifacts
              {artifacts && artifacts.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">({artifacts.length})</span>
              )}
            </h2>
            {artifacts === null ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />)}
              </div>
            ) : artifacts.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <FileText className="h-7 w-7 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No artifacts from this run.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {artifacts.map(art => (
                  <Link
                    key={art.id}
                    href={`/artifacts/${art.id}`}
                    className="flex items-start gap-3 rounded-md p-2.5 hover:bg-secondary/60 transition-colors"
                  >
                    <ArtifactTypeBadge type={art.type} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{art.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{art.preview}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
