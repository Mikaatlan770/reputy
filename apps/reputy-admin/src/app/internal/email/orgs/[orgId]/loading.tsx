import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { OrgDetailSkeleton } from '@/components/internal/email/skeletons'

export default function Loading() {
  return (
    <BackofficeLayout>
      <OrgDetailSkeleton />
    </BackofficeLayout>
  )
}
