import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { AppSection, DashboardSummary, RentPayment } from '../types';

interface DashboardPageProps {
  onNavigate: (section: AppSection, focus?: { floor?: number; unitNumber?: string; pinId?: string }) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user, notify, subscribeWs } = useAuth();
  const { formatAmount } = useCurrency();
  const { t, statusLabel, categoryLabel, formatLocalizedDate } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await apiFetch<DashboardSummary>('/api/dashboard');
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const unsubMaint = subscribeWs('maintenance:updated', () => loadDashboard());
    const unsubPay = subscribeWs('payment:updated', () => loadDashboard());
    const unsubUnit = subscribeWs('unit:updated', () => loadDashboard());
    const unsubBld = subscribeWs('building:updated', () => loadDashboard());
    return () => {
      unsubMaint();
      unsubPay();
      unsubUnit();
      unsubBld();
    };
  }, [loadDashboard, subscribeWs]);

  const handleMarkPaid = async (payment: RentPayment) => {
    try {
      await apiFetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Paid', method: 'ACH Transfer' }),
      });
      notify(`Unit ${payment.unitNumber} · ${statusLabel('Paid')}`, 'success');
      loadDashboard();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update payment.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
          ))}
        </div>
        <div className="h-64 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-6 text-sm text-red-700">
        {error || t.common.noData}
      </div>
    );
  }

  const { metrics, upcomingPayments, openTickets, units } = summary;
  const canEditPayments = user?.role === 'landlord' || user?.role === 'finance';

  return (
    <div className="space-y-8 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t.dashboard.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('maintenance')}
            className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            {t.dashboard.inspectMap}
          </button>
          {user?.role === 'landlord' && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('properties')}
                className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {t.nav.properties}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('users')}
                className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {t.dashboard.manageUsers}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4-Column Flat White KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.dashboard.activeUnits}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.activeUnits} <span className="text-base font-normal text-slate-400">/ {metrics.totalUnits}</span>
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {Math.round((metrics.activeUnits / Math.max(1, metrics.totalUnits)) * 100)}% {t.dashboard.occupancyOf}
          </p>
        </div>

        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.dashboard.collectedCycle}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {formatAmount(metrics.monthlyCollected)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {t.dashboard.settledInvoices}
          </p>
        </div>

        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.dashboard.upcomingOverdue}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatAmount(metrics.upcomingDue + metrics.overdueAmount)}
          </p>
          <p className="mt-1.5 text-xs text-red-700 tabular-nums">
            {metrics.overdueAmount > 0
              ? `${formatAmount(metrics.overdueAmount)} ${t.dashboard.currentlyOverdue}`
              : t.dashboard.zeroOverdue}
          </p>
        </div>

        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.dashboard.openMaintenance}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.openMaintenance}
          </p>
          <p className="mt-1.5 text-xs text-amber-700 tabular-nums">
            {metrics.urgentMaintenance} {t.dashboard.highUrgentPriority}
          </p>
        </div>
      </section>

      {/* Main Split: Upcoming Payments + Outstanding Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.dashboard.paymentsTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.dashboard.paymentsSubtitle}</p>
            </div>
            {(user?.role === 'landlord' || user?.role === 'finance') && (
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>{t.dashboard.openLedger}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {upcomingPayments.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{t.dashboard.allSettled}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">{t.dashboard.colUnit}</th>
                    <th className="py-2.5 px-4">{t.dashboard.colTenant}</th>
                    <th className="py-2.5 px-4">{t.dashboard.colDueDate}</th>
                    <th className="py-2.5 px-4 text-right">{t.dashboard.colAmount}</th>
                    <th className="py-2.5 px-4">{t.dashboard.colStatus}</th>
                    {canEditPayments && <th className="py-2.5 px-4 text-right">{t.dashboard.colAction}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {upcomingPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900 tabular-nums">
                        {p.unitNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-800">{p.tenantName}</td>
                      <td className="py-3 px-4 text-xs text-slate-500 font-mono tabular-nums">
                        {formatLocalizedDate(p.dueDate)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                        {formatAmount(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        <span
                          className={
                            p.status === 'Overdue'
                              ? 'text-red-700'
                              : p.status === 'Paid'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                          }
                        >
                          {statusLabel(p.status)}
                        </span>
                      </td>
                      {canEditPayments && (
                        <td className="py-3 px-4 text-right">
                          {p.status !== 'Paid' && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(p)}
                              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t.dashboard.markPaid}</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.dashboard.maintTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.dashboard.maintSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('maintenance')}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>{t.dashboard.allTickets}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {openTickets.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{t.dashboard.noTickets}</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {openTickets.map((item) => (
                <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.zoneLabel} · {categoryLabel(item.category)} ·{' '}
                      <span
                        className={
                          item.priority === 'Urgent' || item.priority === 'High'
                            ? 'text-red-700 font-medium'
                            : 'text-slate-700'
                        }
                      >
                        {statusLabel(item.priority)}
                      </span>{' '}
                      · {statusLabel(item.status)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('maintenance', {
                        floor: item.floor,
                        unitNumber: item.unitNumber,
                        pinId: item.id,
                      })
                    }
                    className="h-8 px-2.5 border border-slate-200 bg-white hover:bg-slate-100 rounded text-xs font-medium text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <MapPin className="w-3 h-3 text-indigo-700" />
                    <span>{t.dashboard.mapBtn}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Building Unit Matrix */}
      <section className="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t.dashboard.occupancyTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.dashboard.occupancySubtitle}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 divide-y divide-x divide-slate-200">
          {units.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() =>
                onNavigate('maintenance', { floor: u.floor, unitNumber: u.unitNumber })
              }
              className="p-4 text-left bg-white hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {t.common.unit} {u.unitNumber}
                </span>
                <span
                  className={`text-xs font-medium ${
                    u.occupancyStatus === 'Occupied'
                      ? 'text-emerald-700'
                      : u.occupancyStatus === 'Maintenance'
                        ? 'text-amber-700'
                        : 'text-slate-500'
                  }`}
                >
                  {statusLabel(u.occupancyStatus)}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600 truncate">
                {u.tenantName || t.dashboard.availableLease}
              </div>
              <div className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
                {u.unitType} · {formatAmount(u.monthlyRent)}{t.common.perMonth}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
