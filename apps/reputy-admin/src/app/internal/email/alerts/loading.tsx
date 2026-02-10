import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { AlertsTableSkeleton } from '@/components/internal/email/skeletons'

export default function Loading() {
  return (
    <BackofficeLayout>
      <AlertsTableSkeleton />
    </BackofficeLayout>
  )
}
