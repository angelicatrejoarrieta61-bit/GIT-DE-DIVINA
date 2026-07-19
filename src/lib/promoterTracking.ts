const STORAGE_KEY = 'divina_promoter_ref';
const ATTRIBUTION_DAYS = 30;

type StoredReferral = { code: string; expiresAt: number };

export function normalizePromoterCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

export function savePromoterCode(value: string) {
  const code = normalizePromoterCode(value);
  if (!code) return;
  const referral: StoredReferral = {
    code,
    expiresAt: Date.now() + ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(referral));
}

export function capturePromoterReferral(search: string) {
  const code = new URLSearchParams(search).get('ref');
  if (code) savePromoterCode(code);
}

export function getPromoterCode() {
  try {
    const referral = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredReferral | null;
    if (!referral?.code || referral.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return '';
    }
    return normalizePromoterCode(referral.code);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return '';
  }
}

