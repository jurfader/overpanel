import { cn } from '@/lib/utils'
import { type SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, children, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full h-10 pl-3 pr-8 rounded-xl text-sm appearance-none transition-all duration-200',
            'bg-white/5 border border-white/10 text-[var(--text-primary)]',
            'focus:outline-none focus:border-[var(--primary)]/50 focus:bg-white/7',
            'focus:shadow-[0_0_0_3px_rgba(233,30,140,0.1)]',
            error && 'border-red-500/50',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
)
Select.displayName = 'Select'

export { Select }
