import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { ActivityAction, ActivityEntityType, ActivityLog, UserRole } from '../types';

const ACTION_OPTIONS: ActivityAction[] = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];

const ENTITY_OPTIONS: ActivityEntityType[] = [
  'building',
  'space',
  'user',
  'lease',
  'payment',
  'document',
  'maintenance',
  'security_log',
  'chat_message',
  'settings',
  'auth',
];

const ROLE_OPTIONS: UserRole[] = ['landlord', 'finance', 'security', 'maintenance', 'tenant'];

function actionTagClasses(action: ActivityAction): string {
  switch (action) {
    case 'CREATE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'UPDATE':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'DELETE':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'LOGIN':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    case 'LOGOUT':
    default:
      return 'border-slate-200 bg-white text-slate-500';
  }
}

function formatSnapshotValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export function ActivityLogPage() {
  const { user, notify, subscribeWs } = useAuth();
  const { t, roleLabel, formatLocalizedDateTime } = useLanguage();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [inspectedLog, setInspectedLog] = useState<ActivityLog | null>(null);

  const loadLogs = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await apiFetch<{ logs: ActivityLog[] }>('/api/activity-logs');
        setLogs(res.logs);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Unable to load activity logs.', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    loadLogs(true);
    const unsub = subscribeWs('activity:logged', (payload) => {
      const incoming = payload as ActivityLog | undefined;
      if (!incoming || !incoming.id) return;
      setLogs((prev) => {
        if (prev.some((item) => item.id === incoming.id)) return prev;
        return [incoming, ...prev].slice(0, 500);
      });
    });
    return () => unsub();
  }, [loadLogs, subscribeWs]);

  const metrics = useMemo(() => {
    let created = 0;
    let updated = 0;
    let deleted = 0;
    for (const item of logs) {
      if (item.action === 'CREATE') created += 1;
      else if (item.action === 'UPDATE') updated += 1;
      else if (item.action === 'DELETE') deleted += 1;
    }
    return {
      total: logs.length,
      created,
      updated,
      deleted,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((item) => {
      if (actionFilter !== 'ALL' && item.action !== actionFilter) return false;
      if (entityFilter !== 'ALL' && item.entityType !== entityFilter) return false;
      if (roleFilter !== 'ALL' && item.actorRole !== roleFilter) return false;
      if (q) {
        const hay = `${item.actorName} ${item.actorRole} ${item.action} ${item.entityType} ${item.entityId} ${item.entityLabel} ${item.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, roleFilter, searchQuery]);

  const diffRows = useMemo(() => {
    if (!inspectedLog) return [];
    const before = inspectedLog.beforeData ?? {};
    const after = inspectedLog.afterData ?? {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return keys.map((key) => {
      const beforeVal = formatSnapshotValue(before[key]);
      const afterVal = formatSnapshotValue(after[key]);
      return {
        key,
        beforeVal,
        afterVal,
        changed: beforeVal !== afterVal,
      };
    });
  }, [inspectedLog]);

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Module', 'Target Label', 'Target ID', 'Details'];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filteredLogs.map((l) => [
      l.timestamp,
      l.actorName,
      l.actorRole,
      l.action,
      l.entityType,
      l.entityLabel,
      l.entityId,
      l.details,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => escape(String(c ?? ''))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenant-retribution-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
        <div className="h-64 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.activity.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t.activity.subtitle}</p>
          {user?.role === 'tenant' && (
            <p className="text-xs text-indigo-700 mt-1.5 font-medium">
              {t.activity.tenantScopeNotice}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="h-9 px-3 border border-slate-200 bg-white rounded-md text-xs font-medium text-emerald-700 inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{t.activity.liveLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => loadLogs(false)}
            disabled={refreshing}
            className="h-9 px-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{t.activity.refreshBtn}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.activity.exportCsv}</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-white">
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">{t.activity.totalEvents}</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900 mt-1 tabular-nums">
            {metrics.total}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">{t.activity.createdCount}</div>
          <div className="text-2xl font-semibold tracking-tight text-emerald-700 mt-1 tabular-nums">
            {metrics.created}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">{t.activity.updatedCount}</div>
          <div className="text-2xl font-semibold tracking-tight text-indigo-700 mt-1 tabular-nums">
            {metrics.updated}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">{t.activity.deletedCount}</div>
          <div className="text-2xl font-semibold tracking-tight text-rose-700 mt-1 tabular-nums">
            {metrics.deleted}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border border-slate-200 rounded-lg bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.activity.searchPlaceholder}
            className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-md text-xs text-slate-900 bg-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 px-3 border border-slate-200 rounded-md text-xs text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">{t.activity.filterActionAll}</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {t.activity.actions[a] ?? a}
            </option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-9 px-3 border border-slate-200 rounded-md text-xs text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">{t.activity.filterEntityAll}</option>
          {ENTITY_OPTIONS.map((ent) => (
            <option key={ent} value={ent}>
              {t.activity.entities[ent] ?? ent}
            </option>
          ))}
        </select>

        {user?.role !== 'tenant' && (
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 px-3 border border-slate-200 rounded-md text-xs text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">{t.activity.filterRoleAll}</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Audit Table */}
      <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 whitespace-nowrap">{t.activity.colTime}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t.activity.colActor}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t.activity.colAction}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t.activity.colEntity}</th>
                <th className="py-3 px-4">{t.activity.colDetails}</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">{t.activity.colDiff}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-slate-500">
                    {t.activity.emptyState}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const hasSnapshot = Boolean(log.beforeData || log.afterData);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                        {formatLocalizedDateTime(log.timestamp)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{log.actorName}</div>
                        <div className="text-[11px] text-slate-500">{roleLabel(log.actorRole)}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-medium border rounded ${actionTagClasses(
                            log.action
                          )}`}
                        >
                          {t.activity.actions[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[11px] font-medium text-slate-500">
                          {t.activity.entities[log.entityType] ?? log.entityType}
                        </div>
                        <div className="font-medium text-slate-900">{log.entityLabel}</div>
                        <div className="font-mono text-[10px] text-slate-400">{log.entityId}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-md">{log.details}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hasSnapshot ? (
                          <button
                            type="button"
                            onClick={() => setInspectedLog(log)}
                            className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 rounded text-[11px] font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t.activity.inspectBtn}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">{t.activity.noDiff}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Before/After Data Diff Modal */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {t.activity.modalTitle}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {inspectedLog.id} · {inspectedLog.entityId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                aria-label={t.common.close}
                className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-200 rounded-lg p-4 bg-slate-50/40 text-xs">
                <div>
                  <div className="text-slate-500">{t.activity.actorLabel}</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {inspectedLog.actorName} ({roleLabel(inspectedLog.actorRole)})
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{t.activity.timestampLabel}</div>
                  <div className="font-mono text-slate-900 mt-0.5 tabular-nums">
                    {formatLocalizedDateTime(inspectedLog.timestamp)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{t.activity.targetLabel}</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {t.activity.entities[inspectedLog.entityType] ?? inspectedLog.entityType} ·{' '}
                    {inspectedLog.entityLabel}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{t.activity.summaryLabel}</div>
                  <div className="text-slate-800 mt-0.5">{inspectedLog.details}</div>
                </div>
              </div>

              {/* Field-by-field comparison */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  {t.activity.diffComparisonTitle}
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 px-3">{t.activity.fieldCol}</th>
                        <th className="py-2.5 px-3">{t.activity.beforeCol}</th>
                        <th className="py-2.5 px-3">{t.activity.afterCol}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {diffRows.map((row) => (
                        <tr
                          key={row.key}
                          className={row.changed ? 'bg-indigo-50/35' : 'bg-white'}
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] font-medium text-slate-700">
                            {row.key}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 break-all">
                            {inspectedLog.beforeData ? row.beforeVal : '—'}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-mono text-[11px] break-all ${
                              row.changed ? 'font-semibold text-indigo-700' : 'text-slate-800'
                            }`}
                          >
                            {inspectedLog.afterData ? row.afterVal : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Raw Before / After Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    {t.activity.beforeTitle}
                  </div>
                  {inspectedLog.beforeData ? (
                    <pre className="text-[11px] font-mono text-slate-600 whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded p-2.5">
                      {JSON.stringify(inspectedLog.beforeData, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-slate-400 italic py-2">
                      {t.activity.noBeforeData}
                    </div>
                  )}
                </div>
                <div className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    {t.activity.afterTitle}
                  </div>
                  {inspectedLog.afterData ? (
                    <pre className="text-[11px] font-mono text-slate-800 whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded p-2.5">
                      {JSON.stringify(inspectedLog.afterData, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-rose-600 italic py-2">
                      {t.activity.noAfterData}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-white flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="h-9 px-4 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
