'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Copy, Check } from 'lucide-react'
import { getArtifact, getProject, getRun, type Artifact, type Project, type Run } from '@/lib/api'
import { ArtifactTypeBadge } from '@/components/artifact-type-badge'
import { formatDistanceToNow } from '@/lib/time'
import { Button } from '@/components/ui/button'

function ContentPreview({ artifact }: { artifact: Artifact }) {
  const isCode = artifact.type === 'code' || artifact.type === 'json' || artifact.type === 'csv'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          <ArtifactTypeBadge type={artifact.type} />
          <span className="text-xs text-muted-foreground font-mono">{artifact.title}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="p-5 overflow-auto max-h-[60vh]">
        {isCode ? (
          <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {artifact.content}
          </pre>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            <pre className="font-sans text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {artifact.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ArtifactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [run, setRun] = useState<Run | null>(null)

  useEffect(() => {
    getArtifact(id)
      .then(setArtifact)
      .catch(() => setArtifact(null))
  }, [id])

  useEffect(() => {
    if (!artifact?.project_id) {
      setProject(null)
    } else {
      getProject(artifact.project_id).then(setProject).catch(() => setProject(null))
    }
    if (!artifact?.run_id) {
      setRun(null)
    } else {
      getRun(artifact.run_id).then(setRun).catch(() => setRun(null))
    }
  }, [artifact?.project_id, artifact?.run_id])

  if (!artifact) {
    return (
      <div className="max-w-2xl space-y-4">
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
        <Link href="/artifacts" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ArtifactTypeBadge type={artifact.type} />
            <span className="font-mono text-xs text-muted-foreground">{artifact.id}</span>
          </div>
          <h1 className="text-base font-semibold text-foreground mt-1">{artifact.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Content */}
        <div className="lg:col-span-2">
          <ContentPreview artifact={artifact} />
        </div>

        {/* Metadata */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Metadata</h2>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Agent</dt>
                <dd>
                  <Link href={`/agents/${encodeURIComponent(artifact.agent)}`} className="font-mono text-brand hover:underline">
                    {artifact.agent}
                  </Link>
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Created</dt>
                <dd className="text-foreground">
                  {formatDistanceToNow(artifact.created_at)}
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {new Date(artifact.created_at).toLocaleString()}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Run</dt>
                <dd>
                  <Link href={`/runs/${artifact.run_id}`} className="font-mono text-xs text-foreground hover:text-brand transition-colors">
                    {artifact.run_id}
                  </Link>
                  {run && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{run.task}</p>
                  )}
                </dd>
              </div>

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
        </div>
      </div>
    </>
  )
}
