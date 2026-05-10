import { useState, useCallback } from 'react';

// ─── Tipos ───────────────────────────────────────────────────
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'unknown';
export type PaymentStatus = 'idle' | 'tokenizing' | 'processing' | 'success' | 'error' | 'requires_3ds';

export interface CardData {
  card_number: string;
  card_holder_name: string;
  expiration_month: string;
  expiration_year: string;
  cvv: string;
}

export interface CustomerData {
  name: string;
  email: string;
  phone: string;
  address?: {
    zip_code: string;
    city: string;
    country: string;
  };
}

export interface InstallmentOption {
  months: number;
  type: 'msi' | 'mci';
  monthly_amount: number;
  total_amount: number;
}

export interface PaymentResult {
  success: boolean;
  transaction_id?: string;
  status?: string;
  message?: string;
  requires_action?: boolean;
  redirect_url?: string;
}

// ─── Utilidades ────────────────────

export function detectCardBrand(number: string): CardBrand {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  return 'unknown';
}

export function isInternationalCard(number: string): boolean {
  const bin = number.replace(/\s/g, '').substring(0, 6);
  const mxBinPrefixes = ['402927', '402928', '406616', '406617', '414581', '414582', '520476', '520477', '552073', '552074'];
  return !mxBinPrefixes.some(prefix => bin.startsWith(prefix.substring(0, bin.length)));
}

export function luhnCheck(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 13) return false;
  let sum = 0, isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

export function isCardExpired(month: string, year: string): boolean {
  const now = new Date();
  const expMonth = parseInt(month, 10);
  const expYear = parseInt(year.length === 2 ? `20${year}` : year, 10);
  const expDate = new Date(expYear, expMonth - 1, 1);
  return expDate < new Date(now.getFullYear(), now.getMonth(), 1);
}

export function formatCardNumber(value: string, brand: CardBrand): string {
  const digits = value.replace(/\D/g, '');
  if (brand === 'amex') return digits.replace(/(\d{4})(\d{0,6})(\d{0,5})/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function isValidEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email); }
export function isValidPhone(phone: string): boolean { return /^\+?\d{10,15}$/.test(phone.replace(/\D/g, '')); }

// ─── Hook ───────────────────────────────────────────

export function useClipPayment() {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  const fetchInstallments = useCallback(async (amount: number, cardBrand: CardBrand) => {
    if (cardBrand === 'unknown' || amount <= 0) { setInstallments([]); return; }
    setLoadingInstallments(true);
    try {
      const res = await fetch(`/api/clip-installments?amount=${amount}&payment_method_id=${cardBrand}`);
      const data = await res.json();
      setInstallments(data.installments || []);
    } catch { setInstallments([]); } finally { setLoadingInstallments(false); }
  }, []);

  const pagar = async (card: CardData, amount: number, customer: CustomerData, description: string, monthsOption: InstallmentOption | null = null): Promise<PaymentResult> => {
    setStatus('tokenizing');
    setError(null);
    try {
      const tRes = await fetch('/api/clip-card-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      });
      const tData = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error || 'Error al validar tarjeta');

      setStatus('processing');
      const pRes = await fetch('/api/clip-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_token_id: tData.card_token_id,
          amount,
          description,
          customer,
          installments: monthsOption ? { months: monthsOption.months, type: monthsOption.type } : null
        }),
      });
      const pData = await pRes.json();

      if (pData.requires_action) {
        setStatus('requires_3ds');
        return { success: false, requires_action: true, redirect_url: pData.redirect_url };
      }

      if (!pRes.ok) throw new Error(translateDeclineReason(pData.decline_reason));

      setStatus('success');
      return { success: true, transaction_id: pData.transaction_id, status: pData.status };
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
      return { success: false, message: err.message };
    }
  };

  const reset = () => { setStatus('idle'); setError(null); setInstallments([]); };

  return { pagar, fetchInstallments, status, error, installments, loadingInstallments, reset };
}

function translateDeclineReason(reason?: string): string {
  const map: Record<string, string> = {
    insufficient_funds: 'Fondos insuficientes.',
    card_declined: 'Tarjeta declinada.',
    invalid_card: 'Datos de tarjeta inválidos.',
    expired_card: 'Tarjeta vencida.',
    do_not_honor: 'Rechazado por tu banco.',
    incorrect_cvv: 'Código de seguridad incorrecto.',
  };
  return map[reason || ''] || 'Error al procesar el pago. Intenta con otra tarjeta.';
}
