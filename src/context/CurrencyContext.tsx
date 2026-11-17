import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch } from '../lib/api';
import type { CurrencyCode, CurrencySettings } from '../types';

const STORAGE_KEY = 'meridian_currency_settings';

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  currency: 'IDR',
  exchangeRates: {
    IDR: 16000,
    USD: 1,
    SGD: 1.35,
    EUR: 0.92,
  },
  showDecimals: false,
};

export const CURRENCY_METADATA: Record<
  CurrencyCode,
  { code: CurrencyCode; symbol: string; locale: string; nameId: string; nameEn: string }
> = {
  IDR: {
    code: 'IDR',
    symbol: 'Rp',
    locale: 'id-ID',
    nameId: 'Rupiah Indonesia',
    nameEn: 'Indonesian Rupiah',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    locale: 'en-US',
    nameId: 'Dolar Amerika Serikat',
    nameEn: 'US Dollar',
  },
  SGD: {
    code: 'SGD',
    symbol: 'S$',
    locale: 'en-SG',
    nameId: 'Dolar Singapura',
    nameEn: 'Singapore Dollar',
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    locale: 'en-IE',
    nameId: 'Euro',
    nameEn: 'Euro',
  },
};

function sanitizeSettings(raw: Partial<CurrencySettings> | null | undefined): CurrencySettings {
  const validCodes: CurrencyCode[] = ['IDR', 'USD', 'SGD', 'EUR'];
  const currency: CurrencyCode =
    raw?.currency && validCodes.includes(raw.currency) ? raw.currency : 'IDR';

  return {
    currency,
    exchangeRates: {
      IDR:
        raw?.exchangeRates?.IDR && Number(raw.exchangeRates.IDR) > 0
          ? Number(raw.exchangeRates.IDR)
          : DEFAULT_CURRENCY_SETTINGS.exchangeRates.IDR,
      USD: 1,
      SGD:
        raw?.exchangeRates?.SGD && Number(raw.exchangeRates.SGD) > 0
          ? Number(raw.exchangeRates.SGD)
          : DEFAULT_CURRENCY_SETTINGS.exchangeRates.SGD,
      EUR:
        raw?.exchangeRates?.EUR && Number(raw.exchangeRates.EUR) > 0
          ? Number(raw.exchangeRates.EUR)
          : DEFAULT_CURRENCY_SETTINGS.exchangeRates.EUR,
    },
    showDecimals: Boolean(raw?.showDecimals),
  };
}

interface CurrencyContextValue {
  settings: CurrencySettings;
  currency: CurrencyCode;
  exchangeRates: Record<CurrencyCode, number>;
  showDecimals: boolean;
  saving: boolean;
  formatAmount: (baseUsdAmount: number, overrideCurrency?: CurrencyCode) => string;
  toDisplayAmount: (baseUsdAmount: number, overrideCurrency?: CurrencyCode) => number;
  toBaseAmount: (displayAmount: number, overrideCurrency?: CurrencyCode) => number;
  updateSettings: (next: Partial<CurrencySettings>) => Promise<CurrencySettings>;
  resetDefaults: () => Promise<CurrencySettings>;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, subscribeWs } = useAuth();
  const [settings, setSettings] = useState<CurrencySettings>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return sanitizeSettings(JSON.parse(cached));
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CURRENCY_SETTINGS;
  });
  const [saving, setSaving] = useState(false);

  const persistCache = useCallback((next: CurrencySettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<{ settings: CurrencySettings }>('/api/settings')
      .then((res) => {
        if (!active || !res.settings) return;
        const clean = sanitizeSettings(res.settings);
        setSettings(clean);
        persistCache(clean);
      })
      .catch(() => {
        // retain default IDR or cached value if offline
      });
    return () => {
      active = false;
    };
  }, [persistCache]);

  useEffect(() => {
    if (!user) return;
    return subscribeWs('settings:updated', (incoming: CurrencySettings) => {
      const clean = sanitizeSettings(incoming);
      setSettings(clean);
      persistCache(clean);
    });
  }, [user, subscribeWs, persistCache]);

  const toDisplayAmount = useCallback(
    (baseUsdAmount: number, overrideCurrency?: CurrencyCode) => {
      const code = overrideCurrency ?? settings.currency;
      const rate = settings.exchangeRates[code] ?? 1;
      const raw = baseUsdAmount * rate;
      return settings.showDecimals ? Math.round(raw * 100) / 100 : Math.round(raw);
    },
    [settings]
  );

  const toBaseAmount = useCallback(
    (displayAmount: number, overrideCurrency?: CurrencyCode) => {
      const code = overrideCurrency ?? settings.currency;
      const rate = settings.exchangeRates[code] || 1;
      return Math.round(displayAmount / rate);
    },
    [settings]
  );

  const formatAmount = useCallback(
    (baseUsdAmount: number, overrideCurrency?: CurrencyCode) => {
      const code = overrideCurrency ?? settings.currency;
      const meta = CURRENCY_METADATA[code];
      const converted = baseUsdAmount * (settings.exchangeRates[code] ?? 1);
      const fractionDigits = settings.showDecimals && code !== 'IDR' ? 2 : settings.showDecimals ? 2 : 0;

      return new Intl.NumberFormat(meta.locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(converted);
    },
    [settings]
  );

  const updateSettings = useCallback(
    async (next: Partial<CurrencySettings>) => {
      const merged = sanitizeSettings({
        currency: next.currency ?? settings.currency,
        exchangeRates: next.exchangeRates
          ? { ...settings.exchangeRates, ...next.exchangeRates }
          : settings.exchangeRates,
        showDecimals: next.showDecimals ?? settings.showDecimals,
      });

      setSaving(true);
      try {
        const res = await apiFetch<{ settings: CurrencySettings }>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify(merged),
        });
        const clean = sanitizeSettings(res.settings);
        setSettings(clean);
        persistCache(clean);
        return clean;
      } finally {
        setSaving(false);
      }
    },
    [settings, persistCache]
  );

  const resetDefaults = useCallback(async () => {
    return updateSettings(DEFAULT_CURRENCY_SETTINGS);
  }, [updateSettings]);

  return (
    <CurrencyContext.Provider
      value={{
        settings,
        currency: settings.currency,
        exchangeRates: settings.exchangeRates,
        showDecimals: settings.showDecimals,
        saving,
        formatAmount,
        toDisplayAmount,
        toBaseAmount,
        updateSettings,
        resetDefaults,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider');
  return ctx;
}
