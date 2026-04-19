'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getProjects, createProject, getSquads, type Project, type Squad } from '@/lib/api'
import { formatDistanceToNow } from '@/lib/time'

function ProjectCard({
  project,
  squadName,
  squadColor,
}: {
  project: Project
  squadName: string
  squadColor: string
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-lg border border-border bg-card p-5 hover:border-brand/50 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors leading-snug">
          {project.name}
        </h2>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
          style={{ backgroundColor: `${squadColor}20`, color: squadColor }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: squadColor }} />
          {squadName}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
        {project.description}
      </p>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{project.run_count} runs</span>
        <span>{project.artifact_count} artifacts</span>
        <span className="ml-auto">
          {formatDistanceToNow(project.updated_at)}
        </span>
      </div>
    </Link>
  )
}

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
  squads,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (p: Project) => void
  squads: Squad[]
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedSquadId, setSelectedSquadId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!selectedSquadId && squads.length > 0) {
      setSelectedSquadId(squads[0].id)
    }
  }, [open, squads, selectedSquadId])

  const handleCreate = async () => {
    if (!name.trim() || !selectedSquadId.trim()) return
    setSaving(true)
    try {
      const p = await createProject({
        name: name.trim(),
        description: description.trim(),
        notes: notes.trim(),
        squad_id: selectedSquadId,
      }).catch(() => ({
        id: `proj-${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        notes: notes.trim(),
        squad_id: selectedSquadId,
        updated_at: new Date().toISOString(),
        run_count: 0,
        artifact_count: 0,
      } as Project))
      onCreated(p)
      setName('')
      setDescription('')
      setNotes('')
      setSelectedSquadId(squads[0]?.id ?? '')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="Q2 Research"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="What is this project for?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Squad</Label>
            <select
              value={selectedSquadId}
              onChange={e => setSelectedSquadId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground"
            >
              {squads.length === 0 ? (
                <option value="">No squads available</option>
              ) : (
                squads.map(squad => (
                  <option key={squad.id} value={squad.id}>
                    {squad.name}
                  </option>
                ))
              )}
            </select>
            <p className="text-xs text-muted-foreground">
              Projects are owned by one squad and are grouped by squad in this view.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Context, constraints, agent hints..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || !selectedSquadId.trim() || saving}>
            {saving ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [squads, setSquads] = useState<Squad[]>([])
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
    getSquads().then(setSquads).catch(() => setSquads([]))
  }, [])

  const sections = useMemo(() => {
    if (projects === null) return null
    const byKey = new Map<string, { key: string; label: string; color: string; projects: Project[] }>()
    for (const project of projects) {
      const squadId = project.squad_id
      const squad = squadId ? squads.find(item => item.id === squadId) : undefined
      const key = squad?.id ?? 'unassigned'
      const section = byKey.get(key)
      if (section) {
        section.projects.push(project)
        continue
      }
      byKey.set(key, {
        key,
        label: squad?.name ?? (squadId ? squadId : 'No squad'),
        color: squad?.color ?? '#6b7280',
        projects: [project],
      })
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [projects, squads])

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projects ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {sections === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h2 className="text-base font-medium text-foreground mb-1">No projects yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Projects group runs and artifacts. Create one to start organizing your work.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(section => (
            <div key={section.key} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: section.color }} />
                <h2 className="text-sm font-medium text-foreground">{section.label}</h2>
                <span className="text-xs text-muted-foreground">{section.projects.length} projects</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    squadName={section.label}
                    squadColor={section.color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        squads={squads}
        onCreated={p => setProjects(prev => prev ? [p, ...prev] : [p])}
      />
    </>
  )
}
