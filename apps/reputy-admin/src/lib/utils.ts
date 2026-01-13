import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('fr-FR').format(num)
}

export function formatPercent(num: number): string {
  return `${num.toFixed(1)}%`
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getRatingColor(rating: number): string {
  if (rating >= 4.5) return 'text-success'
  if (rating >= 4) return 'text-primary'
  if (rating >= 3) return 'text-warning'
  return 'text-destructive'
}

export function getSentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-100 text-green-800'
    case 'neutral':
      return 'bg-gray-100 text-gray-800'
    case 'negative':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'open':
      return 'bg-green-100 text-green-800'
    case 'scheduled':
    case 'pending':
      return 'bg-blue-100 text-blue-800'
    case 'completed':
    case 'closed':
      return 'bg-gray-100 text-gray-800'
    case 'paused':
    case 'draft':
      return 'bg-yellow-100 text-yellow-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}





