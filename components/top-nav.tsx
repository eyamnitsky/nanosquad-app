'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/agents', label: 'Agents' },
  { href: '/squads', label: 'Squads' },
  { href: '/projects', label: 'Projects' },
  { href: '/runs', label: 'Runs' },
  { href: '/artifacts', label: 'Artifacts' },
  { href: '/ask', label: 'Ask' },
  { href: '/skills', label: 'Skills' },
  { href: '/models', label: 'Models' },
  { href: '/logs', label: 'Logs' },
  { href: '/settings', label: 'Settings' },
]

export function TopNav() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
        <Link href="/agents" className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
            nano<span className="text-brand">squad</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Primary navigation">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
