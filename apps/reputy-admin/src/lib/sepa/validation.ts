/**
 * Validation des données SEPA
 */

import { MandateFormData, MandateValidationError } from './types';

/**
 * Valide un IBAN
 */
export function validateIBAN(iban: string): boolean {
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  
  if (cleanIban.length < 15 || cleanIban.length > 34) {
    return false;
  }
  
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIban)) {
    return false;
  }
  
  const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);
  
  let numericString = '';
  for (const char of rearranged) {
    if (/[A-Z]/.test(char)) {
      numericString += (char.charCodeAt(0) - 55).toString();
    } else {
      numericString += char;
    }
  }
  
  let remainder = 0;
  for (const digit of numericString) {
    remainder = (remainder * 10 + parseInt(digit)) % 97;
  }
  
  return remainder === 1;
}

/**
 * Formate un IBAN pour l'affichage
 */
export function formatIBAN(iban: string): string {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Masque un IBAN
 */
export function maskIBAN(iban: string): string {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length < 8) return '****';
  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`;
}

/**
 * Valide un BIC
 */
export function validateBIC(bic: string): boolean {
  const cleanBic = bic.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBic);
}

/**
 * Valide les données du formulaire de mandat
 */
export function validateMandateForm(data: MandateFormData): MandateValidationError[] {
  const errors: MandateValidationError[] = [];
  
  if (!data.companyName || data.companyName.trim().length < 2) {
    errors.push({
      field: 'companyName',
      message: 'Le nom de la société est requis (minimum 2 caractères)'
    });
  }
  
  if (!data.address || data.address.trim().length < 5) {
    errors.push({
      field: 'address',
      message: 'L\'adresse est requise'
    });
  }
  
  if (!data.city || data.city.trim().length < 2) {
    errors.push({
      field: 'city',
      message: 'La ville est requise'
    });
  }
  
  if (!data.postalCode || !/^[0-9A-Z\-\s]{3,10}$/i.test(data.postalCode)) {
    errors.push({
      field: 'postalCode',
      message: 'Le code postal est invalide'
    });
  }
  
  if (!data.country || data.country.length !== 2) {
    errors.push({
      field: 'country',
      message: 'Le pays est requis (code ISO 2 lettres)'
    });
  }
  
  if (!data.iban) {
    errors.push({
      field: 'iban',
      message: 'L\'IBAN est requis'
    });
  } else if (!validateIBAN(data.iban)) {
    errors.push({
      field: 'iban',
      message: 'L\'IBAN est invalide'
    });
  }
  
  if (data.bic && !validateBIC(data.bic)) {
    errors.push({
      field: 'bic',
      message: 'Le BIC est invalide'
    });
  }
  
  if (!data.acceptTerms) {
    errors.push({
      field: 'acceptTerms',
      message: 'Vous devez accepter les conditions générales'
    });
  }
  
  if (!data.acceptSepaMandate) {
    errors.push({
      field: 'acceptSepaMandate',
      message: 'Vous devez accepter le mandat de prélèvement SEPA'
    });
  }
  
  return errors;
}

/**
 * Génère une Référence Unique de Mandat (RUM)
 */
export function generateMandateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RPT-${timestamp}-${random}`;
}

/**
 * Calcule la date d'activation du mandat (J+5 ouvrés)
 */
export function calculateActivationDate(signatureDate: Date): Date {
  const date = new Date(signatureDate);
  let businessDays = 0;
  
  while (businessDays < 5) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      businessDays++;
    }
  }
  
  return date;
}

/**
 * Calcule la date minimum de prélèvement (J+2 ouvrés)
 */
export function calculateMinDebitDate(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  let businessDays = 0;
  
  while (businessDays < 2) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      businessDays++;
    }
  }
  
  return date;
}
