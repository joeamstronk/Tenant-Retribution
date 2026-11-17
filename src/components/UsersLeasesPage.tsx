import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { BuildingUnit, Lease, TenantDocument, User, UserRole } from '../types';

export function UsersLeasesPage() {
  const { user: currentUser, notify } = useAuth();
  const { formatAmount } = useCurrency();
  const { t, roleLabel, statusLabel, categoryLabel, formatLocalizedDate } = useLanguage();
  const [tab, setTab] = useState<'tenants' | 'documents' | 'staff'>('tenants');
  const [users, setUsers] = useState<User[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [units, setUnits] = useState<BuildingUnit[]>([]);
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedTenant, setSelectedTenant] = useState<User | null>(null);
  const [previewDoc, setPreviewDoc] = useState<TenantDocument | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showUploadDoc, setShowUploadDoc] = useState(false);

  // Add user form state
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'tenant' as UserRole,
    unitId: '',
    phone: '',
  });

  // Upload document form state
  const [docForm, setDocForm] = useState({
    tenantUserId: '',
    unitId: '',
    title: '',
    category: 'Lease Agreement' as TenantDocument['category'],
    fileName: '',
    mimeType: 'text/plain',
    fileData: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [uRes, lRes, unRes, dRes] = await Promise.all([
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ leases: Lease[] }>('/api/leases'),
        apiFetch<{ units: BuildingUnit[] }>('/api/units'),
        apiFetch<{ documents: TenantDocument[] }>('/api/documents'),
      ]);
      setUsers(uRes.users);
      setLeases(lRes.leases);
      setUnits(unRes.units.filter((u) => u.floor > 0));
      setDocuments(dRes.documents);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load user records.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tenants = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === 'tenant' &&
          (u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            (u.unitNumber || '').includes(search))
      ),
    [users, search]
  );

  const staffUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role !== 'tenant' &&
          (u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            u.role.includes(search.toLowerCase()))
      ),
    [users, search]
  );

  const filteredDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.tenantName.toLowerCase().includes(search.toLowerCase()) ||
          d.unitNumber.includes(search)
      ),
    [documents, search]
  );

  const isLandlord = currentUser?.role === 'landlord';
  const canVerify = currentUser?.role === 'landlord' || currentUser?.role === 'security';

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          ...newUserForm,
          unitId: newUserForm.role === 'tenant' ? newUserForm.unitId || null : null,
        }),
      });
      notify(`Created account for ${newUserForm.name}`, 'success');
      setShowAddUser(false);
      setNewUserForm({ name: '', email: '', password: '', role: 'tenant', unitId: '', phone: '' });
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to create user.', 'error');
    }
  };

  const handleToggleUserStatus = async (target: User) => {
    try {
      const nextStatus = target.status === 'Active' ? 'Inactive' : 'Active';
      await apiFetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(`${target.name} marked ${nextStatus}`, 'info');
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update user status.', 'error');
    }
  };

  const handleRoleChange = async (target: User, role: UserRole) => {
    try {
      await apiFetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      notify(`${target.name} → ${roleLabel(role)}`, 'success');
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update role.', 'error');
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      notify('Please upload files smaller than 4 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDocForm((prev) => ({
        ...prev,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileData: String(reader.result || ''),
        title: prev.title || file.name.replace(/\.[^.]+$/, ''),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenant = users.find((u) => u.id === docForm.tenantUserId);
    const unitId = docForm.unitId || tenant?.unitId;
    if (!docForm.tenantUserId || !unitId || !docForm.fileData) {
      notify('Select a tenant, unit, and file to upload.', 'error');
      return;
    }
    try {
      await apiFetch('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ ...docForm, unitId }),
      });
      notify(`Uploaded "${docForm.title}" to document vault`, 'success');
      setShowUploadDoc(false);
      setDocForm({
        tenantUserId: '',
        unitId: '',
        title: '',
        category: 'Lease Agreement',
        fileName: '',
        mimeType: 'text/plain',
        fileData: '',
      });
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Upload failed.', 'error');
    }
  };

  const handleVerifyDoc = async (docItem: TenantDocument) => {
    try {
      await apiFetch(`/api/documents/${docItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ verifiedBySecurity: !docItem.verifiedBySecurity }),
      });
      notify(
        docItem.verifiedBySecurity ? 'Document verification revoked' : 'Document verified',
        'success'
      );
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to verify document.', 'error');
    }
  };

  const handleDeleteDoc = async (docItem: TenantDocument) => {
    try {
      await apiFetch(`/api/documents/${docItem.id}`, { method: 'DELETE' });
      notify(`Removed "${docItem.title}"`, 'info');
      loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to delete document.', 'error');
    }
  };

  const decodeTextContent = (dataUrl: string) => {
    try {
      const base64 = dataUrl.split(',')[1];
      if (!base64) return dataUrl;
      return atob(base64);
    } catch {
      return t.users.binaryPreviewHint;
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.users.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t.users.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadDoc(true)}
            className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t.users.uploadDoc}</span>
          </button>
          {isLandlord && (
            <button
              type="button"
              onClick={() => setShowAddUser(true)}
              className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t.users.addUser}</span>
            </button>
          )}
        </div>
      </div>

      {/* Segmented Navigation & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setTab('tenants')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'tenants' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.users.tabTenants} ({tenants.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('documents')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'documents' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.users.tabDocs} ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('staff')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'staff' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.users.tabStaff} ({staffUsers.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.users.searchPlaceholder}
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-64 border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      ) : tab === 'tenants' ? (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">{t.common.unit}</th>
                  <th className="py-2.5 px-4">{t.users.colProfile}</th>
                  <th className="py-2.5 px-4">{t.users.colLeaseTerm}</th>
                  <th className="py-2.5 px-4 text-right">{t.users.colMonthlyRent}</th>
                  <th className="py-2.5 px-4">{t.users.colBadge}</th>
                  <th className="py-2.5 px-4 text-right">{t.users.colDetails}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {tenants.map((tenant) => {
                  const lease = leases.find((l) => l.tenantUserId === tenant.id);
                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums">
                        {tenant.unitNumber || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{tenant.name}</div>
                        <div className="text-xs text-slate-500">
                          {tenant.email} · {tenant.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {lease ? (
                          <div>
                            <div className="font-mono tabular-nums">
                              {formatLocalizedDate(lease.startDate)} – {formatLocalizedDate(lease.endDate)}
                            </div>
                            <div
                              className={
                                lease.status === 'Expiring Soon'
                                  ? 'text-amber-700 font-medium mt-0.5'
                                  : 'text-emerald-700 mt-0.5'
                              }
                            >
                              {statusLabel(lease.status)}
                            </div>
                          </div>
                        ) : (
                          t.users.noLease
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                        {lease ? formatAmount(lease.monthlyRent) : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono text-slate-700">{tenant.badgeCode}</div>
                        <div className={tenant.securityVerified ? 'text-emerald-700' : 'text-amber-700'}>
                          {tenant.securityVerified ? t.users.verifiedAccess : t.users.pendingClearance}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTenant(tenant)}
                          className="text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer whitespace-nowrap"
                        >
                          {t.users.inspectProfile}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'documents' ? (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          {filteredDocs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {t.users.noDocs}
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredDocs.map((d) => (
                <div
                  key={d.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-indigo-700 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {t.common.unit} {d.unitNumber} · {d.tenantName} · {categoryLabel(d.category)} · {t.users.uploadedOn}{' '}
                        {formatLocalizedDate(d.uploadedAt)} ·{' '}
                        <span className={d.verifiedBySecurity ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
                          {d.verifiedBySecurity ? t.users.secVerified : t.users.awaitingVerify}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(d)}
                      className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-100 rounded text-xs font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t.common.preview}</span>
                    </button>
                    <a
                      href={d.fileData}
                      download={d.fileName}
                      className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-100 rounded text-xs font-medium text-slate-700 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t.common.download}</span>
                    </a>
                    {canVerify && (
                      <button
                        type="button"
                        onClick={() => handleVerifyDoc(d)}
                        className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-100 rounded text-xs font-medium text-emerald-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{d.verifiedBySecurity ? t.common.verified : t.users.verifyBtn}</span>
                      </button>
                    )}
                    {isLandlord && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(d)}
                        aria-label={`Delete ${d.title}`}
                        className="h-8 px-2.5 border border-slate-200 bg-white hover:bg-red-50 rounded text-xs text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">{t.users.staffMember}</th>
                  <th className="py-2.5 px-4">{t.users.emailPhone}</th>
                  <th className="py-2.5 px-4">{t.users.badgeId}</th>
                  <th className="py-2.5 px-4">{t.users.roleScope}</th>
                  <th className="py-2.5 px-4">{t.common.status}</th>
                  {isLandlord && <th className="py-2.5 px-4 text-right">{t.users.accessControl}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {staffUsers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">{s.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>{s.email}</div>
                      <div className="text-slate-400">{s.phone}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">{s.badgeCode}</td>
                    <td className="py-3 px-4">
                      {isLandlord && s.id !== currentUser?.id ? (
                        <select
                          aria-label={`Role for ${s.name}`}
                          value={s.role}
                          onChange={(e) => handleRoleChange(s, e.target.value as UserRole)}
                          className="h-8 px-2 text-xs border border-slate-300 rounded bg-white text-slate-800"
                        >
                          <option value="landlord">{roleLabel('landlord')}</option>
                          <option value="finance">{roleLabel('finance')}</option>
                          <option value="security">{roleLabel('security')}</option>
                          <option value="maintenance">{roleLabel('maintenance')}</option>
                          <option value="tenant">{roleLabel('tenant')}</option>
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-indigo-700">
                          {roleLabel(s.role)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={s.status === 'Active' ? 'text-emerald-700' : 'text-red-700'}>
                        {statusLabel(s.status)}
                      </span>
                    </td>
                    {isLandlord && (
                      <td className="py-3 px-4 text-right">
                        {s.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(s)}
                            className="text-xs font-medium text-slate-700 hover:text-indigo-700 cursor-pointer"
                          >
                            {s.status === 'Active' ? t.users.deactivate : t.users.reactivate}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tenant Profile & Lease Detail Drawer/Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full p-6 space-y-5 shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  {selectedTenant.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.common.unit} {selectedTenant.unitNumber || t.common.unassigned} · {selectedTenant.badgeCode} ·{' '}
                  {selectedTenant.securityVerified ? t.users.secVerified : t.users.pendingClearance}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                aria-label={t.common.close}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const lease = leases.find((l) => l.tenantUserId === selectedTenant.id);
              const tenantDocs = documents.filter((d) => d.tenantUserId === selectedTenant.id);
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">{t.users.email}</p>
                      <p className="font-medium text-slate-900">{selectedTenant.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t.users.phone}</p>
                      <p className="font-medium text-slate-900">{selectedTenant.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t.users.leasePeriod}</p>
                      <p className="font-mono text-xs text-slate-900 mt-0.5 tabular-nums">
                        {lease
                          ? `${formatLocalizedDate(lease.startDate)} – ${formatLocalizedDate(lease.endDate)}`
                          : t.users.noLease}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t.users.rentDeposit}</p>
                      <p className="font-mono text-xs text-slate-900 mt-0.5 tabular-nums">
                        {lease
                          ? `${formatAmount(lease.monthlyRent)} / ${formatAmount(lease.depositAmount)}`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-slate-700">
                        {t.users.onFileDocs} ({tenantDocs.length})
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setDocForm((prev) => ({
                            ...prev,
                            tenantUserId: selectedTenant.id,
                            unitId: selectedTenant.unitId || '',
                          }));
                          setSelectedTenant(null);
                          setShowUploadDoc(true);
                        }}
                        className="text-xs font-medium text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t.users.attachFile}</span>
                      </button>
                    </div>
                    {tenantDocs.length === 0 ? (
                      <p className="text-xs text-slate-500">{t.users.noTenantDocs}</p>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                        {tenantDocs.map((td) => (
                          <div key={td.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-800 truncate">{td.title}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={td.verifiedBySecurity ? 'text-emerald-700' : 'text-amber-700'}>
                                {td.verifiedBySecurity ? t.common.verified : t.common.unverified}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(td)}
                                className="text-indigo-700 hover:underline cursor-pointer"
                              >
                                {t.users.view}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {previewDoc.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {previewDoc.fileName} · {t.common.unit} {previewDoc.unitNumber} · {categoryLabel(previewDoc.category)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                aria-label={t.common.close}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-md bg-slate-50 p-4 max-h-96 overflow-auto">
              {previewDoc.mimeType.startsWith('image/') ? (
                <img
                  src={previewDoc.fileData}
                  alt={previewDoc.title}
                  className="max-w-full h-auto mx-auto rounded"
                />
              ) : previewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewDoc.fileData}
                  title={previewDoc.title}
                  className="w-full h-80 bg-white border border-slate-200 rounded"
                />
              ) : (
                <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {decodeTextContent(previewDoc.fileData)}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <a
                href={previewDoc.fileData}
                download={previewDoc.fileName}
                className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.users.downloadFile}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add User / Tenant Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateUser}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t.users.createUserTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUser(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.fullName}</label>
                <input
                  required
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                  placeholder="Jordan Rivera"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.email}</label>
                <input
                  type="email"
                  required
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                  placeholder="jordan@meridianhouse.io"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.role}</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, role: e.target.value as UserRole }))}
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="tenant">{roleLabel('tenant')}</option>
                    <option value="finance">{roleLabel('finance')}</option>
                    <option value="security">{roleLabel('security')}</option>
                    <option value="maintenance">{roleLabel('maintenance')}</option>
                    <option value="landlord">{roleLabel('landlord')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.phone}</label>
                  <input
                    value={newUserForm.phone}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                    placeholder="+62 812 5550 190"
                  />
                </div>
              </div>
              {newUserForm.role === 'tenant' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.assignedUnit}</label>
                  <select
                    value={newUserForm.unitId}
                    onChange={(e) => setNewUserForm((p) => ({ ...p, unitId: e.target.value }))}
                    className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">{t.users.selectUnit}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {t.common.unit} {u.unitNumber} ({t.common.floor} {u.floor} · {statusLabel(u.occupancyStatus)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.users.initialPassword}
                </label>
                <input
                  type="text"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder={t.users.passwordDefaultHint}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddUser(false)}
                className="h-9 px-4 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t.users.createAccount}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upload Document Modal */}
      {showUploadDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-4">
          <form
            onSubmit={handleUploadDoc}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t.users.uploadTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadDoc(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.tenantLabel}</label>
                <select
                  required
                  value={docForm.tenantUserId}
                  onChange={(e) => {
                    const selected = users.find((u) => u.id === e.target.value);
                    setDocForm((p) => ({
                      ...p,
                      tenantUserId: e.target.value,
                      unitId: selected?.unitId || p.unitId,
                    }));
                  }}
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">{t.users.selectTenant}</option>
                  {users
                    .filter((u) => u.role === 'tenant')
                    .map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({t.common.unit} {tenant.unitNumber || '—'})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.categoryLabel}</label>
                <select
                  value={docForm.category}
                  onChange={(e) =>
                    setDocForm((p) => ({
                      ...p,
                      category: e.target.value as TenantDocument['category'],
                    }))
                  }
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="Lease Agreement">{categoryLabel('Lease Agreement')}</option>
                  <option value="ID Verification">{categoryLabel('ID Verification')}</option>
                  <option value="Inspection">{categoryLabel('Inspection')}</option>
                  <option value="Receipt">{categoryLabel('Receipt')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t.users.docTitleLabel}</label>
                <input
                  required
                  value={docForm.title}
                  onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Signed Lease Addendum 2026"
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.users.attachmentLabel}
                </label>
                <input
                  type="file"
                  required
                  onChange={handleFilePick}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUploadDoc(false)}
                className="h-9 px-4 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.users.saveToVault}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
