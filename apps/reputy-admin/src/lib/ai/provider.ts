/**
 * Service Provider IA pour Reputy
 * 
 * Ce module fournit une abstraction pour les providers IA (OpenAI, Anthropic, etc.)
 * permettant de changer facilement de provider sans modifier le code métier.
 * 
 * En V1: utilise des réponses mockées
 * Plus tard: brancher sur un vrai provider
 */

import type { AiTone, AiSuggestion, AiSuggestRequest } from '@/types'

// ===== INTERFACES PROVIDER =====

export interface AiProviderConfig {
  apiKey?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface AiProvider {
  name: string
  generateSuggestions(request: AiSuggestRequest): Promise<AiSuggestion[]>
}

// ===== MOCK PROVIDER (V1) =====

/**
 * Provider mock pour le développement
 * Génère des suggestions basées sur des règles simples
 */
export class MockAiProvider implements AiProvider {
  name = 'mock'

  async generateSuggestions(request: AiSuggestRequest): Promise<AiSuggestion[]> {
    // Simuler un délai réseau
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 500))

    const { reviewRating, tone, healthMode, instructions } = request

    // Templates selon la note et le mode santé
    const suggestions = this.getTemplates(reviewRating, tone, healthMode, instructions)

    return suggestions.map((text, index) => ({
      id: `suggestion-${Date.now()}-${index}`,
      tone,
      text,
      tokensUsed: Math.floor(text.length * 0.3),
    }))
  }

  private getTemplates(
    rating: number,
    tone: AiTone,
    healthMode: boolean,
    instructions?: string
  ): string[] {
    // Ajouter les consignes si présentes
    const addInstructions = (text: string) => {
      if (instructions?.includes('appel') || instructions?.includes('téléphone')) {
        return text + ' N\'hésitez pas à nous appeler pour en discuter.'
      }
      if (instructions?.includes('mail') || instructions?.includes('email')) {
        return text + ' Vous pouvez nous contacter par email pour plus d\'informations.'
      }
      return text
    }

    // Avis positif (4-5 étoiles)
    if (rating >= 4) {
      if (healthMode) {
        return [
          addInstructions(
            tone === 'professional'
              ? 'Merci beaucoup pour votre confiance et ce retour positif. Nous sommes heureux d\'avoir pu vous accompagner. N\'hésitez pas à nous contacter si vous avez des questions.'
              : tone === 'warm'
              ? 'Un grand merci pour ce témoignage ! Nous sommes touchés par votre confiance. Au plaisir de vous revoir et de continuer à vous accompagner.'
              : tone === 'empathetic'
              ? 'Merci infiniment pour vos mots encourageants. Votre satisfaction est au cœur de notre engagement. Nous restons à votre entière disposition.'
              : 'Merci pour votre confiance !'
          ),
          addInstructions(
            'Nous vous remercions pour ce retour encourageant. Votre satisfaction est notre priorité. À très bientôt.'
          ),
          addInstructions(
            'Merci d\'avoir pris le temps de partager votre expérience. Nous sommes ravis de contribuer à votre bien-être.'
          ),
        ]
      }
      return [
        addInstructions(
          tone === 'professional'
            ? 'Merci beaucoup pour votre avis positif ! Nous sommes ravis que votre expérience ait été satisfaisante. Nous espérons vous revoir bientôt.'
            : tone === 'warm'
            ? 'Un grand merci pour ce super retour ! 😊 Ça nous fait vraiment plaisir de savoir que vous avez apprécié. À très vite !'
            : tone === 'empathetic'
            ? 'Merci infiniment pour ces mots qui nous touchent sincèrement. Votre satisfaction est notre plus belle récompense.'
            : 'Merci pour votre avis !'
        ),
        addInstructions(
          'Nous vous remercions chaleureusement pour votre retour ! Votre satisfaction est notre priorité. Au plaisir de vous revoir !'
        ),
        addInstructions(
          'Merci d\'avoir pris le temps de partager votre expérience positive. C\'est toujours un plaisir de vous accueillir !'
        ),
      ]
    }

    // Avis neutre (3 étoiles)
    if (rating === 3) {
      if (healthMode) {
        return [
          addInstructions(
            tone === 'professional'
              ? 'Merci pour votre retour. Nous prenons note de vos observations afin d\'améliorer notre accompagnement. N\'hésitez pas à nous contacter directement pour échanger.'
              : tone === 'empathetic'
              ? 'Nous vous remercions d\'avoir partagé votre ressenti. Votre avis compte beaucoup pour nous et nous souhaitons nous améliorer. Nous serions heureux d\'en discuter avec vous.'
              : 'Merci pour votre retour. Nous restons à votre écoute pour toute question.'
          ),
          addInstructions(
            'Nous vous remercions pour ce retour. Nous sommes attentifs à vos remarques et travaillons continuellement à améliorer notre service.'
          ),
          addInstructions(
            'Merci d\'avoir pris le temps de nous faire part de votre expérience. Nous prenons vos observations très au sérieux.'
          ),
        ]
      }
      return [
        addInstructions(
          tone === 'professional'
            ? 'Merci pour votre retour. Nous prenons note de vos remarques pour nous améliorer. N\'hésitez pas à nous contacter pour en discuter.'
            : tone === 'warm'
            ? 'Merci d\'avoir partagé votre avis ! Nous sommes désolés que tout n\'ait pas été parfait. Vos retours nous aident à progresser. 🙏'
            : tone === 'empathetic'
            ? 'Nous vous remercions sincèrement pour votre franchise. Chaque retour nous aide à grandir. Nous espérons avoir l\'occasion de vous surprendre positivement.'
            : 'Merci pour votre retour. Nous prenons note.'
        ),
        addInstructions(
          'Merci pour votre avis. Nous comprenons vos réserves et travaillons à nous améliorer continuellement.'
        ),
        addInstructions(
          'Nous apprécions votre retour honnête. Vos observations sont précieuses pour notre amélioration continue.'
        ),
      ]
    }

    // Avis négatif (1-2 étoiles)
    if (healthMode) {
      return [
        addInstructions(
          tone === 'professional'
            ? 'Nous vous remercions d\'avoir pris le temps de nous faire part de votre expérience. Nous sommes sincèrement désolés que celle-ci n\'ait pas été à la hauteur de vos attentes. Nous vous invitons à nous contacter directement afin d\'échanger sur votre situation.'
            : tone === 'empathetic'
            ? 'Nous sommes vraiment navrés de lire votre témoignage. Votre ressenti nous touche et nous souhaitons comprendre ce qui s\'est passé. Merci de nous contacter pour que nous puissions en discuter ensemble.'
            : 'Nous sommes désolés pour cette expérience. Merci de nous contacter directement pour en parler.'
        ),
        addInstructions(
          'Nous regrettons sincèrement que votre expérience n\'ait pas été satisfaisante. Nous vous invitons à nous joindre directement pour échanger de manière confidentielle.'
        ),
        addInstructions(
          'Votre retour nous interpelle et nous souhaitons y remédier. N\'hésitez pas à prendre contact avec nous pour que nous puissions en discuter.'
        ),
      ]
    }

    return [
      addInstructions(
        tone === 'professional'
          ? 'Nous vous remercions pour votre retour et sommes sincèrement désolés que votre expérience n\'ait pas été satisfaisante. Nous prenons vos remarques très au sérieux et serions heureux d\'en discuter avec vous.'
          : tone === 'warm'
          ? 'Oh non, nous sommes vraiment désolés ! 😔 Ce n\'est pas l\'expérience que nous souhaitons offrir. Pouvez-vous nous contacter pour qu\'on puisse arranger ça ?'
          : tone === 'empathetic'
          ? 'Nous sommes sincèrement navrés de lire votre témoignage. Votre déception nous touche profondément. Nous souhaitons vraiment comprendre et nous améliorer.'
          : 'Nous sommes désolés. Merci de nous contacter.'
      ),
      addInstructions(
        'Nous regrettons sincèrement cette mauvaise expérience. Nous aimerions comprendre ce qui s\'est passé et trouver une solution ensemble.'
      ),
      addInstructions(
        'Votre retour nous interpelle et nous voulons nous améliorer. N\'hésitez pas à nous contacter pour en discuter.'
      ),
    ]
  }
}

