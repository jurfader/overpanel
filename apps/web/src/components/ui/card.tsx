'use client'

import { cn } from '@/lib/utils'
import { type HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: 'pink' | 'purple' | 'none'
  variant?: 'default' | 'bright' | 'gradient'
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, glow = 'none', variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'glass-card rounded-2xl p-5 transition-all duration-300',
        variant === 'bright' && 'glass-bright',
        variant === 'gradient' && 'gradient-subtle border border-white/10',
        glow === 'pink' && 'hover:glow-pink',
        glow === 'purple' && 'hover:glow-purple',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-3 mb-4', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider', className)}
      {...props}
    />
  )
)
CardTitle.displayName = 'CardTitle'

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

export { Card, CardHeader, CardTitle, CardContent }
