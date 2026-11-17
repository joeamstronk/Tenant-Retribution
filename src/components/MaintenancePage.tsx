import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Wrench, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { AppSection, BuildingUnit, MaintenanceRequest } from '../types';
import { FloorplanMap, type PinDraft } from './FloorplanMap';

interface MaintenancePageProps {
  initialFocus?: { floor?: number; unitNumber?: string; pinId?: string } | null;
  onNavigate: (section: AppSection) => void;
}

export function MaintenancePage({ initialFocus, onNavigate }: MaintenancePageProps) {
  const { notify, subscribeWs } = useAuth();
  const { t, statusLabel, categoryLabel, formatLocalizedDateTime } = useLanguage();
  const [floor, setFloor] = useState<number>(initialFocus?.floor ?? 3);
  const [units, setUnits] = useState<BuildingUnit[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(initialFocus?.pinId ?? null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');
  const [pinMode, setPinMode] = useState(false);
  const [draftPin, setDraftPin] = useState<PinDraft | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTicket, setNewTicket] = useState({
    category: 'Plumbing' as MaintenanceRequest['category'],
    priority: 'Medium' as MaintenanceRequest['priority'],
    title: '',
    description: '',
  });

  const [resolutionDraft, setResolutionDraft] = useState('');

  const loadMaintenance = useCallback(async () => {
    try {
      const [uRes, mRes] = await Promise.all([
        apiFetch<{ units: BuildingUnit[] }>('/api/units'),
        apiFetch<{ requests: MaintenanceRequest[] }>('/api/maintenance'),
      ]);
      setUnits(uRes.units);
      setRequests(mRes.requests);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load maintenance tickets.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadMaintenance();
    return subscribeWs('maintenance:updated', () => loadMaintenance());
  }, [loadMaintenance, subscribeWs]);

  useEffect(() => {
    if (initialFocus?.floor !== undefined) setFloor(initialFocus.floor);
    if (initialFocus?.pinId) setSelectedPinId(initialFocus.pinId);
  }, [initialFocus]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedPinId) ?? null,
    [requests, selectedPinId]
  );

  useEffect(() => {
    if (selectedRequest) {
      setResolutionDraft(selectedRequest.resolutionNotes || '');
    }
  }, [selectedRequest]);

  const visibleRequests = useMemo(() => {
    return requests.filter((r) => statusFilter === 'All' || r.status === statusFilter);
  }, [requests, statusFilter]);

  const handleUpdateTicket = async (
    ticket: MaintenanceRequest,
    updates: Partial<Pick<MaintenanceRequest, 'status' | 'priority' | 'resolutionNotes'>>
  ) => {
    try {
      await apiFetch(`/api/maintenance/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      notify(`Updated ticket "${ticket.title}"`, 'success');
      loadMaintenance();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update work order.', 'error');
    }
  };

  const handleCreatePinTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPin) return;
    try {
      const created = await apiFetch<{ id: string }>('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          unitId: draftPin.unitId,
          floor: draftPin.floor,
          zoneLabel: draftPin.zoneLabel,
          pinX: draftPin.pinX,
          pinY: draftPin.pinY,
          ...newTicket,
        }),
      });
      notify(`Pinned work order on ${draftPin.zoneLabel}`, 'success');
      setDraftPin(null);
      setPinMode(false);
      setNewTicket({ category: 'Plumbing', priority: 'Medium', title: '', description: '' });
      setSelectedPinId(created.id);
      loadMaintenance();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to submit maintenance pin.', 'error');
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.maintenance.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t.maintenance.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('chat')}
          className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{t.maintenance.dispatchChat}</span>
        </button>
      </div>

      {loading ? (
        <div className="h-96 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Floorplan Blueprint */}
          <div className="lg:col-span-7 space-y-4">
            <FloorplanMap
              floor={floor}
              onChangeFloor={setFloor}
              units={units}
              requests={requests}
              selectedPinId={selectedPinId}
              onSelectPin={(req) => {
                setSelectedPinId(req.id);
                setFloor(req.floor);
              }}
              pinMode={pinMode}
              onTogglePinMode={() => {
                setPinMode((prev) => !prev);
                setDraftPin(null);
              }}
              draftPin={draftPin}
              onPlaceDraftPin={(draft) => setDraftPin(draft)}
              highlightUnitNumber={initialFocus?.unitNumber}
            />

            {/* Selected Pin Inspector */}
            {selectedRequest && (
              <div className="border border-slate-200 rounded-lg p-5 bg-white space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      {selectedRequest.title}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedRequest.zoneLabel} · {t.maintenance.reportedBy} {selectedRequest.reportedByName} ·{' '}
                      {formatLocalizedDateTime(selectedRequest.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={t.common.status}
                      value={selectedRequest.status}
                      onChange={(e) =>
                        handleUpdateTicket(selectedRequest, {
                          status: e.target.value as MaintenanceRequest['status'],
                        })
                      }
                      className="h-8 px-2.5 text-xs font-medium border border-slate-300 rounded bg-white text-slate-900"
                    >
                      <option value="Open">{statusLabel('Open')}</option>
                      <option value="In Progress">{statusLabel('In Progress')}</option>
                      <option value="Resolved">{statusLabel('Resolved')}</option>
                    </select>
                  </div>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedRequest.description}
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">
                    {t.maintenance.resolutionLabel}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={resolutionDraft}
                      onChange={(e) => setResolutionDraft(e.target.value)}
                      placeholder={t.maintenance.resolutionPlaceholder}
                      className="flex-1 h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateTicket(selectedRequest, { resolutionNotes: resolutionDraft })
                      }
                      className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md cursor-pointer whitespace-nowrap"
                    >
                      {t.maintenance.saveNote}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Work Order Queue */}
          <div className="lg:col-span-5 border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  {t.maintenance.queueTitle} ({visibleRequests.length})
                </h2>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded">
                {(['All', 'Open', 'In Progress', 'Resolved'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-1 text-[11px] font-medium rounded cursor-pointer ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'All' ? t.common.all : statusLabel(st)}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
              {visibleRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  {t.maintenance.emptyQueue}
                </div>
              ) : (
                visibleRequests.map((req) => {
                  const active = req.id === selectedPinId;
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => {
                        setSelectedPinId(req.id);
                        setFloor(req.floor);
                      }}
                      className={`w-full p-4 text-left transition-colors cursor-pointer ${
                        active ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">{req.title}</span>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            req.status === 'Resolved'
                              ? 'text-emerald-700'
                              : req.status === 'In Progress'
                                ? 'text-amber-700'
                                : 'text-indigo-700'
                          }`}
                        >
                          {statusLabel(req.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {req.zoneLabel} · {categoryLabel(req.category)} ·{' '}
                        <span
                          className={
                            req.priority === 'Urgent' || req.priority === 'High'
                              ? 'text-red-700 font-medium'
                              : ''
                          }
                        >
                          {statusLabel(req.priority)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Draft Pin Submission Modal */}
      {draftPin && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePinTicket}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t.maintenance.createModalTitle}
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5 font-medium">
                  {draftPin.zoneLabel} ({t.maintenance.coordsLabel} {draftPin.pinX}%, {draftPin.pinY}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraftPin(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.maintenance.categoryLabel}
                  </label>
                  <select
                    value={newTicket.category}
                    onChange={(e) =>
                      setNewTicket((p) => ({ ...p, category: e.target.value as any }))
                    }
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="Plumbing">{categoryLabel('Plumbing')}</option>
                    <option value="Electrical">{categoryLabel('Electrical')}</option>
                    <option value="HVAC">{categoryLabel('HVAC')}</option>
                    <option value="Access/Lock">{categoryLabel('Access/Lock')}</option>
                    <option value="Structural">{categoryLabel('Structural')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.maintenance.priorityLabel}
                  </label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) =>
                      setNewTicket((p) => ({ ...p, priority: e.target.value as any }))
                    }
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="Low">{statusLabel('Low')}</option>
                    <option value="Medium">{statusLabel('Medium')}</option>
                    <option value="High">{statusLabel('High')}</option>
                    <option value="Urgent">{statusLabel('Urgent')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.maintenance.issueSummary}
                </label>
                <input
                  required
                  value={newTicket.title}
                  onChange={(e) => setNewTicket((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t.maintenance.issuePlaceholder}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.maintenance.descriptionLabel}
                </label>
                <textarea
                  required
                  rows={3}
                  value={newTicket.description}
                  onChange={(e) => setNewTicket((p) => ({ ...p, description: e.target.value }))}
                  placeholder={t.maintenance.descPlaceholder}
                  className="w-full p-2.5 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDraftPin(null)}
                className="h-9 px-4 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-medium cursor-pointer"
              >
                {t.maintenance.submitPin}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
