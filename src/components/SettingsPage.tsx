import React, { useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  CURRENCY_METADATA,
  DEFAULT_CURRENCY_SETTINGS,
  useCurrency,
} from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import type { CurrencyCode } from '../types';

const CURRENCY_ORDER: CurrencyCode[] = ['IDR', 'USD', 'SGD', 'EUR'];

export function SettingsPage() {
  const { notify } = useAuth();
  const { lang, t } = useLanguage();
  const { settings, saving, updateSettings, resetDefaults } = useCurrency();

  const [draftCurrency, setDraftCurrency] = useState<CurrencyCode>(settings.currency);
  const [draftRates, setDraftRates] = useState<Record<CurrencyCode, string>>({
    IDR: String(settings.exchangeRates.IDR),
    USD: '1',
    SGD: String(settings.exchangeRates.SGD),
    EUR: String(settings.exchangeRates.EUR),
  });
  const [draftDecimals, setDraftDecimals] = useState<boolean>(settings.showDecimals);

  useEffect(() => {
    setDraftCurrency(settings.currency);
    setDraftRates({
      IDR: String(settings.exchangeRates.IDR),
      USD: '1',
      SGD: String(settings.exchangeRates.SGD),
      EUR: String(settings.exchangeRates.EUR),
    });
    setDraftDecimals(settings.showDecimals);
  }, [settings]);

  const formatWithDraft = (baseUsd: number, code: CurrencyCode = draftCurrency) => {
    const meta = CURRENCY_METADATA[code];
    const parsedRate = Number(draftRates[code]);
    const effectiveRate =
      code === 'USD'
        ? 1
        : Number.isFinite(parsedRate) && parsedRate > 0
          ? parsedRate
          : DEFAULT_CURRENCY_SETTINGS.exchangeRates[code];
    const fractionDigits = draftDecimals ? 2 : 0;
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(baseUsd * effectiveRate);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const next = await updateSettings({
        currency: draftCurrency,
        exchangeRates: {
          IDR: Number(draftRates.IDR) > 0 ? Number(draftRates.IDR) : DEFAULT_CURRENCY_SETTINGS.exchangeRates.IDR,
          USD: 1,
          SGD: Number(draftRates.SGD) > 0 ? Number(draftRates.SGD) : DEFAULT_CURRENCY_SETTINGS.exchangeRates.SGD,
          EUR: Number(draftRates.EUR) > 0 ? Number(draftRates.EUR) : DEFAULT_CURRENCY_SETTINGS.exchangeRates.EUR,
        },
        showDecimals: draftDecimals,
      });
      notify(`${t.settings.savedToast} ${next.currency}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    }
  };

  const handleReset = async () => {
    try {
      await resetDefaults();
      notify(t.settings.resetToast, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to reset settings.', 'error');
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.settings.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t.settings.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t.settings.resetBtn}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Active Currency Selection */}
          <section className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.settings.currencySectionTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.settings.currencySectionSubtitle}</p>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CURRENCY_ORDER.map((code) => {
                const meta = CURRENCY_METADATA[code];
                const selected = draftCurrency === code;
                const displayName = lang === 'id' ? meta.nameId : meta.nameEn;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setDraftCurrency(code)}
                    className={`p-4 rounded-lg border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-indigo-700 bg-indigo-50/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {code}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="font-mono text-sm text-indigo-700 font-medium">
                          {meta.symbol}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-indigo-700 flex items-center gap-1">
                        {selected && <Check className="w-3.5 h-3.5" />}
                        {selected
                          ? t.settings.activeBadge
                          : code === 'IDR'
                            ? t.settings.defaultBadge
                            : ''}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{displayName}</div>
                    <div className="mt-2 font-mono text-xs text-slate-500 tabular-nums">
                      {formatWithDraft(2450, code)}
                      {t.common.perMonth}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Exchange Rates & Decimal Formatting */}
          <section className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.settings.ratesTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.settings.ratesSubtitle}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(['IDR', 'SGD', 'EUR'] as const).map((code) => (
                  <div key={code}>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t.settings.baseUnitLabel} ({code})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        value={draftRates[code]}
                        onChange={(e) =>
                          setDraftRates((prev) => ({ ...prev, [code]: e.target.value }))
                        }
                        className="w-full h-9 px-3 pr-12 text-sm font-mono tabular-nums border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                        {code}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex items-start gap-2.5 pt-2 border-t border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftDecimals}
                  onChange={(e) => setDraftDecimals(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-600"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-800">
                    {t.settings.decimalsLabel}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {t.settings.decimalsHint}
                  </span>
                </span>
              </label>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{saving ? t.settings.savingBtn : t.settings.saveBtn}</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Live Formatting Preview */}
        <aside className="lg:col-span-4 border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t.settings.previewTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.settings.previewSubtitle}</p>
          </div>

          <div className="p-5 space-y-4">
            <div className="border border-slate-200 rounded-md p-4 bg-slate-50 space-y-3">
              <div>
                <p className="text-xs text-slate-500">{t.settings.previewRentLabel}</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {formatWithDraft(2450)}
                  <span className="text-xs font-normal text-slate-500">{t.common.perMonth}</span>
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">{t.settings.previewPenthouseLabel}</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {formatWithDraft(4800)}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">{t.settings.previewDepositLabel}</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {formatWithDraft(2450)}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-500 leading-relaxed">
              {CURRENCY_METADATA[draftCurrency].code} ·{' '}
              {lang === 'id'
                ? CURRENCY_METADATA[draftCurrency].nameId
                : CURRENCY_METADATA[draftCurrency].nameEn}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
