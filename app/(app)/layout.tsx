import { TopNav } from '@/components/top-nav'
import { ServerBanner } from '@/components/server-banner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <ServerBanner />
      <TopNav />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
