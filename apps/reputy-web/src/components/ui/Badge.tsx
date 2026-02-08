import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'popular' | 'coming-soon' | 'trial' | 'default'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full',
        variant === 'popular' && 'bg-amber-400 text-amber-900',
        variant === 'coming-soon' && 'bg-gray-200 text-gray-600',
        variant === 'trial' && 'bg-sky-100 text-sky-700',
        variant === 'default' && 'bg-primary-100 text-primary-700',
        className
      )}
    >
      {children}
    </span>
  )
}
