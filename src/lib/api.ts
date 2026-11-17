import type { UserRole } from '../types';

const TOKEN_KEY = 'meridian_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function formatCurrency(amount: number, currency: 'IDR' | 'USD' | 'SGD' | 'EUR' = 'IDR'): string {
  const localeMap = {
    IDR: 'id-ID',
    USD: 'en-US',
    SGD: 'en-SG',
    EUR: 'en-IE',
  };
  return new Intl.NumberFormat(localeMap[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ROLE_LABELS: Record<UserRole, string> = {
  landlord: 'Landlord',
  finance: 'Finance',
  security: 'Security',
  maintenance: 'Maintenance',
  tenant: 'Tenant',
};

export function getDefaultSectionForRole(role: UserRole) {
  switch (role) {
    case 'finance':
      return 'finance';
    case 'security':
      return 'security';
    case 'maintenance':
      return 'maintenance';
    case 'tenant':
      return 'tenant';
    case 'landlord':
    default:
      return 'dashboard';
  }
}
