'use client'

import { useState } from 'react'
import { X, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createSquad, type Squad, type Agent } from '@/lib/api'
import { cn } from '@/lib/utils'

const PALETTE = [
  '#3b7ff5', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#06b6d4', '#ec4899', '#f97316',
]

const POLICIES: { value: Squad['delegation_policy']; label: string; desc: string }[] = [
  { value: 'sequential', label: 'Sequential', desc: 'Agents are called one at a time in order.' },
  { value: 'parallel', label: 'Parallel', desc: 'All members run simultaneously; results merged.' },
  { value: 'vote', label: 'Vote', desc: 'Each member responds; orchestrator selects best.' },
  { value: 'dynamic', label: 'Dynamic', desc: 'Orchestrator decides the pattern at runtime based on the task.' },
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  agents: Agent[]
  onCreated: (s: Squad) => void
}

export function NewSquadDialog({ open, onOpenChange, agents, onCreated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [lore, setLore] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [orchestrator, setOrchestrator] = useState('')
  const [telegramContact, setTelegramContact] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [policy, setPolicy] = useState<Squad['delegation_policy']>('dynamic')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleMember = (agentName: string) => {
    setMembers(prev =>
      prev.includes(agentName) ? prev.filter(m => m !== agentName) : [...prev, agentName]
    )
  }

  // Ensure orchestrator is always in members
  const effectiveMembers = orchestrator && !members.includes(orchestrator)
    ? [orchestrator, ...members]
    : members

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    if (!orchestrator) { setError('Select an orchestrator.'); return }
    if (effectiveMembers.length < 1) { setError('Add at least one member.'); return }
    setError('')
    setSaving(true)
    try {
      const squad = await createSquad({
        name: name.trim(),
        description: description.trim(),
        lore: lore.trim(),
        color,
        orchestrator,
        members: effectiveMembers,
        telegram_contact_agent: telegramContact || orchestrator,
        delegation_policy: policy,
      }).catch(() => ({
        id: `squad-${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        lore: lore.trim(),
        color,
        orchestrator,
        members: effectiveMembers,
        telegram_contact_agent: telegramContact || orchestrator,
        delegation_policy: policy,
        created_at: new Date().toISOString(),
      }))
      onCreated(squad)
      onOpenChange(false)
      // reset
      setName(''); setDescription(''); setColor(PALETTE[0])
      setLore(''); setOrchestrator(''); setTelegramContact('')
      setMembers([]); setPolicy('dynamic')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Squad</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Research & Intelligence"
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="What is this squad responsible for?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Shared lore</Label>
            <Textarea
              placeholder="Shared context/instructions for all agents in this squad..."
              value={lore}
              onChange={e => setLore(e.target.value)}
              rows={4}
              className="text-sm resize-none"
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Delegation policy */}
          <div className="space-y-1.5">
            <Label>Delegation policy</Label>
            <Select value={policy} onValueChange={v => setPolicy(v as Squad['delegation_policy'])}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICIES.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-sm">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{p.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Members */}
          <div className="space-y-2">
            <Label>Members</Label>
            <p className="text-xs text-muted-foreground">
              Select agents. Mark one as orchestrator (lead).
            </p>
            {agents.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No agents found.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {agents.map(agent => {
                  const selected = effectiveMembers.includes(agent.name)
                  const isOrch = orchestrator === agent.name
                  return (
                    <div
                      key={agent.name}
                      className={cn(
                        'flex items-center justify-between rounded-md border px-3 py-2 transition-colors',
                        selected
                          ? 'border-brand/50 bg-brand-muted'
                          : 'border-border bg-secondary/40 hover:bg-secondary'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMember(agent.name)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <span className={cn(
                          'font-mono text-xs',
                          selected ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {agent.name}
                        </span>
                      </button>
                      {selected && (
                        <button
                          type="button"
                          title={isOrch ? 'Orchestrator (click to unset)' : 'Set as orchestrator'}
                          onClick={() => setOrchestrator(isOrch ? '' : agent.name)}
                          className={cn(
                            'ml-2 shrink-0 transition-colors',
                            isOrch ? 'text-brand' : 'text-muted-foreground/40 hover:text-muted-foreground'
                          )}
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {orchestrator && (
              <p className="text-xs text-muted-foreground">
                Orchestrator: <span className="font-mono text-foreground">{orchestrator}</span>
              </p>
            )}
          </div>

          {effectiveMembers.length > 0 && (
            <div className="space-y-1.5">
              <Label>Telegram main contact</Label>
              <Select value={telegramContact || effectiveMembers[0]} onValueChange={setTelegramContact}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {effectiveMembers.map(member => (
                    <SelectItem key={member} value={member} className="font-mono text-sm">
                      {member}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-xs text-destructive-foreground">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Squad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
