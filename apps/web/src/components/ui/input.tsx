import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-10 rounded-xl text-sm transition-all duration-200',
            'bg-white/5 border border-white/10 text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)]',
            'focus:outline-none focus:border-[var(--primary)]/50 focus:bg-white/7',
            'focus:shadow-[0_0_0_3px_rgba(233,30,140,0.1)]',
            icon ? 'pl-10 pr-3' : 'px-3',
            error && 'border-red-500/50 focus:border-red-500/70',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'

export { Input }
