'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, ExternalLink, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Model } from '@/lib/api'
import { getModels } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ModelPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onSelect: (modelId: string) => void
}

function fmtCtx(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function fmtPrice(n: number) {
  return `$${n.toFixed(2)}`
}

export function ModelPicker({ open, onOpenChange, value, onSelect }: ModelPickerProps) {
  const [models, setModels] = useState<Model[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    getModels()
      .then(setModels)
      .catch(() => setModels([]))
  }, [open])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return models.filter(
      m =>
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    )
  }, [models, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">Select Model</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search models..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9 h-8 text-sm bg-secondary border-0 focus-visible:ring-1"
            />
          </div>
        </div>

        <div className="overflow-auto max-h-96">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No models match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Model ID</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Provider</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Context</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">In / 1M</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Out / 1M</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const selected = m.id === value
                  return (
                    <tr
                      key={m.id}
                      onClick={() => { onSelect(m.id); onOpenChange(false) }}
                      className={cn(
                        'cursor-pointer border-b border-border/50 transition-colors',
                        selected ? 'bg-brand-muted' : 'hover:bg-secondary'
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{m.id}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.provider}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">{fmtCtx(m.context_window)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">{fmtPrice(m.input_price)}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">{fmtPrice(m.output_price)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {selected && <Check className="h-3.5 w-3.5 text-brand" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end">
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand transition-colors"
          >
            Browse on OpenRouter
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