// ===== PLACEHOLDER POUR FUTURS PROVIDERS =====

/**
 * Provider OpenAI (à implémenter)
 * Utilise l'API OpenAI pour générer des suggestions
 */
export class OpenAiProvider implements AiProvider {
  name = 'openai'
  private config: AiProviderConfig

  constructor(config: AiProviderConfig) {
    this.config = config
  }

  async generateSuggestions(request: AiSuggestRequest): Promise<AiSuggestion[]> {
    // TODO: Implémenter l'appel à l'API OpenAI
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.config.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     model: this.config.model || 'gpt-4',
    //     messages: [...],
    //     max_tokens: this.config.maxTokens || 500,
    //     temperature: this.config.temperature || 0.7,
    //     n: 3, // 3 suggestions
    //   }),
    // })
    
    // Fallback sur mock pour l'instant
    const mockProvider = new MockAiProvider()
    return mockProvider.generateSuggestions(request)
  }
}

/**
 * Provider Anthropic (à implémenter)
 * Utilise l'API Claude pour générer des suggestions
 */
export class AnthropicProvider implements AiProvider {
  name = 'anthropic'
  private config: AiProviderConfig

  constructor(config: AiProviderConfig) {
    this.config = config
  }

  async generateSuggestions(request: AiSuggestRequest): Promise<AiSuggestion[]> {
    // TODO: Implémenter l'appel à l'API Anthropic
    // Fallback sur mock pour l'instant
    const mockProvider = new MockAiProvider()
    return mockProvider.generateSuggestions(request)
  }
}

// ===== FACTORY =====

export type ProviderType = 'mock' | 'openai' | 'anthropic'

/**
 * Crée une instance de provider selon le type
 */
export function createAiProvider(
  type: ProviderType = 'mock',
  config?: AiProviderConfig
): AiProvider {
  switch (type) {
    case 'openai':
      return new OpenAiProvider(config || {})
    case 'anthropic':
      return new AnthropicProvider(config || {})
    case 'mock':
    default:
      return new MockAiProvider()
  }
}

// ===== INSTANCE PAR DÉFAUT =====

// Utiliser mock en développement, configurable via env
const defaultProviderType = (process.env.NEXT_PUBLIC_AI_PROVIDER as ProviderType) || 'mock'
export const aiProvider = createAiProvider(defaultProviderType)





