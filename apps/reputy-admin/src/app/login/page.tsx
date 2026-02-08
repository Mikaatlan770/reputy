'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { LOGIN_URL } from '@/lib/constants'

/**
 * Page de login sur reputy-admin (3002)
 * 
 * ⚠️ VERROUILLÉ - NE PAS MODIFIER ⚠️
 * 
 * Cette page N'AFFICHE PAS de formulaire de connexion.
 * Elle redirige TOUJOURS vers le site web principal (3001).
 * 
 * Flux d'authentification :
 * 1. Utilisateur arrive sur 3002 sans session
 * 2. app-layout.tsx détecte mode === 'NONE'
 * 3. Redirection vers 3001/login
 * 4. Utilisateur se connecte sur 3001
 * 5. 3001 redirige vers 3002 avec le token
 * 
 * Cette page existe uniquement comme filet de sécurité
 * si quelqu'un accède directement à /login sur 3002.
 */

export default function LoginRedirect() {
  useEffect(() => {
    // Redirection immédiate et obligatoire vers le site web
    window.location.href = LOGIN_URL
  }, [])

  // Afficher un loader pendant la redirection (très bref)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-gray-500">Redirection vers la page de connexion...</p>
    </div>
  )
}
