import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Plus, Receipt, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { Lease, RentPayment } from '../types';

export function FinancePage() {
  const { notify, subscribeWs } = useAuth();
  const { currency, formatAmount, toDisplayAmount, toBaseAmount } = useCurrency();
  const { t, statusLabel, formatLocalizedDate } = useLanguage();
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [filter, setFilter] = useState<'All' | 'Paid' | 'Upcoming' | 'Overdue'>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<RentPayment | null>(null);

  const [invoiceForm, setInvoiceForm] = useState({
    leaseId: '',
    amount: '',
    dueDate: '2026-12-01',
    status: 'Upcoming' as 'Paid' | 'Upcoming' | 'Overdue',
    method: 'ACH Transfer',
    notes: '',
  });

  const loadFinance = useCallback(async () => {
    try {
      const [pRes, lRes] = await Promise.all([
        apiFetch<{ payments: RentPayment[] }>('/api/payments'),
        apiFetch<{ leases: Lease[] }>('/api/leases'),
      ]);
      setPayments(pRes.payments);
      setLeases(lRes.leases);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load payment ledger.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadFinance();
    return subscribeWs('payment:updated', () => loadFinance());
  }, [loadFinance, subscribeWs]);

  const totals = useMemo(() => {
    const collected = payments.filter((p) => p.status === 'Paid').reduce((a, b) => a + b.amount, 0);
    const upcoming = payments.filter((p) => p.status === 'Upcoming').reduce((a, b) => a + b.amount, 0);
    const overdue = payments.filter((p) => p.status === 'Overdue').reduce((a, b) => a + b.amount, 0);
    const total = collected + upcoming + overdue;
    const rate = total > 0 ? Math.round((collected / total) * 100) : 100;
    return { collected, upcoming, overdue, rate };
  }, [payments]);

  const visiblePayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesStatus = filter === 'All' || p.status === filter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.unitNumber.toLowerCase().includes(q) ||
        p.tenantName.toLowerCase().includes(q) ||
        p.referenceCode.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [payments, filter, search]);

  const handleRecordPayment = async (payment: RentPayment, method = 'ACH Transfer') => {
    try {
      await apiFetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Paid', method }),
      });
      notify(`Payment ${payment.referenceCode} marked Paid`, 'success');
      loadFinance();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to record payment.', 'error');
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...invoiceForm,
          amount: toBaseAmount(Number(invoiceForm.amount)),
        }),
      });
      notify('Rent invoice recorded in ledger', 'success');
      setShowNewInvoice(false);
      setInvoiceForm({
        leaseId: '',
        amount: '',
        dueDate: '2026-12-01',
        status: 'Upcoming',
        method: 'ACH Transfer',
        notes: '',
      });
      loadFinance();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to create invoice.', 'error');
    }
  };

  const handleExportCsv = () => {
    const header = `Reference,Unit,Tenant,Due Date,Amount (${currency}),Status,Method,Paid At\n`;
    const rows = visiblePayments
      .map(
        (p) =>
          `${p.referenceCode},${p.unitNumber},"${p.tenantName}",${p.dueDate},${toDisplayAmount(p.amount)},${p.status},"${p.method || ''}",${p.paidAt || ''}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian_rent_ledger_${currency}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.finance.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t.finance.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.finance.exportCsv}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewInvoice(true)}
            className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.finance.newInvoice}</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.finance.collected}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {formatAmount(totals.collected)}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.finance.upcoming}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {formatAmount(totals.upcoming)}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.finance.overdue}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            {formatAmount(totals.overdue)}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.finance.collectionRate}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totals.rate}%
          </p>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          {(['All', 'Paid', 'Upcoming', 'Overdue'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                filter === status
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status === 'All' ? t.common.all : statusLabel(status)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.finance.searchPlaceholder}
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
          />
        </div>
      </div>

      {/* Rent Ledger Table */}
      {loading ? (
        <div className="h-64 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">{t.finance.colInvoice}</th>
                  <th className="py-2.5 px-4">{t.common.unit}</th>
                  <th className="py-2.5 px-4">{t.dashboard.colTenant}</th>
                  <th className="py-2.5 px-4">{t.dashboard.colDueDate}</th>
                  <th className="py-2.5 px-4">{t.finance.colMethod}</th>
                  <th className="py-2.5 px-4 text-right">{t.dashboard.colAmount}</th>
                  <th className="py-2.5 px-4">{t.common.status}</th>
                  <th className="py-2.5 px-4 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {visiblePayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {p.referenceCode}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums">
                      {p.unitNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{p.tenantName}</div>
                      {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                      {formatLocalizedDate(p.dueDate)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {p.method ? (t.finance.methods[p.method] ?? p.method) : t.common.pending}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatAmount(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span
                        className={
                          p.status === 'Paid'
                            ? 'text-emerald-700'
                            : p.status === 'Overdue'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }
                      >
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap">
                      {p.status !== 'Paid' && (
                        <button
                          type="button"
                          onClick={() => handleRecordPayment(p)}
                          className="text-xs font-medium text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.finance.confirmPaid}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setReceiptPayment(p)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>{t.finance.receipt}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Invoice Modal */}
      {showNewInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateInvoice}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t.finance.modalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewInvoice(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.finance.leaseUnit}</label>
                <select
                  required
                  value={invoiceForm.leaseId}
                  onChange={(e) => {
                    const l = leases.find((x) => x.id === e.target.value);
                    setInvoiceForm((p) => ({
                      ...p,
                      leaseId: e.target.value,
                      amount: l ? String(toDisplayAmount(l.monthlyRent)) : p.amount,
                    }));
                  }}
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">{t.finance.selectLease}</option>
                  {leases.map((l) => (
                    <option key={l.id} value={l.id}>
                      {t.common.unit} {l.unitNumber} · {l.tenantName} ({formatAmount(l.monthlyRent)}
                      {t.common.perMonth})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.finance.amountUsd} ({currency})
                  </label>
                  <input
                    type="number"
                    required
                    value={invoiceForm.amount}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-md bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.finance.dueDate}</label>
                  <input
                    type="date"
                    required
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.status}</label>
                  <select
                    value={invoiceForm.status}
                    onChange={(e) =>
                      setInvoiceForm((p) => ({ ...p, status: e.target.value as any }))
                    }
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="Upcoming">{statusLabel('Upcoming')}</option>
                    <option value="Paid">{statusLabel('Paid')}</option>
                    <option value="Overdue">{statusLabel('Overdue')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.finance.methodLabel}</label>
                  <select
                    value={invoiceForm.method}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, method: e.target.value }))}
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="ACH Transfer">{t.finance.methods['ACH Transfer']}</option>
                    <option value="Wire Transfer">{t.finance.methods['Wire Transfer']}</option>
                    <option value="Auto-Debit">{t.finance.methods['Auto-Debit']}</option>
                    <option value="Check">{t.finance.methods['Check']}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.notes}</label>
                <input
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder={t.finance.optionalNote}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewInvoice(false)}
                className="h-9 px-4 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-medium cursor-pointer"
              >
                {t.finance.saveEntry}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {receiptPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t.finance.statementTitle}
                </h3>
                <p className="font-mono text-xs text-slate-500">{receiptPayment.referenceCode}</p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm border border-slate-200 rounded-md p-4 bg-slate-50">
              <div className="flex justify-between">
                <span className="text-slate-500">{t.common.unit}</span>
                <span className="font-mono font-semibold text-slate-900">
                  {receiptPayment.unitNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.finance.resident}</span>
                <span className="font-medium text-slate-900">{receiptPayment.tenantName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.finance.dueDate}</span>
                <span className="font-mono text-slate-900">{formatLocalizedDate(receiptPayment.dueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.common.status}</span>
                <span className="font-medium text-slate-900">{statusLabel(receiptPayment.status)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="font-medium text-slate-700">{t.finance.totalAmount}</span>
                <span className="font-mono text-base font-semibold text-slate-900">
                  {formatAmount(receiptPayment.amount)}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setReceiptPayment(null)}
                className="h-9 px-4 bg-indigo-700 text-white text-xs font-medium rounded-md cursor-pointer"
              >
                {t.finance.closeStatement}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
