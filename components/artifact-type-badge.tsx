import { cn } from '@/lib/utils'
import type { ArtifactType } from '@/lib/api'

const CONFIG: Record<ArtifactType, { label: string; style: string }> = {
  text:     { label: 'text',     style: 'bg-secondary text-muted-foreground' },
  markdown: { label: 'md',       style: 'bg-brand-muted text-brand' },
  json:     { label: 'json',     style: 'bg-chart-3/15 text-chart-3' },
  code:     { label: 'code',     style: 'bg-chart-4/15 text-chart-4' },
  csv:      { label: 'csv',      style: 'bg-chart-2/15 text-chart-2' },
  html:     { label: 'html',     style: 'bg-chart-5/15 text-chart-5' },
}

export function ArtifactTypeBadge({ type }: { type: ArtifactType }) {
  const c = CONFIG[type]
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium shrink-0', c.style)}>
      {c.label}
    </span>
  )
}
