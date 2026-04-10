import { cn } from '@/lib/utils'

function Bone({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  )
}

export function AgentCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <Bone className="h-4 w-32" />
        <Bone className="h-5 w-14 rounded-full" />
      </div>
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-4/5" />
      <Bone className="h-3 w-28" />
      <div className="flex gap-2 pt-1">
        <Bone className="h-5 w-16 rounded-full" />
        <Bone className="h-5 w-20 rounded-full" />
        <Bone className="h-5 w-14 rounded-full" />
      </div>
    </div>
  )
}

export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Bone className="h-3.5 w-full max-w-[160px]" />
        </td>
      ))}
    </tr>
  )
}

export function LogEntrySkeleton() {
  return (
    <div className="border-b border-border px-4 py-4 space-y-2">
      <div className="flex items-center gap-4">
        <Bone className="h-3 w-36" />
        <Bone className="h-3 w-20" />
        <Bone className="h-3 w-24" />
      </div>
      <Bone className="h-3 w-3/4" />
    </div>
  )
}
