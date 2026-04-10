'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText, Play, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getProject, getRuns, getArtifacts, putProject,
  type Project, type Run, type Artifact,
} from '@/lib/api'
import { formatDistanceToNow, formatDuration } from '@/lib/time'
import { RunStatusBadge } from '@/components/run-status-badge'
import { ArtifactTypeBadge } from '@/components/artifact-type-badge'
import { cn } from '@/lib/utils'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    getProject(id)
      .then(p => { setProject(p); setNotes(p.notes ?? '') })
      .catch(() => setProject(null))
    getRuns({ project_id: id })
      .then(setRuns)
      .catch(() => setRuns([]))
    getArtifacts({ project_id: id })
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
  }, [id])

  const handleSaveNotes = async () => {
    if (!project) return
    setSavingNotes(true)
    await putProject(id, { notes }).catch(() => null)
    setProject(p => p ? { ...p, notes } : p)
    setSavingNotes(false)
    setEditingNotes(false)
  }

  if (!project) {
    return (
      <div className="space-y-4 max-w-3xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{project.description}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Runs', value: runs?.length ?? project.run_count },
          { label: 'Artifacts', value: artifacts?.length ?? project.artifact_count },
          { label: 'Updated', value: formatDistanceToNow(project.updated_at) },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-lg font-semibold text-foreground font-mono">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="rounded-lg border border-border bg-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Notes</h2>
          {editingNotes ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-muted-foreground"
                onClick={() => { setNotes(project.notes ?? ''); setEditingNotes(false) }}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" className="h-7 px-2 gap-1" onClick={handleSaveNotes} disabled={savingNotes}>
                <Check className="h-3.5 w-3.5" /> {savingNotes ? 'Saving...' : 'Save'}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-muted-foreground"
              onClick={() => setEditingNotes(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
        {editingNotes ? (
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            autoFocus
          />
        ) : (
          <p className={cn('text-sm leading-relaxed', notes ? 'text-foreground' : 'text-muted-foreground italic')}>
            {notes || 'No notes yet. Click Edit to add context.'}
          </p>
        )}
      </div>

      {/* Runs + Artifacts tabs */}
      <Tabs defaultValue="runs">
        <TabsList className="h-8">
          <TabsTrigger value="runs" className="text-xs">
            Runs {runs ? `(${runs.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="text-xs">
            Artifacts {artifacts ? `(${artifacts.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-4">
          {runs === null ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border">
              <Play className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No runs in this project yet.</p>
              <Link href="/ask">
                <Button size="sm" variant="outline" className="mt-4 gap-1.5">
                  <Play className="h-3.5 w-3.5" /> Dispatch a task
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {runs.map((run, i) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors',
                    i < runs.length - 1 && 'border-b border-border'
                  )}
                >
                  <RunStatusBadge status={run.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{run.task}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{run.agent}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(run.created_at)}</p>
                    {run.duration_ms && (
                      <p className="text-xs text-muted-foreground/70">{formatDuration(run.duration_ms)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="artifacts" className="mt-4">
          {artifacts === null ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-border">
              <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No artifacts produced in this project yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {artifacts.map((art, i) => (
                <Link
                  key={art.id}
                  href={`/artifacts/${art.id}`}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors',
                    i < artifacts.length - 1 && 'border-b border-border'
                  )}
                >
                  <ArtifactTypeBadge type={art.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{art.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{art.preview}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(art.created_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
