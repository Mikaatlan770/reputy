/**
 * Générateur de factures PDF pour Reputy
 * 
 * Utilise une approche HTML → PDF pour la flexibilité
 * En production, utiliser une lib comme @react-pdf/renderer ou puppeteer
 */

import type { Invoice, InvoiceLine } from '@/lib/billing/types'
import { formatPrice } from '@/lib/billing'

// ===== GÉNÉRATION HTML =====

/**
 * Génère le HTML d'une facture pour impression/PDF
 */
export function generateInvoiceHtml(invoice: Invoice): string {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatAmount = (cents: number) => formatPrice(cents)

  const linesHtml = invoice.lines
    .map(
      (line) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${line.description}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">${line.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatAmount(line.unitPrice)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600;">${formatAmount(line.total)}</td>
      </tr>
    `
    )
    .join('')

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facture ${invoice.number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1F2937;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
    <div>
      <h1 style="font-size: 32px; font-weight: 700; color: #3B82F6; margin-bottom: 4px;">REPUTY</h1>
      <p style="color: #6B7280; font-size: 12px;">Gestion de réputation en ligne</p>
    </div>
    <div style="text-align: right;">
      <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 8px;">FACTURE</h2>
      <p style="font-size: 16px; font-weight: 600; color: #3B82F6;">${invoice.number}</p>
    </div>
  </div>

  <!-- Infos -->
  <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
    <!-- Émetteur -->
    <div style="width: 45%;">
      <p style="font-weight: 600; color: #6B7280; font-size: 12px; text-transform: uppercase; margin-bottom: 8px;">Émetteur</p>
      <p style="font-weight: 600;">Reputy SAS</p>
      <p>123 Avenue de la République</p>
      <p>75011 Paris, France</p>
      <p style="margin-top: 8px;">TVA: FR98765432100</p>
      <p>SIRET: 123 456 789 00010</p>
    </div>
    <!-- Client -->
    <div style="width: 45%;">
      <p style="font-weight: 600; color: #6B7280; font-size: 12px; text-transform: uppercase; margin-bottom: 8px;">Facturé à</p>
      <p style="font-weight: 600;">${invoice.customerName}</p>
      <p>${invoice.customerAddress}</p>
      <p>${invoice.customerCity}</p>
      ${invoice.customerVatNumber ? `<p style="margin-top: 8px;">TVA: ${invoice.customerVatNumber}</p>` : ''}
    </div>
  </div>

  <!-- Dates -->
  <div style="display: flex; gap: 40px; margin-bottom: 32px; padding: 16px; background: #F9FAFB; border-radius: 8px;">
    <div>
      <p style="font-size: 12px; color: #6B7280;">Date de facture</p>
      <p style="font-weight: 600;">${formatDate(invoice.date)}</p>
    </div>
    <div>
      <p style="font-size: 12px; color: #6B7280;">Date d'échéance</p>
      <p style="font-weight: 600;">${formatDate(invoice.dueDate)}</p>
    </div>
    <div>
      <p style="font-size: 12px; color: #6B7280;">Statut</p>
      <p style="font-weight: 600; color: ${invoice.status === 'paid' ? '#10B981' : '#F59E0B'};">
        ${invoice.status === 'paid' ? 'Payée' : invoice.status === 'void' ? 'Annulée' : 'En attente'}
      </p>
    </div>
  </div>

  <!-- Table -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
    <thead>
      <tr style="background: #F3F4F6;">
        <th style="padding: 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6B7280;">Description</th>
        <th style="padding: 12px; text-align: center; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6B7280;">Qté</th>
        <th style="padding: 12px; text-align: right; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6B7280;">Prix unitaire HT</th>
        <th style="padding: 12px; text-align: right; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6B7280;">Total HT</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <!-- Totaux -->
  <div style="display: flex; justify-content: flex-end;">
    <div style="width: 280px;">
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB;">
        <span style="color: #6B7280;">Sous-total HT</span>
        <span>${formatAmount(invoice.subtotal)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB;">
        <span style="color: #6B7280;">TVA (${invoice.vatRate}%)</span>
        <span>${formatAmount(invoice.vatAmount)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 18px; font-weight: 700;">
        <span>Total TTC</span>
        <span style="color: #3B82F6;">${formatAmount(invoice.total)}</span>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 12px;">
    <p>Reputy SAS - Capital social: 10 000 € - RCS Paris 123 456 789</p>
    <p>contact@reputy.fr - www.reputy.fr</p>
  </div>
</body>
</html>
  `
}

/**
 * Génère un numéro de facture unique
 */
export function generateInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear()
  const num = sequence.toString().padStart(4, '0')
  return `RPTY-${year}-${num}`
}

/**
 * Télécharge la facture en ouvrant une nouvelle fenêtre pour impression
 */
export function downloadInvoicePdf(invoice: Invoice): void {
  const html = generateInvoiceHtml(invoice)
  
  // Ouvrir dans une nouvelle fenêtre pour impression
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    
    // Attendre le chargement puis lancer l'impression
    printWindow.onload = () => {
      printWindow.print()
    }
  }
}

/**
 * Prévisualise la facture dans une nouvelle fenêtre
 */
export function previewInvoice(invoice: Invoice): void {
  const html = generateInvoiceHtml(invoice)
  const previewWindow = window.open('', '_blank')
  if (previewWindow) {
    previewWindow.document.write(html)
    previewWindow.document.close()
  }
}





