'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2,
  Info,
  ExternalLink
} from 'lucide-react';
import { 
  TERMS_SECTIONS, 
  KEY_POINTS, 
  TERMS_VERSION, 
  TERMS_DATE,
  COMPANY_INFO
} from '@/lib/legal/terms-content';

export default function TermsPage() {
  const [expandedSections, setExpandedSections] = useState<string[]>(['objet']);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id)
        : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-8 h-8 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">
                  Conditions Générales d'Utilisation et de Vente
                </h1>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Badge variant="outline">Version {TERMS_VERSION}</Badge>
                <span>•</span>
                <span>Mise à jour le {TERMS_DATE}</span>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Télécharger PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="mb-8 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-blue-900">
              <Info className="w-5 h-5" />
              Résumé des points essentiels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-800 mb-4">
              Ce résumé est fourni à titre informatif. Seul le texte complet ci-dessous fait foi.
            </p>
            <div className="grid gap-3">
              {KEY_POINTS.map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900">{point.title}</p>
                    <p className="text-sm text-blue-700">{point.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Conditions générales complètes</h2>
        </div>

        <div className="space-y-3">
          {TERMS_SECTIONS.map((section) => (
            <Card key={section.id} className="overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <h3 className="font-medium text-left">{section.title}</h3>
                {expandedSections.includes(section.id) ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {expandedSections.includes(section.id) && (
                <CardContent className="pt-0 pb-6 px-6">
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">
                    {section.content.split('**').map((part, i) => 
                      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        <Card className="mt-8 bg-gray-100 border-gray-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-4">Éditeur du Service</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>{COMPANY_INFO.name}</strong></p>
              <p>{COMPANY_INFO.legalForm} au capital de {COMPANY_INFO.capital}</p>
              <p>{COMPANY_INFO.address.street}</p>
              <p>{COMPANY_INFO.address.postalCode} {COMPANY_INFO.address.city}, {COMPANY_INFO.address.country}</p>
              <p className="pt-2">RCS : {COMPANY_INFO.rcs}</p>
              <p>SIRET : {COMPANY_INFO.siret}</p>
              <p>TVA : {COMPANY_INFO.tva}</p>
              <p className="pt-2">Contact : {COMPANY_INFO.email}</p>
              <p>DPO : {COMPANY_INFO.dpo}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
