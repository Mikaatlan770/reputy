import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { HealthDashboardSkeleton } from '@/components/internal/email/skeletons'

export default function Loading() {
  return (
    <BackofficeLayout>
      <HealthDashboardSkeleton />
    </BackofficeLayout>
  )
}
