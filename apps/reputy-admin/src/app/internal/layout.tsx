import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Backoffice Reputy - Administration',
  description: 'Backoffice interne pour la gestion des clients Reputy',
}

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Layout séparé sans la sidebar/topbar de l'app principale
  return <>{children}</>
}
