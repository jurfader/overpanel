'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: 'pink' | 'purple' | 'blue' | 'green'
  className?: string
}

const colorMap = {
  pink: {
    icon: 'text-[#E91E8C]',
    bg: 'bg-[#E91E8C]/10',
    glow: 'shadow-[0_0_30px_rgba(233,30,140,0.1)]',
    border: 'border-[#E91E8C]/15',
  },
  purple: {
    icon: 'text-[#9B26D9]',
    bg: 'bg-[#9B26D9]/10',
    glow: 'shadow-[0_0_30px_rgba(155,38,217,0.1)]',
    border: 'border-[#9B26D9]/15',
  },
  blue: {
    icon: 'text-blue-400',
    bg: 'bg-blue-500/10',
    glow: 'shadow-[0_0_30px_rgba(59,130,246,0.1)]',
    border: 'border-blue-500/15',
  },
  green: {
    icon: 'text-green-400',
    bg: 'bg-green-500/10',
    glow: 'shadow-[0_0_30px_rgba(34,197,94,0.1)]',
    border: 'border-green-500/15',
  },
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'pink', className }: StatCardProps) {
  const colors = colorMap[color]

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div
        className={cn(
          'glass-card rounded-2xl p-5 border transition-all duration-300 hover:scale-[1.02]',
          colors.border,
          colors.glow,
          className
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colors.bg)}>
            <Icon className={cn('w-5 h-5', colors.icon)} />
          </div>
          {trend && (
            <span
              className={cn(
                'text-xs font-medium px-2 py-1 rounded-lg',
                trend.value >= 0
                  ? 'text-green-400 bg-green-500/10'
                  : 'text-red-400 bg-red-500/10'
              )}
            >
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </span>
          )}
        </div>
        <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-widest mb-1">
          {title}
        </p>
        <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
        {subtitle && (
          <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>
        )}
      </div>
    </motion.div>
  )
}
