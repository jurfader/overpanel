'use client'

import { cn } from '@/lib/utils'

interface ResourceGaugeProps {
  label: string
  value: number   // 0-100 percent
  detail?: string
  color?: 'pink' | 'purple' | 'blue' | 'green'
}

const gradients = {
  pink: 'from-[#E91E8C] to-[#9B26D9]',
  purple: 'from-[#9B26D9] to-[#C43BBF]',
  blue: 'from-blue-500 to-cyan-400',
  green: 'from-green-500 to-emerald-400',
}

const glows = {
  pink: 'shadow-[0_0_10px_rgba(233,30,140,0.5)]',
  purple: 'shadow-[0_0_10px_rgba(155,38,217,0.5)]',
  blue: 'shadow-[0_0_10px_rgba(59,130,246,0.5)]',
  green: 'shadow-[0_0_10px_rgba(34,197,94,0.5)]',
}

export function ResourceGauge({ label, value, detail, color = 'pink' }: ResourceGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const isHigh = clamped > 80

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)] font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {detail && <span className="text-[11px] text-[var(--text-muted)]">{detail}</span>}
          <span
            className={cn(
              'font-bold tabular-nums text-sm',
              isHigh ? 'text-red-400' : 'text-[var(--text-primary)]'
            )}
          >
            {clamped.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r transition-all duration-500',
            gradients[color],
            isHigh && glows[color]
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
