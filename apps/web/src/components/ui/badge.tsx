import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
        variant === 'success' && 'bg-green-500/10 text-green-400 border border-green-500/20',
        variant === 'warning' && 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
        variant === 'error' && 'bg-red-500/10 text-red-400 border border-red-500/20',
        variant === 'info' && 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        variant === 'neutral' && 'bg-white/5 text-[var(--text-secondary)] border border-white/10',
        variant === 'brand' && 'bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20',
        className
      )}
      {...props}
    />
  )
}
