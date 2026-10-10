import './styles.css'
import { TooltipProvider } from '@dn/ui'
import type { ReactNode } from 'react'

export default function Frame({ theme, children }: { theme: string; children: ReactNode }) {
  return (
    <TooltipProvider>
      <div data-theme={theme} className="min-h-screen bg-canvas p-4 font-sans text-text md:p-8">
        {children}
      </div>
    </TooltipProvider>
  )
}
