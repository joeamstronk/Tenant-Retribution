import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { Building, BuildingUnit } from '../types';

const SPACE_TYPES: BuildingUnit['unitType'][] = [
  'Studio',
  '1BR',
  '2BR',
  'Penthouse',
  'Commercial',
  'Office',
  'Retail',
  'Storage',
];

const OCCUPANCY_STATUSES: BuildingUnit['occupancyStatus'][] = ['Vacant', 'Occupied', 'Maintenance'];
const BUILDING_STATUSES: Building['status'][] = ['Active', 'Maintenance', 'Inactive'];

export function PropertiesPage() {
  const { user, notify, subscribeWs } = useAuth();
  const { currency, formatAmount, toDisplayAmount, toBaseAmount } = useCurrency();
  const { t, statusLabel } = useLanguage();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<BuildingUnit[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('ALL');
  const [floorFilter, setFloorFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Building modal state
  const [buildingModalOpen, setBuildingModalOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [bldName, setBldName] = useState('');
  const [bldCode, setBldCode] = useState('');
  const [bldAddress, setBldAddress] = useState('');
  const [bldFloors, setBldFloors] = useState('4');
  const [bldStatus, setBldStatus] = useState<Building['status']>('Active');
  const [bldDesc, setBldDesc] = useState('');
  const [savingBuilding, setSavingBuilding] = useState(false);

  // Space modal state
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<BuildingUnit | null>(null);
  const [spcBuildingId, setSpcBuildingId] = useState('');
  const [spcNumber, setSpcNumber] = useState('');
  const [spcFloor, setSpcFloor] = useState('1');
  const [spcType, setSpcType] = useState<BuildingUnit['unitType']>('1BR');
  const [spcArea, setSpcArea] = useState('65');
  const [spcRent, setSpcRent] = useState('');
  const [spcStatus, setSpcStatus] = useState<BuildingUnit['occupancyStatus']>('Vacant');
  const [savingSpace, setSavingSpace] = useState(false);

  // Delete confirmation modal
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'building'; item: Building } | { kind: 'space'; item: BuildingUnit } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [bRes, uRes] = await Promise.all([
        apiFetch<{ buildings: Building[] }>('/api/buildings'),
        apiFetch<{ units: BuildingUnit[] }>('/api/units'),
      ]);
      setBuildings(bRes.buildings);
      setUnits(uRes.units);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load properties.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
    const unsubBld = subscribeWs('building:updated', () => loadData());
    const unsubUnit = subscribeWs('unit:updated', () => loadData());
    return () => {
      unsubBld();
      unsubUnit();
    };
  }, [loadData, subscribeWs]);

  const rentableSpaces = useMemo(() => units.filter((u) => u.floor > 0), [units]);

  const metrics = useMemo(() => {
    const occupied = rentableSpaces.filter((u) => u.occupancyStatus === 'Occupied').length;
    const totalRentBase = rentableSpaces.reduce((sum, u) => sum + (u.monthlyRent || 0), 0);
    return {
      totalBuildings: buildings.length,
      totalSpaces: rentableSpaces.length,
      occupiedSpaces: occupied,
      totalRentBase,
    };
  }, [buildings, rentableSpaces]);

  const availableFloors = useMemo(() => {
    const set = new Set<number>();
    for (const u of units) {
      if (selectedBuildingId === 'ALL' || u.buildingId === selectedBuildingId) {
        if (u.floor > 0) set.add(u.floor);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [units, selectedBuildingId]);

  const filteredSpaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return units.filter((u) => {
      if (selectedBuildingId !== 'ALL' && u.buildingId !== selectedBuildingId) return false;
      if (floorFilter !== 'ALL' && String(u.floor) !== floorFilter) return false;
      if (statusFilter !== 'ALL' && u.occupancyStatus !== statusFilter) return false;
      if (q) {
        const hay = `${u.unitNumber} ${u.unitType} ${u.tenantName || ''} ${u.buildingName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [units, selectedBuildingId, floorFilter, statusFilter, searchQuery]);

  if (user?.role !== 'landlord') {
    return (
      <div className="border border-slate-200 rounded-lg p-8 bg-white text-sm text-slate-600">
        {t.properties.subtitle}
      </div>
    );
  }

  const openCreateBuilding = () => {
    setEditingBuilding(null);
    setBldName('');
    setBldCode(`BLD-${String(buildings.length + 1).padStart(2, '0')}`);
    setBldAddress('');
    setBldFloors('4');
    setBldStatus('Active');
    setBldDesc('');
    setBuildingModalOpen(true);
  };

  const openEditBuilding = (bld: Building) => {
    setEditingBuilding(bld);
    setBldName(bld.name);
    setBldCode(bld.code);
    setBldAddress(bld.address);
    setBldFloors(String(bld.floorsCount));
    setBldStatus(bld.status);
    setBldDesc(bld.description);
    setBuildingModalOpen(true);
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBuilding(true);
    try {
      const payload = {
        name: bldName.trim(),
        code: bldCode.trim().toUpperCase(),
        address: bldAddress.trim(),
        floorsCount: Math.max(1, Number(bldFloors) || 1),
        status: bldStatus,
        description: bldDesc.trim(),
      };
      if (editingBuilding) {
        await apiFetch(`/api/buildings/${editingBuilding.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify(t.properties.buildingUpdatedToast, 'success');
      } else {
        await apiFetch('/api/buildings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(t.properties.buildingCreatedToast, 'success');
      }
      setBuildingModalOpen(false);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save building.', 'error');
    } finally {
      setSavingBuilding(false);
    }
  };

  const openCreateSpace = () => {
    setEditingSpace(null);
    const defaultBldId =
      selectedBuildingId !== 'ALL' ? selectedBuildingId : buildings[0]?.id || '';
    setSpcBuildingId(defaultBldId);
    setSpcNumber('');
    setSpcFloor('1');
    setSpcType('1BR');
    setSpcArea('65');
    setSpcRent(String(toDisplayAmount(2200)));
    setSpcStatus('Vacant');
    setSpaceModalOpen(true);
  };

  const openEditSpace = (space: BuildingUnit) => {
    setEditingSpace(space);
    setSpcBuildingId(space.buildingId || buildings[0]?.id || '');
    setSpcNumber(space.unitNumber);
    setSpcFloor(String(space.floor));
    setSpcType(space.unitType);
    setSpcArea(String(space.areaSqm));
    setSpcRent(String(toDisplayAmount(space.monthlyRent)));
    setSpcStatus(space.occupancyStatus);
    setSpaceModalOpen(true);
  };

  const handleSaveSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSpace(true);
    try {
      const baseRent = Math.max(0, toBaseAmount(Number(spcRent) || 0));
      const payload = {
        buildingId: spcBuildingId || buildings[0]?.id || null,
        unitNumber: spcNumber.trim(),
        floor: editingSpace && editingSpace.floor === 0 ? 0 : Math.max(1, Number(spcFloor) || 1),
        unitType: spcType,
        areaSqm: Math.max(1, Number(spcArea) || 20),
        monthlyRent: baseRent,
        occupancyStatus: spcStatus,
      };
      if (editingSpace) {
        await apiFetch(`/api/units/${editingSpace.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify(t.properties.spaceUpdatedToast, 'success');
      } else {
        await apiFetch('/api/units', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(t.properties.spaceCreatedToast, 'success');
      }
      setSpaceModalOpen(false);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save space.', 'error');
    } finally {
      setSavingSpace(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === 'building') {
        await apiFetch(`/api/buildings/${confirmDelete.item.id}`, { method: 'DELETE' });
        if (selectedBuildingId === confirmDelete.item.id) {
          setSelectedBuildingId('ALL');
        }
        notify(t.properties.buildingDeletedToast, 'info');
      } else {
        await apiFetch(`/api/units/${confirmDelete.item.id}`, { method: 'DELETE' });
        notify(t.properties.spaceDeletedToast, 'info');
      }
      setConfirmDelete(null);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to delete item.', 'error');
    } finally {
      setDeleting(false);
    }
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
    <div className="space-y-8 bg-white">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {t.properties.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t.properties.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreateBuilding}
            className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{t.properties.addBuildingBtn}</span>
          </button>
          <button
            type="button"
            onClick={openCreateSpace}
            className="h-9 px-3.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.properties.addSpaceBtn}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.properties.totalBuildings}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.totalBuildings}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.properties.totalSpaces}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.totalSpaces}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.properties.occupiedSpaces}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {metrics.occupiedSpaces}{' '}
            <span className="text-base font-normal text-slate-400">/ {metrics.totalSpaces}</span>
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5 bg-white">
          <p className="text-xs font-medium text-slate-500">{t.properties.rentCapacity}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatAmount(metrics.totalRentBase)}
          </p>
        </div>
      </section>

      {/* Buildings Directory */}
      <section className="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t.properties.buildingsTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.properties.buildingsSubtitle}</p>
          </div>
          {selectedBuildingId !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedBuildingId('ALL')}
              className="h-8 px-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 cursor-pointer"
            >
              {t.properties.allBuildings}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {buildings.map((bld) => {
            const isSelected = selectedBuildingId === bld.id;
            return (
              <div
                key={bld.id}
                className={`p-5 flex flex-col justify-between gap-4 border-b border-slate-200 ${
                  isSelected ? 'bg-indigo-50/40' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBuildingId((prev) => (prev === bld.id ? 'ALL' : bld.id))
                      }
                      className="text-left cursor-pointer"
                    >
                      <div className="font-mono text-xs text-indigo-700 font-medium">{bld.code}</div>
                      <h3 className="font-display text-base font-semibold text-slate-900 hover:text-indigo-700 transition-colors mt-0.5">
                        {bld.name}
                      </h3>
                    </button>
                    <span
                      className={`text-xs font-medium shrink-0 ${
                        bld.status === 'Active'
                          ? 'text-emerald-700'
                          : bld.status === 'Maintenance'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {statusLabel(bld.status)}
                    </span>
                  </div>

                  {bld.address && (
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{bld.address}</p>
                  )}
                  {bld.description && (
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">{bld.description}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="text-xs font-mono text-slate-600 tabular-nums">
                    {bld.floorsCount} {t.properties.floorsLabel} · {bld.unitCount ?? 0}{' '}
                    {t.properties.spacesCountLabel} ({bld.occupiedCount ?? 0}{' '}
                    {t.properties.occupiedCountLabel})
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditBuilding(bld)}
                      title={t.properties.editBtn}
                      className="h-7 px-2 border border-slate-200 bg-white hover:bg-slate-50 rounded text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{t.properties.editBtn}</span>
                    </button>
                    {buildings.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ kind: 'building', item: bld })}
                        title={t.properties.deleteBtn}
                        className="h-7 px-2 border border-red-200 bg-white hover:bg-red-50 rounded text-xs font-medium text-red-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Spaces / Units Registry */}
      <section className="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {t.properties.spacesTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.properties.spacesSubtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.properties.searchPlaceholder}
                className="h-8 pl-8 pr-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700 w-52"
              />
            </div>

            <select
              value={selectedBuildingId}
              onChange={(e) => {
                setSelectedBuildingId(e.target.value);
                setFloorFilter('ALL');
              }}
              className="h-8 px-2.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">{t.properties.allBuildings}</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>

            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="h-8 px-2.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">{t.properties.filterFloorAll}</option>
              {availableFloors.map((f) => (
                <option key={f} value={String(f)}>
                  {t.properties.colFloor} {f}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="ALL">{t.properties.filterStatusAll}</option>
              {OCCUPANCY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredSpaces.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{t.properties.noSpaces}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">{t.properties.colSpace}</th>
                  <th className="py-2.5 px-4">{t.properties.colBuilding}</th>
                  <th className="py-2.5 px-4">{t.properties.colFloor}</th>
                  <th className="py-2.5 px-4">{t.properties.colType}</th>
                  <th className="py-2.5 px-4 text-right">{t.properties.colArea}</th>
                  <th className="py-2.5 px-4 text-right">{t.properties.colRent}</th>
                  <th className="py-2.5 px-4">{t.properties.colStatus}</th>
                  <th className="py-2.5 px-4">{t.properties.colTenant}</th>
                  <th className="py-2.5 px-4 text-right">{t.properties.colAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredSpaces.map((u) => {
                  const isCommon = u.unitNumber === 'COMMON' || u.floor === 0;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900 tabular-nums">
                        {u.unitNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {u.buildingName || buildings[0]?.name || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                        {u.floor}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{u.unitType}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {u.areaSqm}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                        {formatAmount(u.monthlyRent)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        <span
                          className={
                            u.occupancyStatus === 'Occupied'
                              ? 'text-emerald-700'
                              : u.occupancyStatus === 'Maintenance'
                                ? 'text-amber-700'
                                : 'text-slate-600'
                          }
                        >
                          {statusLabel(u.occupancyStatus)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {isCommon ? t.properties.commonProtected : u.tenantName || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditSpace(u)}
                            className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 rounded text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>{t.properties.editBtn}</span>
                          </button>
                          {!isCommon && (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete({ kind: 'space', item: u })}
                              title={t.properties.deleteBtn}
                              className="h-7 px-2 border border-red-200 bg-white hover:bg-red-50 rounded text-xs font-medium text-red-700 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Building Create/Edit Modal */}
      {buildingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingBuilding ? t.properties.buildingModalEdit : t.properties.buildingModalNew}
              </h3>
              <button
                type="button"
                onClick={() => setBuildingModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBuilding} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.buildingName}
                  </label>
                  <input
                    type="text"
                    required
                    value={bldName}
                    onChange={(e) => setBldName(e.target.value)}
                    placeholder="Tower B — Sudirman Annex"
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.buildingCode}
                  </label>
                  <input
                    type="text"
                    required
                    value={bldCode}
                    onChange={(e) => setBldCode(e.target.value)}
                    placeholder="MH-02"
                    className="w-full h-9 px-3 text-sm font-mono uppercase border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.properties.buildingAddress}
                </label>
                <input
                  type="text"
                  value={bldAddress}
                  onChange={(e) => setBldAddress(e.target.value)}
                  placeholder="Jl. Jend. Sudirman, Jakarta"
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.buildingFloors}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={bldFloors}
                    onChange={(e) => setBldFloors(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.buildingStatus}
                  </label>
                  <select
                    value={bldStatus}
                    onChange={(e) => setBldStatus(e.target.value as Building['status'])}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    {BUILDING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.properties.buildingDesc}
                </label>
                <textarea
                  rows={2}
                  value={bldDesc}
                  onChange={(e) => setBldDesc(e.target.value)}
                  className="w-full p-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBuildingModalOpen(false)}
                  className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={savingBuilding}
                  className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-md text-xs font-medium cursor-pointer"
                >
                  {editingBuilding ? t.properties.saveChanges : t.properties.createBuilding}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Space Create/Edit Modal */}
      {spaceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingSpace ? t.properties.spaceModalEdit : t.properties.spaceModalNew}
              </h3>
              <button
                type="button"
                onClick={() => setSpaceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSpace} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.properties.spaceBuilding}
                </label>
                <select
                  value={spcBuildingId}
                  onChange={(e) => setSpcBuildingId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.spaceNumber}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingSpace?.unitNumber === 'COMMON'}
                    value={spcNumber}
                    onChange={(e) => setSpcNumber(e.target.value)}
                    placeholder="501 / R-01"
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-md bg-white text-slate-900 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.spaceFloor}
                  </label>
                  <input
                    type="number"
                    min={editingSpace?.floor === 0 ? 0 : 1}
                    max="120"
                    required
                    disabled={editingSpace?.floor === 0}
                    value={spcFloor}
                    onChange={(e) => setSpcFloor(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-md bg-white text-slate-900 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.spaceType}
                  </label>
                  <select
                    value={spcType}
                    onChange={(e) => setSpcType(e.target.value as BuildingUnit['unitType'])}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    {SPACE_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.spaceArea}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={spcArea}
                    onChange={(e) => setSpcArea(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.spaceRent} ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={spcRent}
                    onChange={(e) => setSpcRent(e.target.value)}
                    className="w-full h-9 px-3 text-sm font-mono tabular-nums border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.properties.spaceStatus}
                  </label>
                  <select
                    value={spcStatus}
                    onChange={(e) =>
                      setSpcStatus(e.target.value as BuildingUnit['occupancyStatus'])
                    }
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    {OCCUPANCY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSpaceModalOpen(false)}
                  className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={savingSpace}
                  className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-md text-xs font-medium cursor-pointer"
                >
                  {editingSpace ? t.properties.saveChanges : t.properties.createSpace}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {t.properties.confirmDeleteTitle}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                {confirmDelete.kind === 'building'
                  ? t.properties.confirmDeleteBuilding
                  : t.properties.confirmDeleteSpace}
              </p>
              <div className="border border-slate-200 rounded-md px-3 py-2 bg-slate-50 text-xs font-mono text-slate-800">
                {confirmDelete.kind === 'building'
                  ? `${confirmDelete.item.code} · ${confirmDelete.item.name}`
                  : `Unit ${confirmDelete.item.unitNumber} · ${confirmDelete.item.unitType}`}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="h-9 px-3.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="h-9 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md text-xs font-medium cursor-pointer"
                >
                  {t.properties.confirmDeleteBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
