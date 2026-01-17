import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reputy - Gérez votre e-réputation en toute simplicité',
  description: 'La solution complète pour collecter, gérer et diffuser vos avis clients. Boostez votre réputation en ligne.',
  keywords: ['avis clients', 'e-réputation', 'google reviews', 'gestion avis', 'réputation en ligne'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
