'use client'

import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/api'
import { AlertTriangle, X } from 'lucide-react'

export function ServerBanner() {
  const [unreachable, setUnreachable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
        if (mounted) setUnreachable(false)
      } catch {
        if (mounted) setUnreachable(true)
      }
    }
    check()
    const id = setInterval(check, 30_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  if (!unreachable || dismissed) return null

  return (
    <div className="flex items-center gap-3 bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1 text-muted-foreground">
        Cannot reach NanoSquad Platform server at{' '}
        <code className="font-mono text-foreground">{API_BASE}</code>. Is it running?
        {' '}Showing placeholder data.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
