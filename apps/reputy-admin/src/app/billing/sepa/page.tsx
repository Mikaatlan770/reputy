'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  CreditCard, 
  Building2, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Shield,
  Clock,
  Info
} from 'lucide-react';
import { 
  validateMandateForm, 
  formatIBAN, 
  generateMandateReference,
  calculateActivationDate
} from '@/lib/sepa';
import type { MandateFormData, MandateValidationError } from '@/lib/sepa';

const CREDITOR_INFO = {
  name: 'REPUTY SAS',
  identifier: 'FR00ZZZ000000',
  address: {
    line1: '123 Rue de la République',
    city: 'Paris',
    postalCode: '75001',
    country: 'FR'
  }
};

const COUNTRIES = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'CH', name: 'Suisse' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'DE', name: 'Allemagne' },
];

export default function SepaMandatePage() {
  const [formData, setFormData] = useState<MandateFormData>({
    companyName: '',
    address: '',
    addressLine2: '',
    city: '',
    postalCode: '',
    country: 'FR',
    iban: '',
    bic: '',
    acceptTerms: false,
    acceptSepaMandate: false,
  });
  
  const [errors, setErrors] = useState<MandateValidationError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [mandateRef, setMandateRef] = useState<string | null>(null);

  const handleChange = (field: keyof MandateFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => prev.filter(e => e.field !== field));
  };

  const handleIbanChange = (value: string) => {
    const formatted = formatIBAN(value);
    setFormData(prev => ({ ...prev, iban: formatted }));
    setErrors(prev => prev.filter(e => e.field !== 'iban'));
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find(e => e.field === field)?.message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateMandateForm(formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const ref = generateMandateReference();
      setMandateRef(ref);
      setIsSuccess(true);
    } catch {
      setErrors([{ field: 'form', message: 'Erreur lors de la création du mandat. Veuillez réessayer.' }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess && mandateRef) {
    const activationDate = calculateActivationDate(new Date());
    
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-green-800">
                  Mandat SEPA créé avec succès
                </h2>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détails du mandat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Référence unique (RUM)</p>
                  <p className="font-mono font-medium">{mandateRef}</p>
                </div>
                <div>
                  <p className="text-gray-500">Date de signature</p>
                  <p className="font-medium">{new Date().toLocaleDateString('fr-FR')}</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800">Délai d'activation</p>
                    <p className="text-sm text-blue-700">
                      Votre mandat sera actif à partir du{' '}
                      <strong>{activationDate.toLocaleDateString('fr-FR')}</strong>.
                      Conformément à la réglementation SEPA, un délai de 5 jours ouvrés
                      est requis avant le premier prélèvement.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1">
                  <FileText className="w-4 h-4 mr-2" />
                  Télécharger le mandat PDF
                </Button>
                <Button className="flex-1" onClick={() => window.location.href = '/billing'}>
                  Retour à la facturation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mandat de prélèvement SEPA</h1>
          <p className="text-gray-500 mt-1">
            Configurez le prélèvement automatique pour vos abonnements
          </p>
        </div>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Shield className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div className="space-y-2">
                <h3 className="font-semibold text-blue-900">Prélèvement sécurisé</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Vos données bancaires sont chiffrées et sécurisées</li>
                  <li>• Vous pouvez révoquer ce mandat à tout moment</li>
                  <li>• Délai de 5 jours ouvrés avant le premier prélèvement</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Créancier (bénéficiaire des paiements)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                  <p><strong>{CREDITOR_INFO.name}</strong></p>
                  <p>{CREDITOR_INFO.address.line1}</p>
                  <p>{CREDITOR_INFO.address.postalCode} {CREDITOR_INFO.address.city}</p>
                  <p className="text-gray-500">ICS : {CREDITOR_INFO.identifier}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Débiteur (titulaire du compte)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de la société / Professionnel *
                  </label>
                  <Input
                    value={formData.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    placeholder="Cabinet Dr. Martin"
                    className={getFieldError('companyName') ? 'border-red-500' : ''}
                  />
                  {getFieldError('companyName') && (
                    <p className="text-sm text-red-500 mt-1">{getFieldError('companyName')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse *
                  </label>
                  <Input
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="123 Rue de la Santé"
                    className={getFieldError('address') ? 'border-red-500' : ''}
                  />
                  {getFieldError('address') && (
                    <p className="text-sm text-red-500 mt-1">{getFieldError('address')}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code postal *
                    </label>
                    <Input
                      value={formData.postalCode}
                      onChange={(e) => handleChange('postalCode', e.target.value)}
                      placeholder="75001"
                      className={getFieldError('postalCode') ? 'border-red-500' : ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ville *
                    </label>
                    <Input
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      placeholder="Paris"
                      className={getFieldError('city') ? 'border-red-500' : ''}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pays *
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Coordonnées bancaires
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IBAN *
                  </label>
                  <Input
                    value={formData.iban}
                    onChange={(e) => handleIbanChange(e.target.value)}
                    placeholder="FR76 1234 5678 9012 3456 7890 123"
                    className={`font-mono ${getFieldError('iban') ? 'border-red-500' : ''}`}
                  />
                  {getFieldError('iban') && (
                    <p className="text-sm text-red-500 mt-1">{getFieldError('iban')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    BIC (optionnel)
                  </label>
                  <Input
                    value={formData.bic}
                    onChange={(e) => handleChange('bic', e.target.value.toUpperCase())}
                    placeholder="BNPAFRPP"
                    className="font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acceptations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acceptSepaMandate}
                    onChange={(e) => handleChange('acceptSepaMandate', e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">
                      J'autorise {CREDITOR_INFO.name} à envoyer des instructions à ma banque pour débiter mon compte.
                    </p>
                    {getFieldError('acceptSepaMandate') && (
                      <p className="text-red-500 mt-1">{getFieldError('acceptSepaMandate')}</p>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acceptTerms}
                    onChange={(e) => handleChange('acceptTerms', e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <div className="text-sm">
                    <p className="text-gray-700">
                      J'ai lu et j'accepte les{' '}
                      <a href="/legal/terms" className="text-blue-600 hover:underline" target="_blank">
                        conditions générales
                      </a>.
                    </p>
                    {getFieldError('acceptTerms') && (
                      <p className="text-red-500 mt-1">{getFieldError('acceptTerms')}</p>
                    )}
                  </div>
                </label>
              </CardContent>
            </Card>

            {getFieldError('form') && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-red-800">{getFieldError('form')}</p>
              </div>
            )}

            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => window.history.back()}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Signer le mandat SEPA
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
