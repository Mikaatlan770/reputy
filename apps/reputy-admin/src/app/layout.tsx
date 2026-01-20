import type { Metadata } from 'next'
import './globals.css'
import { AppLayout } from '@/components/layout/app-layout'
import { AuthProvider } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Reputy - Gestion E-réputation',
  description: 'Gérez votre e-réputation et vos avis clients en toute simplicité',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
      </body>
    </html>
  )
}





