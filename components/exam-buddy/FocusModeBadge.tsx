import { Sparkles } from 'lucide-react'

interface FocusModeBadgeProps {
  label?: string
}

export function FocusModeBadge({ label = 'Focus Mode' }: FocusModeBadgeProps) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Sparkles className="w-3.5 h-3.5" style={{ color: '#6D5EF5' }} />
      <span
        className="text-[10px] font-semibold tracking-[0.22em] uppercase"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        {label}
      </span>
    </div>
  )
}
