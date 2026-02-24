import Link from 'next/link'
import { CheckCircle, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/pricing-data'

const planColors: Record<string, { bg: string; border: string; accent: string }> = {
  bronze: {
    bg: 'bg-gradient-to-br from-amber-700 to-amber-900',
    border: 'border-amber-600',
    accent: 'text-amber-400',
  },
  argent: {
    bg: 'bg-gradient-to-br from-slate-500 to-slate-700',
    border: 'border-slate-400',
    accent: 'text-slate-300',
  },
  platinum: {
    bg: 'bg-gradient-to-br from-slate-800 to-slate-950',
    border: 'border-slate-600',
    accent: 'text-slate-300',
  },
}

const dotColors: Record<string, string> = {
  bronze: 'bg-amber-700',
  argent: 'bg-slate-400',
  platinum: 'bg-slate-800',
}

function getHeadingClass(plan: Plan): string {
  if (plan.isPopular) return 'text-white'
  if (plan.id === 'platinum') return 'bg-gradient-to-r from-slate-500 to-slate-700 bg-clip-text text-transparent'
  return 'text-gray-900'
}

function getCtaClass(plan: Plan): string {
  if (plan.isPopular) return 'bg-white text-gray-900 hover:bg-gray-100 shadow-lg'
  return 'bg-primary-900 text-white hover:bg-primary-950'
}

function popularOr(isPopular: boolean, popularClass: string, defaultClass: string): string {
  return isPopular ? popularClass : defaultClass
}

interface PricingCardProps {
  plan: Plan
  className?: string
}

export function PricingCard({ plan, className }: PricingCardProps) {
  const isPopular = plan.isPopular
  const colors = planColors[plan.id]
  const headingClass = getHeadingClass(plan)

  return (
    <div
      className={cn(
        'relative rounded-3xl p-8 transition-all duration-300',
        isPopular
          ? `${colors.bg} text-white ring-4 ring-primary-400 ring-offset-4 shadow-2xl`
          : 'bg-white border-2 border-gray-100 hover:border-gray-200 hover:shadow-lg',
        className
      )}
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-4 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full shadow-lg">
            <Sparkles className="h-4 w-4" />
            Populaire
          </span>
        </div>
      )}

      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className={cn('w-4 h-4 rounded-full', dotColors[plan.id])} />
          <h3 className={cn('text-2xl font-bold', headingClass)}>
            {plan.name}
          </h3>
        </div>

        <p className={cn('text-sm mb-4', popularOr(isPopular, 'text-white/80', 'text-gray-500'))}>
          {plan.subtitle}
        </p>

        <PricingAmount plan={plan} headingClass={headingClass} />
      </div>

      <ul className="space-y-3 mb-8">
        {plan.included.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <CheckCircle className={cn('h-5 w-5 flex-shrink-0 mt-0.5', popularOr(isPopular, 'text-green-400', 'text-green-500'))} />
            <span className={popularOr(isPopular, 'text-white/90', 'text-gray-700')}>{feature}</span>
          </li>
        ))}
        {plan.excluded.map((feature) => (
          <li key={`ex-${feature}`} className="flex items-start gap-3">
            <X className={cn('h-5 w-5 flex-shrink-0 mt-0.5', popularOr(isPopular, 'text-white/40', 'text-gray-300'))} />
            <span className={cn('line-through', popularOr(isPopular, 'text-white/40', 'text-gray-400'))}>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.ctaHref}
        className={cn('block w-full py-3 px-6 rounded-xl font-semibold text-center transition-all', getCtaClass(plan))}
      >
        {plan.cta}
      </Link>
    </div>
  )
}

function PricingAmount({ plan, headingClass }: { plan: Plan; headingClass: string }) {
  const isPopular = plan.isPopular

  if (plan.isTrial) {
    return (
      <>
        <div className="flex items-baseline justify-center gap-1">
          <span className={cn('text-5xl font-bold', popularOr(isPopular, 'text-white', 'text-gray-900'))}>
            Gratuit
          </span>
        </div>
        <p className={cn('text-sm mt-1', popularOr(isPopular, 'text-white/70', 'text-gray-500'))}>
          {plan.period}
        </p>
      </>
    )
  }

  return (
    <div className="flex items-baseline justify-center gap-1">
      <span className={cn('text-5xl font-bold', headingClass)}>
        {plan.price}€
      </span>
      <span className={popularOr(isPopular, 'text-white/70', 'text-gray-500')}>
        {plan.period}
      </span>
    </div>
  )
}
