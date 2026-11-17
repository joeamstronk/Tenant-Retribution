import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, MapPin, MessageSquare, Send, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type {
  BuildingUnit,
  ChatChannel,
  ChatMessage,
  Lease,
  MaintenanceRequest,
  RentPayment,
  TenantDocument,
} from '../types';
import { FloorplanMap, type PinDraft } from './FloorplanMap';

export function TenantPortalPage() {
  const { user, notify, subscribeWs } = useAuth();
  const { formatAmount } = useCurrency();
  const { t, roleLabel, statusLabel, categoryLabel, formatLocalizedDate, formatLocalizedDateTime } =
    useLanguage();
  const [units, setUnits] = useState<BuildingUnit[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('ch-maintenance');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');

  const defaultFloor = useMemo(() => {
    if (user?.unitNumber) {
      const f = Number(user.unitNumber[0]);
      if (!Number.isNaN(f) && f >= 1 && f <= 4) return f;
    }
    return 3;
  }, [user?.unitNumber]);

  const [floor, setFloor] = useState<number>(defaultFloor);
  const [pinMode, setPinMode] = useState<boolean>(true);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<PinDraft | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    category: 'Plumbing' as MaintenanceRequest['category'],
    priority: 'Medium' as MaintenanceRequest['priority'],
    title: '',
    description: '',
  });

  const [docForm, setDocForm] = useState({
    title: '',
    category: 'Inspection' as TenantDocument['category'],
    fileName: '',
    mimeType: 'text/plain',
    fileData: '',
  });

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadPortal = useCallback(async () => {
    try {
      const [uRes, lRes, pRes, dRes, mRes, chRes] = await Promise.all([
        apiFetch<{ units: BuildingUnit[] }>('/api/units'),
        apiFetch<{ leases: Lease[] }>('/api/leases'),
        apiFetch<{ payments: RentPayment[] }>('/api/payments'),
        apiFetch<{ documents: TenantDocument[] }>('/api/documents'),
        apiFetch<{ requests: MaintenanceRequest[] }>('/api/maintenance'),
        apiFetch<{ channels: ChatChannel[] }>('/api/chat/channels'),
      ]);
      setUnits(uRes.units);
      setLeases(lRes.leases);
      setPayments(pRes.payments);
      setDocuments(dRes.documents);
      setRequests(mRes.requests);
      setChannels(chRes.channels);
      if (chRes.channels.length > 0) {
        setActiveChannelId((prev) =>
          chRes.channels.some((c) => c.id === prev) ? prev : chRes.channels[0].id
        );
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load tenant portal.', 'error');
    }
  }, [notify]);

  const loadMessages = useCallback(async (channelId: string) => {
    if (!channelId) return;
    try {
      const res = await apiFetch<{ messages: ChatMessage[] }>(
        `/api/chat/channels/${channelId}/messages`
      );
      setMessages(res.messages);
    } catch {
      // ignore if channel forbidden
    }
  }, []);

  useEffect(() => {
    loadPortal();
    const unsubMaint = subscribeWs('maintenance:updated', () => loadPortal());
    const unsubPay = subscribeWs('payment:updated', () => loadPortal());
    return () => {
      unsubMaint();
      unsubPay();
    };
  }, [loadPortal, subscribeWs]);

  useEffect(() => {
    loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

  useEffect(() => {
    return subscribeWs('chat:message', (incoming: ChatMessage) => {
      if (incoming.channelId === activeChannelId) {
        setMessages((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
        );
      }
    });
  }, [activeChannelId, subscribeWs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const myLease = leases[0] ?? null;
  const myNextPayment = payments.find((p) => p.status !== 'Paid') ?? payments[0] ?? null;
  const myTickets = useMemo(() => {
    if (user?.role === 'landlord') return requests;
    return requests.filter((r) => r.unitId === user?.unitId || r.reportedByUserId === user?.id);
  }, [requests, user]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedPinId) ?? null,
    [requests, selectedPinId]
  );

  const handleSubmitPin = async (e: React.FormEvent) => {
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
          ...ticketForm,
        }),
      });
      notify(`Maintenance pin logged for ${draftPin.zoneLabel}`, 'success');
      setDraftPin(null);
      setTicketForm({ category: 'Plumbing', priority: 'Medium', title: '', description: '' });
      setSelectedPinId(created.id);
      loadPortal();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to submit pin.', 'error');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageDraft.trim() || !activeChannelId || !user) return;

    const clientId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bodyText = messageDraft.trim();
    const optimistic: ChatMessage = {
      id: clientId,
      channelId: activeChannelId,
      senderUserId: user.id,
      senderName: user.name,
      senderRole: user.role,
      body: bodyText,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setMessageDraft('');

    try {
      await apiFetch(`/api/chat/channels/${activeChannelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ id: clientId, body: bodyText }),
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      notify(err instanceof Error ? err.message : 'Message failed to send.', 'error');
    }
  };

  const handleDocFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocForm((prev) => ({
        ...prev,
        fileName: file.name,
        mimeType: file.type || 'text/plain',
        fileData: String(reader.result || ''),
        title: prev.title || file.name.replace(/\.[^.]+$/, ''),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUploadTenantDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.fileData) return;
    try {
      await apiFetch('/api/documents', {
        method: 'POST',
        body: JSON.stringify(docForm),
      });
      notify('Document uploaded to your unit vault', 'success');
      setShowUpload(false);
      setDocForm({ title: '', category: 'Inspection', fileName: '', mimeType: 'text/plain', fileData: '' });
      loadPortal();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to upload document.', 'error');
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.tenant.title} {user?.unitNumber ? `· ${t.common.unit} ${user.unitNumber}` : ''}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t.tenant.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{t.tenant.uploadUnitDoc}</span>
        </button>
      </div>

      {/* Personal Unit Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.tenant.activeLease}</p>
          <p className="mt-2 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {myLease
              ? `${t.common.unit} ${myLease.unitNumber} · ${formatAmount(myLease.monthlyRent)}${t.common.perMonth}`
              : t.tenant.unitOverview}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {myLease ? `${t.tenant.termEnds} ${formatLocalizedDate(myLease.endDate)}` : t.tenant.viewingBuilding}
          </p>
        </div>

        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.tenant.rentStatus}</p>
          <p className="mt-2 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {myNextPayment
              ? `${formatAmount(myNextPayment.amount)} · ${statusLabel(myNextPayment.status)}`
              : t.tenant.allSettled}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {myNextPayment ? `${t.tenant.dueOn} ${formatLocalizedDate(myNextPayment.dueDate)}` : t.tenant.noPendingBalance}
          </p>
        </div>

        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.tenant.activePins}</p>
          <p className="mt-2 font-mono text-lg font-semibold text-indigo-700 tabular-nums">
            {myTickets.filter((ticket) => ticket.status !== 'Resolved').length} {statusLabel('Open')} ·{' '}
            <span className="text-emerald-700">
              {myTickets.filter((ticket) => ticket.status === 'Resolved').length} {statusLabel('Resolved')}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{t.tenant.clickFloorplanHint}</p>
        </div>
      </section>

      {/* Main Split: Interactive Floorplan Mapper + Direct Chat Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Floorplan Mapping & Ticket Tracker */}
        <section className="lg:col-span-7 space-y-4">
          <FloorplanMap
            floor={floor}
            onChangeFloor={setFloor}
            units={units}
            requests={requests}
            selectedPinId={selectedPinId}
            onSelectPin={(req) => setSelectedPinId(req.id)}
            pinMode={pinMode}
            onTogglePinMode={() => {
              setPinMode((p) => !p);
              setDraftPin(null);
            }}
            draftPin={draftPin}
            onPlaceDraftPin={(d) => setDraftPin(d)}
            highlightUnitNumber={user?.unitNumber}
          />

          {selectedRequest && (
            <div className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{selectedRequest.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedRequest.zoneLabel} · {categoryLabel(selectedRequest.category)} ·{' '}
                    <span className="font-medium text-indigo-700">{statusLabel(selectedRequest.status)}</span>
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {formatLocalizedDateTime(selectedRequest.updatedAt)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600">{selectedRequest.description}</p>
              {selectedRequest.resolutionNotes && (
                <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5">
                  {t.tenant.techUpdate}: {selectedRequest.resolutionNotes}
                </p>
              )}
            </div>
          )}

          {/* Unit Documents Quick List */}
          <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-700" />
                {t.tenant.unitDocs} ({documents.length})
              </span>
            </div>
            {documents.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">{t.tenant.noDocsYet}</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {documents.map((d) => (
                  <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{d.title}</div>
                      <div className="text-slate-500">
                        {categoryLabel(d.category)} · {d.verifiedBySecurity ? t.common.verified : t.users.awaitingVerify}
                      </div>
                    </div>
                    <a
                      href={d.fileData}
                      download={d.fileName}
                      className="text-indigo-700 hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t.common.download}</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: Direct Chat Interface */}
        <section className="lg:col-span-5 border border-slate-200 rounded-lg bg-white flex flex-col h-[640px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-700" />
                <span>{t.tenant.directChatTitle}</span>
              </h2>
              <span className="text-[11px] text-emerald-700 font-medium">{t.tenant.liveConnected}</span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`px-2.5 py-1 text-xs rounded border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    activeChannelId === ch.id
                      ? 'bg-indigo-700 border-indigo-700 text-white font-medium'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {ch.name.replace(' & Management Desk', '').replace(' Support', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t.tenant.noMessages}
              </div>
            ) : (
              messages.map((m) => {
                const isSelf = m.senderUserId === user?.id;
                return (
                  <div key={m.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                    <div className="text-[11px] text-slate-500 mb-1">
                      {m.senderName} · {roleLabel(m.senderRole)} · {formatLocalizedDateTime(m.createdAt)}
                    </div>
                    <div
                      className={`max-w-[85%] px-3.5 py-2 rounded-lg text-sm border ${
                        isSelf
                          ? 'bg-indigo-50 border-indigo-200 text-slate-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex gap-2">
            <input
              type="text"
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder={t.tenant.msgPlaceholder}
              className="flex-1 h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
            />
            <button
              type="submit"
              disabled={!messageDraft.trim()}
              className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.tenant.send}</span>
            </button>
          </form>
        </section>
      </div>

      {/* Draft Pin Modal */}
      {draftPin && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitPin}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-indigo-700" />
                  <span>{t.tenant.reportPinTitle}</span>
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5 font-medium">
                  {draftPin.zoneLabel} ({draftPin.pinX}%, {draftPin.pinY}%)
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
                    value={ticketForm.category}
                    onChange={(e) => setTicketForm((p) => ({ ...p, category: e.target.value as any }))}
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
                    {t.tenant.urgencyLabel}
                  </label>
                  <select
                    value={ticketForm.priority}
                    onChange={(e) => setTicketForm((p) => ({ ...p, priority: e.target.value as any }))}
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
                  {t.tenant.issueTitleLabel}
                </label>
                <input
                  required
                  value={ticketForm.title}
                  onChange={(e) => setTicketForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t.tenant.issueTitlePlaceholder}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.tenant.detailsLabel}
                </label>
                <textarea
                  required
                  rows={3}
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder={t.tenant.detailsPlaceholder}
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
                {t.tenant.dispatchBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upload Document Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleUploadTenantDoc}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t.tenant.uploadModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.users.categoryLabel}
                </label>
                <select
                  value={docForm.category}
                  onChange={(e) => setDocForm((p) => ({ ...p, category: e.target.value as any }))}
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="ID Verification">{categoryLabel('ID Verification')}</option>
                  <option value="Lease Agreement">{categoryLabel('Lease Agreement')}</option>
                  <option value="Inspection">{categoryLabel('Inspection')}</option>
                  <option value="Receipt">{categoryLabel('Receipt')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.users.docTitleLabel}
                </label>
                <input
                  required
                  value={docForm.title}
                  onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Renter Insurance Policy 2026"
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.file}</label>
                <input
                  type="file"
                  required
                  onChange={handleDocFilePick}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="h-9 px-4 border border-slate-300 rounded-md text-xs font-medium text-slate-700"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-9 px-4 bg-indigo-700 text-white rounded-md text-xs font-medium cursor-pointer"
              >
                {t.tenant.uploadBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
