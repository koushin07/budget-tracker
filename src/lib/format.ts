import type { Currency } from '../types'

export function money(n: number, currency: Currency): string {
  const sym = currency === 'PHP' ? '₱' : '$'
  const sign = n < 0 ? '−' : ''
  return `${sign}${sym}${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function peso(n: number): string {
  return money(n, 'PHP')
}

export function pesoRound(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}₱${Math.abs(Math.round(n)).toLocaleString('en-PH')}`
}
