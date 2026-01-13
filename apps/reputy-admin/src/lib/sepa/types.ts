/**
 * Types pour la gestion des mandats SEPA
 */

export interface CreditorInfo {
  name: string;
  identifier: string; // ICS (Identifiant Créancier SEPA)
  address: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export interface DebtorInfo {
  name: string;
  email: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
  iban: string;
  bic?: string;
}

export interface MandateFormData {
  // Informations société/client
  companyName: string;
  address: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  country: string;
  // Coordonnées bancaires
  iban: string;
  bic?: string;
  // Acceptations
  acceptTerms: boolean;
  acceptSepaMandate: boolean;
}

export type MandateValidationError = {
  field: string;
  message: string;
};

// Délai légal avant premier prélèvement (5 jours ouvrés)
export const MANDATE_ACTIVATION_DELAY_DAYS = 5;

// Délai minimum avant prélèvement (2 jours ouvrés)
export const DEBIT_NOTICE_DELAY_DAYS = 2;
