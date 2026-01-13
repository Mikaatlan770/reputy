import { NextRequest, NextResponse } from 'next/server'
import { aiProvider } from '@/lib/ai/provider'
import type { AiSuggestRequest, AiSuggestResponse, OrgSettings } from '@/types'

// ===== MOCK ORG SETTINGS =====
// En production, ces données viendraient de la base de données

const mockOrgSettings: OrgSettings = {
  id: 'org-1',
  name: 'Cabinet Dr. Atlan',
  plan: 'pro',
  aiEnabled: true, // Changer à false pour tester le paywall
  aiQuota: {
    monthlyLimit: 100,
    usedThisMonth: 23,
    resetDate: '2026-02-01',
  },
  healthModeDefault: true,
  createdAt: '2024-01-15',
}

// ===== API ENDPOINT =====

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      reviewId,
      reviewContent,
      reviewRating,
      tone = 'professional',
      instructions,
      healthMode = false,
    } = body as Partial<AiSuggestRequest>

    // Validation des paramètres
    if (!reviewId || !reviewContent || reviewRating === undefined) {
      return NextResponse.json(
        { error: 'Paramètres manquants: reviewId, reviewContent et reviewRating sont requis.' },
        { status: 400 }
      )
    }

    // Vérification de l'abonnement IA
    if (!mockOrgSettings.aiEnabled) {
      return NextResponse.json(
        { 
          error: 'L\'assistant IA n\'est pas activé pour votre compte.',
          code: 'AI_NOT_ENABLED',
          upgrade: true,
        },
        { status: 403 }
      )
    }

    // Vérification du quota
    const { aiQuota } = mockOrgSettings
    if (aiQuota.usedThisMonth >= aiQuota.monthlyLimit) {
      return NextResponse.json(
        { 
          error: 'Vous avez atteint votre quota mensuel de suggestions IA.',
          code: 'QUOTA_EXCEEDED',
          quota: aiQuota,
        },
        { status: 429 }
      )
    }

    // Générer les suggestions via le provider
    const suggestions = await aiProvider.generateSuggestions({
      reviewId,
      reviewContent,
      reviewRating,
      tone,
      instructions,
      healthMode,
    })

    // Calculer les tokens utilisés (mock)
    const totalTokens = suggestions.reduce((acc, s) => acc + (s.tokensUsed || 0), 0)

    // Mettre à jour le quota (mock - en production, update en BDD)
    const newUsedThisMonth = aiQuota.usedThisMonth + 1

    const response: AiSuggestResponse = {
      suggestions,
      tokensUsed: totalTokens,
      quotaRemaining: aiQuota.monthlyLimit - newUsedThisMonth,
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('[AI] Erreur génération suggestions:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération des suggestions.' },
      { status: 500 }
    )
  }
}

// ===== GET QUOTA STATUS =====

export async function GET() {
  // Retourne le statut IA et quota pour l'organisation
  return NextResponse.json({
    aiEnabled: mockOrgSettings.aiEnabled,
    plan: mockOrgSettings.plan,
    quota: mockOrgSettings.aiQuota,
  })
}





