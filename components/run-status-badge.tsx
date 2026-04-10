import { cn } from '@/lib/utils'
import type { RunStatus } from '@/lib/api'

const CONFIG: Record<RunStatus, { label: string; dot: string; bg: string; text: string; pulse?: boolean }> = {
  queued:    { label: 'queued',    dot: 'bg-muted-foreground',         bg: 'bg-muted',                     text: 'text-muted-foreground' },
  running:   { label: 'running',   dot: 'bg-status-running animate-pulse', bg: 'bg-status-running/15',    text: 'text-status-running',  pulse: true },
  completed: { label: 'completed', dot: 'bg-brand',                    bg: 'bg-brand-muted',               text: 'text-brand' },
  failed:    { label: 'failed',    dot: 'bg-destructive',              bg: 'bg-destructive/15',            text: 'text-destructive-foreground' },
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const c = CONFIG[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shrink-0', c.bg, c.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', c.dot)} />
      {c.label}
    </span>
  )
}
