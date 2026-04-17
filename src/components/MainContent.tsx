'use client'

import { useSidebar } from '@/contexts/SidebarContext'

export default function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <main className={`flex-1 transition-all duration-300 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
      {children}
    </main>
  )
}
