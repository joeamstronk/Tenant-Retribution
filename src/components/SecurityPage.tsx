import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Plus, ShieldAlert, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { AppSection, BuildingUnit, SecurityLog, User } from '../types';

interface SecurityPageProps {
  onNavigate: (section: AppSection) => void;
}

export function SecurityPage({ onNavigate }: SecurityPageProps) {
  const { notify, subscribeWs } = useAuth();
  const { t, statusLabel, categoryLabel, formatLocalizedDateTime } = useLanguage();
  const [tenants, setTenants] = useState<User[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [units, setUnits] = useState<BuildingUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);

  const [logForm, setLogForm] = useState({
    logType: 'Visitor' as SecurityLog['logType'],
    unitId: '',
    subjectName: '',
    badgeOrId: '',
    notes: '',
  });

  const loadSecurity = useCallback(async () => {
    try {
      const [uRes, lRes, unRes] = await Promise.all([
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ logs: SecurityLog[] }>('/api/security/logs'),
        apiFetch<{ units: BuildingUnit[] }>('/api/units'),
      ]);
      setTenants(uRes.users.filter((u) => u.role === 'tenant'));
      setLogs(lRes.logs);
      setUnits(unRes.units);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load security roster.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadSecurity();
    return subscribeWs('security:updated', () => loadSecurity());
  }, [loadSecurity, subscribeWs]);

  const handleToggleVerify = async (tenant: User) => {
    try {
      await apiFetch(`/api/users/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ securityVerified: !tenant.securityVerified }),
      });
      notify(
        tenant.securityVerified
          ? `Revoked clearance for ${tenant.name}`
          : `Verified security clearance for ${tenant.name}`,
        'success'
      );
      loadSecurity();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update security status.', 'error');
    }
  };

  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/security/logs', {
        method: 'POST',
        body: JSON.stringify(logForm),
      });
      notify(`Logged ${logForm.logType}: ${logForm.subjectName}`, 'success');
      setShowLogModal(false);
      setLogForm({ logType: 'Visitor', unitId: '', subjectName: '', badgeOrId: '', notes: '' });
      loadSecurity();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to create security entry.', 'error');
    }
  };

  const handleUpdateLogStatus = async (log: SecurityLog, status: SecurityLog['status']) => {
    try {
      await apiFetch(`/api/security/logs/${log.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(`Updated ${log.subjectName} to ${status}`, 'info');
      loadSecurity();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update log status.', 'error');
    }
  };

  const verifiedCount = tenants.filter((t) => t.securityVerified).length;
  const activeVisitors = logs.filter((l) => l.status === 'Checked In').length;
  const flaggedIncidents = logs.filter((l) => l.status === 'Flagged').length;

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.security.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t.security.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t.security.secureChannels}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowLogModal(true)}
            className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.security.logBtn}</span>
          </button>
        </div>
      </div>

      {/* Security Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.security.verifiedBadges}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {verifiedCount} <span className="text-base font-normal text-slate-400">/ {tenants.length}</span>
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.security.visitorsIn}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {activeVisitors}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.security.flaggedIncidents}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            {flaggedIncidents}
          </p>
        </div>
      </section>

      {loading ? (
        <div className="h-64 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Tenant Security Verification Roster */}
          <section className="lg:col-span-6 border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.security.rosterTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.security.rosterSubtitle}
              </p>
            </div>
            <div className="divide-y divide-slate-200 max-h-[480px] overflow-y-auto">
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {t.common.unit} {tenant.unitNumber || '—'} · {tenant.name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {t.security.badgePrefix} {tenant.badgeCode} · {tenant.phone}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleVerify(tenant)}
                    className={`h-8 px-3 rounded border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      tenant.securityVerified
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {tenant.securityVerified ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{t.common.verified}</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>{t.security.pendingCheck}</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Visitor, Delivery & Incident Log */}
          <section className="lg:col-span-6 border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t.security.logTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.security.logSubtitle}
              </p>
            </div>
            <div className="divide-y divide-slate-200 max-h-[480px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="px-5 py-3.5 space-y-1.5 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {categoryLabel(log.logType)} · {log.subjectName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {log.unitNumber ? `${t.common.unit} ${log.unitNumber}` : t.security.commonArea} · {log.badgeOrId} ·{' '}
                        {formatLocalizedDateTime(log.timestamp)}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium shrink-0 ${
                        log.status === 'Flagged'
                          ? 'text-red-700'
                          : log.status === 'Checked In'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {statusLabel(log.status)}
                    </span>
                  </div>
                  {log.notes && <p className="text-xs text-slate-600">{log.notes}</p>}
                  <div className="flex items-center gap-3 pt-1">
                    {log.status === 'Checked In' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateLogStatus(log, 'Checked Out')}
                        className="text-xs font-medium text-indigo-700 hover:underline cursor-pointer"
                      >
                        {t.security.checkOutVisitor}
                      </button>
                    )}
                    {log.status === 'Flagged' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateLogStatus(log, 'Resolved')}
                        className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                      >
                        {t.security.resolveIncident}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* New Security Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateLog}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t.security.modalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.security.entryType}</label>
                  <select
                    value={logForm.logType}
                    onChange={(e) =>
                      setLogForm((p) => ({ ...p, logType: e.target.value as SecurityLog['logType'] }))
                    }
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="Visitor">{categoryLabel('Visitor')}</option>
                    <option value="Delivery">{categoryLabel('Delivery')}</option>
                    <option value="Incident">{categoryLabel('Incident')}</option>
                    <option value="Patrol">{categoryLabel('Patrol')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.security.unitZone}</label>
                  <select
                    value={logForm.unitId}
                    onChange={(e) => setLogForm((p) => ({ ...p, unitId: e.target.value }))}
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">{t.security.commonLobby}</option>
                    {units
                      .filter((u) => u.floor > 0)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {t.common.unit} {u.unitNumber}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.security.subjectLabel}
                </label>
                <input
                  required
                  value={logForm.subjectName}
                  onChange={(e) => setLogForm((p) => ({ ...p, subjectName: e.target.value }))}
                  placeholder={t.security.subjectPlaceholder}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.security.passCode}
                </label>
                <input
                  value={logForm.badgeOrId}
                  onChange={(e) => setLogForm((p) => ({ ...p, badgeOrId: e.target.value }))}
                  placeholder="VIS-092"
                  className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.notes}</label>
                <textarea
                  rows={2}
                  value={logForm.notes}
                  onChange={(e) => setLogForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder={t.security.notesPlaceholder}
                  className="w-full p-2.5 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="h-9 px-4 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{t.security.saveEntry}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
