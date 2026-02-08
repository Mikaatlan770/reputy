import { redirect } from 'next/navigation'

// Redirect to Health pricing section
export default function PricingPage() {
  redirect('/health#pricing')
}
