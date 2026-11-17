import React, { useMemo, useRef } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { BuildingUnit, MaintenanceRequest } from '../types';

export interface PinDraft {
  unitId: string;
  unitNumber: string;
  floor: number;
  zoneLabel: string;
  pinX: number;
  pinY: number;
}

interface FloorplanMapProps {
  floor: number;
  onChangeFloor: (floor: number) => void;
  units: BuildingUnit[];
  requests: MaintenanceRequest[];
  selectedPinId: string | null;
  onSelectPin: (request: MaintenanceRequest) => void;
  pinMode: boolean;
  onTogglePinMode?: () => void;
  draftPin?: PinDraft | null;
  onPlaceDraftPin?: (draft: PinDraft) => void;
  highlightUnitNumber?: string | null;
}

interface FloorZone {
  slot: 'NW' | 'NE' | 'SW' | 'SE' | 'COMMON';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  subRooms: { name: string; rx: number; ry: number }[];
}

const UPPER_FLOOR_ZONES: FloorZone[] = [
  {
    slot: 'NW',
    x: 40,
    y: 40,
    w: 330,
    h: 170,
    label: 'North-West Residence',
    subRooms: [
      { name: 'Living', rx: 110, ry: 115 },
      { name: 'Kitchen', rx: 280, ry: 95 },
      { name: 'Bath', rx: 315, ry: 175 },
    ],
  },
  {
    slot: 'NE',
    x: 430,
    y: 40,
    w: 330,
    h: 170,
    label: 'North-East Residence',
    subRooms: [
      { name: 'Kitchen', rx: 495, ry: 95 },
      { name: 'Living', rx: 650, ry: 115 },
      { name: 'Bath', rx: 475, ry: 175 },
    ],
  },
  {
    slot: 'SW',
    x: 40,
    y: 290,
    w: 330,
    h: 170,
    label: 'South-West Residence',
    subRooms: [
      { name: 'Living', rx: 115, ry: 375 },
      { name: 'Kitchen', rx: 280, ry: 345 },
      { name: 'Bath', rx: 315, ry: 425 },
    ],
  },
  {
    slot: 'SE',
    x: 430,
    y: 290,
    w: 330,
    h: 170,
    label: 'South-East Residence',
    subRooms: [
      { name: 'Kitchen', rx: 495, ry: 345 },
      { name: 'Living', rx: 655, ry: 375 },
      { name: 'Bath', rx: 475, ry: 425 },
    ],
  },
];

const GROUND_ZONES = [
  { id: 'lobby', label: 'Main Lobby & Concierge', x: 40, y: 40, w: 330, h: 170 },
  { id: 'security', label: 'Security Vestibule & Mailroom', x: 430, y: 40, w: 330, h: 170 },
  { id: 'garage', label: 'Sub-Level Garage Bay', x: 40, y: 290, w: 330, h: 170 },
  { id: 'utility', label: 'Mechanical & Boiler Plant', x: 430, y: 290, w: 330, h: 170 },
];

function getPinFill(req: MaintenanceRequest): string {
  if (req.status === 'Resolved') return '#16A34A';
  if (req.priority === 'Urgent' || req.priority === 'High') return '#DC2626';
  if (req.status === 'In Progress') return '#D97706';
  return '#4338CA';
}

