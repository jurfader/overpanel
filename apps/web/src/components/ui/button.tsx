'use client'

import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 rounded-xl cursor-pointer select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Variants
        variant === 'primary' && [
          'gradient-brand text-white',
          'hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]',
          'shadow-[0_0_20px_rgba(233,30,140,0.3)]',
          'hover:shadow-[0_0_30px_rgba(233,30,140,0.5)]',
        ],
        variant === 'secondary' && [
          'bg-white/5 text-[var(--text-primary)] border border-white/10',
          'hover:bg-white/10 hover:border-white/20 active:scale-[0.98]',
        ],
        variant === 'ghost' && [
          'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          'hover:bg-white/5 active:scale-[0.98]',
        ],
        variant === 'danger' && [
          'bg-red-500/10 text-red-400 border border-red-500/20',
          'hover:bg-red-500/20 hover:border-red-500/40 active:scale-[0.98]',
        ],
        variant === 'outline' && [
          'border border-[var(--primary)]/40 text-[var(--primary)]',
          'hover:bg-[var(--primary)]/10 active:scale-[0.98]',
        ],
        // Sizes
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'

export { Button }