export function FloorplanMap({
  floor,
  onChangeFloor,
  units,
  requests,
  selectedPinId,
  onSelectPin,
  pinMode,
  onTogglePinMode,
  draftPin,
  onPlaceDraftPin,
  highlightUnitNumber,
}: FloorplanMapProps) {
  const { t, statusLabel } = useLanguage();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const floorTabs = useMemo(
    () => [
      { floor: 0, label: t.floorplan.groundLobby },
      { floor: 1, label: `${t.floorplan.floorPrefix} 1 (101–104)` },
      { floor: 2, label: `${t.floorplan.floorPrefix} 2 (201–204)` },
      { floor: 3, label: `${t.floorplan.floorPrefix} 3 (301–304)` },
      { floor: 4, label: `${t.floorplan.floorPrefix} 4 (401–404)` },
    ],
    [t]
  );

  const floorUnits = useMemo(
    () =>
      units
        .filter((u) => u.floor === floor)
        .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber)),
    [units, floor]
  );

  const floorPins = useMemo(
    () => requests.filter((r) => r.floor === floor),
    [requests, floor]
  );

  const commonUnit = useMemo(
    () => units.find((u) => u.unitNumber === 'COMMON') ?? units[0],
    [units]
  );

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pinMode || !onPlaceDraftPin || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 800;
    const rawY = ((e.clientY - rect.top) / rect.height) * 500;
    const pinX = Math.max(4, Math.min(96, Number(((rawX / 800) * 100).toFixed(1))));
    const pinY = Math.max(6, Math.min(94, Number(((rawY / 500) * 100).toFixed(1))));

    if (floor === 0) {
      const matchedZone =
        GROUND_ZONES.find(
          (z) => rawX >= z.x && rawX <= z.x + z.w && rawY >= z.y && rawY <= z.y + z.h
        ) ?? null;

      const zoneLabel = matchedZone
        ? `Ground · ${matchedZone.label}`
        : 'Ground · Central Corridor & Lift';

      if (commonUnit) {
        onPlaceDraftPin({
          unitId: commonUnit.id,
          unitNumber: 'COMMON',
          floor: 0,
          zoneLabel,
          pinX,
          pinY,
        });
      }
      return;
    }

    let matchedUnit: BuildingUnit | undefined;
    let matchedRoom = 'Corridor / Riser';

    UPPER_FLOOR_ZONES.forEach((z, idx) => {
      if (rawX >= z.x && rawX <= z.x + z.w && rawY >= z.y && rawY <= z.y + z.h) {
        matchedUnit = floorUnits[idx];
        let bestDist = Infinity;
        for (const sub of z.subRooms) {
          const d = Math.hypot(rawX - sub.rx, rawY - sub.ry);
          if (d < bestDist) {
            bestDist = d;
            matchedRoom = sub.name;
          }
        }
      }
    });

    const targetUnit = matchedUnit ?? floorUnits[0] ?? commonUnit;
    if (!targetUnit) return;

    const zoneLabel = matchedUnit
      ? `Unit ${matchedUnit.unitNumber} · ${matchedRoom}`
      : `Floor ${floor} · Central Corridor`;

    onPlaceDraftPin({
      unitId: targetUnit.id,
      unitNumber: targetUnit.unitNumber,
      floor,
      zoneLabel,
      pinX,
      pinY,
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          {floorTabs.map((tab) => {
            const count = requests.filter((r) => r.floor === tab.floor && r.status !== 'Resolved').length;
            const active = floor === tab.floor;
            return (
              <button
                key={tab.floor}
                type="button"
                onClick={() => onChangeFloor(tab.floor)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
                {count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {onTogglePinMode && (
            <button
              type="button"
              onClick={onTogglePinMode}
              className={`h-8 px-3 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                pinMode
                  ? 'bg-indigo-700 border-indigo-700 text-white'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{pinMode ? t.floorplan.pinActive : t.floorplan.pinNew}</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 bg-white">
        <div
          className={`relative border border-slate-200 rounded-md bg-white overflow-hidden ${
            pinMode ? 'cursor-crosshair ring-2 ring-indigo-600/20' : ''
          }`}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 800 500"
            onClick={handleSvgClick}
            className="w-full h-auto block select-none bg-white"
            role="img"
            aria-label={`Meridian House floorplan ${floor}`}
          >
            <defs>
              <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#F1F5F9" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="800" height="500" fill="url(#cad-grid)" />
            <rect x="24" y="24" width="752" height="452" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />

            <rect x="40" y="222" width="720" height="56" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1" />
            <rect x="362" y="222" width="76" height="56" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.2" />
            <text x="400" y="247" textAnchor="middle" className="fill-slate-600 text-[10px] font-medium">
              {t.floorplan.elevator}
            </text>
            <text x="400" y="261" textAnchor="middle" className="fill-slate-400 text-[9px] font-mono">
              {t.floorplan.coreStairs}
            </text>
            <text x="190" y="254" textAnchor="middle" className="fill-slate-400 text-[10px] tracking-widest uppercase">
              {t.floorplan.westCorridor}
            </text>
            <text x="610" y="254" textAnchor="middle" className="fill-slate-400 text-[10px] tracking-widest uppercase">
              {t.floorplan.eastCorridor}
            </text>

            {floor === 0
              ? GROUND_ZONES.map((z) => (
                  <g key={z.id}>
                    <rect
                      x={z.x}
                      y={z.y}
                      width={z.w}
                      height={z.h}
                      fill="#FFFFFF"
                      stroke="#64748B"
                      strokeWidth="1.5"
                      className="hover:fill-slate-50 transition-colors"
                    />
                    <text x={z.x + 16} y={z.y + 28} className="fill-slate-900 text-[13px] font-semibold">
                      {z.label}
                    </text>
                    <text x={z.x + 16} y={z.y + 46} className="fill-slate-400 text-[11px]">
                      {t.floorplan.commonInfra}
                    </text>
                  </g>
                ))
              : UPPER_FLOOR_ZONES.map((zone, idx) => {
                  const unit = floorUnits[idx];
                  const isHighlighted =
                    unit && highlightUnitNumber && unit.unitNumber === highlightUnitNumber;
                  const unitFill = isHighlighted
                    ? '#EEF2FF'
                    : unit?.occupancyStatus === 'Maintenance'
                      ? '#FFFBEB'
                      : unit?.occupancyStatus === 'Vacant'
                        ? '#F8FAFC'
                        : '#FFFFFF';

                  return (
                    <g key={zone.slot}>
                      <rect
                        x={zone.x}
                        y={zone.y}
                        width={zone.w}
                        height={zone.h}
                        fill={unitFill}
                        stroke={isHighlighted ? '#4338CA' : '#64748B'}
                        strokeWidth={isHighlighted ? 2 : 1.5}
                        className="transition-colors"
                      />
                      <line
                        x1={zone.x + 215}
                        y1={zone.y}
                        x2={zone.x + 215}
                        y2={zone.y + zone.h}
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />
                      <line
                        x1={zone.x + 215}
                        y1={zone.y + 100}
                        x2={zone.x + zone.w}
                        y2={zone.y + 100}
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />

                      <text x={zone.x + 16} y={zone.y + 28} className="fill-slate-900 text-[15px] font-semibold font-mono">
                        Unit {unit ? unit.unitNumber : `${floor}0${idx + 1}`}
                      </text>
                      <text x={zone.x + 16} y={zone.y + 46} className="fill-slate-500 text-[11px]">
                        {unit
                          ? `${unit.unitType} · ${unit.areaSqm} sqm · ${
                              unit.tenantName || statusLabel(unit.occupancyStatus)
                            }`
                          : zone.label}
                      </text>

                      {zone.subRooms.map((sub) => (
                        <text key={sub.name} x={sub.rx} y={sub.ry} textAnchor="middle" className="fill-slate-400 text-[10px]">
                          {sub.name}
                        </text>
                      ))}
                    </g>
                  );
                })}

            {floorPins.map((req) => {
              const cx = (req.pinX / 100) * 800;
              const cy = (req.pinY / 100) * 500;
              const isSelected = req.id === selectedPinId;
              const fill = getPinFill(req);

              return (
                <g
                  key={req.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPin(req);
                  }}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={18} fill="none" stroke="#4338CA" strokeWidth="2" />
                  )}
                  <circle cx={cx} cy={cy} r={11} fill={fill} stroke="#FFFFFF" strokeWidth="2.5" />
                  <text
                    x={cx}
                    y={cy + 3.5}
                    textAnchor="middle"
                    className="fill-white text-[9px] font-bold font-mono pointer-events-none"
                  >
                    {req.unitNumber === 'COMMON' ? 'C' : req.unitNumber}
                  </text>
                </g>
              );
            })}

            {draftPin && draftPin.floor === floor && (
              <g pointerEvents="none">
                <circle
                  cx={(draftPin.pinX / 100) * 800}
                  cy={(draftPin.pinY / 100) * 500}
                  r={14}
                  fill="#4338CA"
                  fillOpacity="0.18"
                  stroke="#4338CA"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
                <circle cx={(draftPin.pinX / 100) * 800} cy={(draftPin.pinY / 100) * 500} r={6} fill="#4338CA" />
              </g>
            )}
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
              {t.floorplan.legendUrgent}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600" />
              {t.floorplan.legendProgress}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-700" />
              {t.floorplan.legendOpen}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
              {t.floorplan.legendResolved}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{pinMode ? t.floorplan.hintPin : t.floorplan.hintInspect}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
