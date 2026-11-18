import type {
  BuildingUnit,
  ChatChannel,
  ChatMessage,
  CurrencySettings,
  DemoAccount,
  Lease,
  MaintenanceRequest,
  RentPayment,
  SecurityLog,
  TenantDocument,
  User,
  UserRole,
} from '../types';

const DB_STORAGE_KEY = 'meridian_static_db_v1';

interface StoredUser extends User {
  password: string;
}

interface StaticDbState {
  units: BuildingUnit[];
  users: StoredUser[];
  sessions: Record<string, string>;
  leases: Lease[];
  payments: RentPayment[];
  documents: TenantDocument[];
  maintenance: MaintenanceRequest[];
  securityLogs: SecurityLog[];
  channels: ChatChannel[];
  messages: ChatMessage[];
  currencySettings: CurrencySettings;
}

type LocalEventHandler = (event: string, payload: unknown) => void;
const localListeners = new Set<LocalEventHandler>();
const broadcast =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('meridian_static_events')
    : null;

if (broadcast) {
  broadcast.onmessage = (evt) => {
    const { event, payload } = evt.data || {};
    if (!event) return;
    for (const fn of localListeners) {
      fn(event, payload);
    }
  };
}

function emitLocalEvent(event: string, payload: unknown) {
  for (const fn of localListeners) {
    fn(event, payload);
  }
  broadcast?.postMessage({ event, payload });
}

export function subscribeLocalEvents(handler: LocalEventHandler): () => void {
  localListeners.add(handler);
  return () => {
    localListeners.delete(handler);
  };
}

function encodeTextDoc(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:text/plain;base64,${btoa(binary)}`;
}

function createInitialState(): StaticDbState {
  const now = '2026-11-01T09:00:00.000Z';

  const units: BuildingUnit[] = [
    { id: 'unit-000', unitNumber: 'COMMON', floor: 0, unitType: 'Commercial', areaSqm: 320, monthlyRent: 0, occupancyStatus: 'Occupied' },
    { id: 'unit-101', unitNumber: '101', floor: 1, unitType: 'Commercial', areaSqm: 95, monthlyRent: 3400, occupancyStatus: 'Occupied' },
    { id: 'unit-102', unitNumber: '102', floor: 1, unitType: '1BR', areaSqm: 68, monthlyRent: 2250, occupancyStatus: 'Occupied' },
    { id: 'unit-103', unitNumber: '103', floor: 1, unitType: 'Studio', areaSqm: 48, monthlyRent: 1850, occupancyStatus: 'Occupied' },
    { id: 'unit-104', unitNumber: '104', floor: 1, unitType: '1BR', areaSqm: 70, monthlyRent: 2300, occupancyStatus: 'Vacant' },
    { id: 'unit-201', unitNumber: '201', floor: 2, unitType: '2BR', areaSqm: 102, monthlyRent: 3150, occupancyStatus: 'Occupied' },
    { id: 'unit-202', unitNumber: '202', floor: 2, unitType: '1BR', areaSqm: 68, monthlyRent: 2350, occupancyStatus: 'Occupied' },
    { id: 'unit-203', unitNumber: '203', floor: 2, unitType: '1BR', areaSqm: 68, monthlyRent: 2350, occupancyStatus: 'Maintenance' },
    { id: 'unit-204', unitNumber: '204', floor: 2, unitType: '2BR', areaSqm: 104, monthlyRent: 3200, occupancyStatus: 'Occupied' },
    { id: 'unit-301', unitNumber: '301', floor: 3, unitType: '2BR', areaSqm: 102, monthlyRent: 3250, occupancyStatus: 'Occupied' },
    { id: 'unit-302', unitNumber: '302', floor: 3, unitType: '1BR', areaSqm: 72, monthlyRent: 2450, occupancyStatus: 'Occupied' },
    { id: 'unit-303', unitNumber: '303', floor: 3, unitType: '1BR', areaSqm: 72, monthlyRent: 2450, occupancyStatus: 'Occupied' },
    { id: 'unit-304', unitNumber: '304', floor: 3, unitType: '2BR', areaSqm: 104, monthlyRent: 3300, occupancyStatus: 'Vacant' },
    { id: 'unit-401', unitNumber: '401', floor: 4, unitType: 'Penthouse', areaSqm: 145, monthlyRent: 4600, occupancyStatus: 'Occupied' },
    { id: 'unit-402', unitNumber: '402', floor: 4, unitType: '2BR', areaSqm: 106, monthlyRent: 3450, occupancyStatus: 'Occupied' },
    { id: 'unit-403', unitNumber: '403', floor: 4, unitType: '2BR', areaSqm: 106, monthlyRent: 3450, occupancyStatus: 'Occupied' },
    { id: 'unit-404', unitNumber: '404', floor: 4, unitType: 'Penthouse', areaSqm: 150, monthlyRent: 4800, occupancyStatus: 'Occupied' },
  ];

  const users: StoredUser[] = [
    { id: 'usr-landlord', name: 'Elena Vance', email: 'landlord@meridianhouse.io', password: 'meridian2026', role: 'landlord', unitId: null, unitNumber: null, phone: '+1 (415) 890-1100', badgeCode: 'MH-OWN-001', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-finance', name: 'Marcus Chen', email: 'finance@meridianhouse.io', password: 'meridian2026', role: 'finance', unitId: null, unitNumber: null, phone: '+1 (415) 890-1102', badgeCode: 'MH-FIN-004', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-security', name: 'David Okonkwo', email: 'security@meridianhouse.io', password: 'meridian2026', role: 'security', unitId: null, unitNumber: null, phone: '+1 (415) 890-1109', badgeCode: 'MH-SEC-002', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-maint', name: 'Carlos Rivera', email: 'maintenance@meridianhouse.io', password: 'meridian2026', role: 'maintenance', unitId: null, unitNumber: null, phone: '+1 (415) 890-1115', badgeCode: 'MH-MNT-003', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t302', name: 'Clara Morales', email: 'tenant302@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-302', unitNumber: '302', phone: '+1 (415) 602-4419', badgeCode: 'MH-RES-302', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t101', name: 'Atelier Press Studio', email: 'atelier@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-101', unitNumber: '101', phone: '+1 (415) 519-8820', badgeCode: 'MH-COM-101', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t102', name: 'Hannah Lindqvist', email: 'hannah.l@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-102', unitNumber: '102', phone: '+1 (415) 704-2910', badgeCode: 'MH-RES-102', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t103', name: 'Noah Patel', email: 'noah.p@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-103', unitNumber: '103', phone: '+1 (415) 392-7741', badgeCode: 'MH-RES-103', securityVerified: false, status: 'Active', createdAt: now },
    { id: 'usr-t201', name: 'Sophia & Liam Brooks', email: 'brooks@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-201', unitNumber: '201', phone: '+1 (415) 821-0094', badgeCode: 'MH-RES-201', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t202', name: 'Kenji Takahashi', email: 'kenji.t@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-202', unitNumber: '202', phone: '+1 (415) 643-5528', badgeCode: 'MH-RES-202', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t204', name: 'Amara Osei', email: 'amara.o@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-204', unitNumber: '204', phone: '+1 (415) 912-3044', badgeCode: 'MH-RES-204', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t301', name: 'Julian Mercer', email: 'julian.m@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-301', unitNumber: '301', phone: '+1 (415) 778-1922', badgeCode: 'MH-RES-301', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t303', name: 'Nadia Kowalski', email: 'nadia.k@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-303', unitNumber: '303', phone: '+1 (415) 488-9031', badgeCode: 'MH-RES-303', securityVerified: false, status: 'Active', createdAt: now },
    { id: 'usr-t401', name: 'Dr. Arthur Pendelton', email: 'pendelton@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-401', unitNumber: '401', phone: '+1 (415) 901-6640', badgeCode: 'MH-RES-401', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t402', name: 'Soren & Maya Albers', email: 'albers@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-402', unitNumber: '402', phone: '+1 (415) 334-1290', badgeCode: 'MH-RES-402', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t403', name: 'Priya Nair', email: 'priya.n@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-403', unitNumber: '403', phone: '+1 (415) 552-8391', badgeCode: 'MH-RES-403', securityVerified: true, status: 'Active', createdAt: now },
    { id: 'usr-t404', name: 'Victor Laurent', email: 'laurent@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitId: 'unit-404', unitNumber: '404', phone: '+1 (415) 712-4099', badgeCode: 'MH-RES-404', securityVerified: true, status: 'Active', createdAt: now },
  ];

  const leases: Lease[] = [
    { id: 'lease-101', unitId: 'unit-101', unitNumber: '101', floor: 1, tenantUserId: 'usr-t101', tenantName: 'Atelier Press Studio', tenantEmail: 'atelier@meridianhouse.io', tenantPhone: '+1 (415) 519-8820', startDate: '2025-03-01', endDate: '2027-02-28', monthlyRent: 3400, depositAmount: 6800, status: 'Active' },
    { id: 'lease-102', unitId: 'unit-102', unitNumber: '102', floor: 1, tenantUserId: 'usr-t102', tenantName: 'Hannah Lindqvist', tenantEmail: 'hannah.l@meridianhouse.io', tenantPhone: '+1 (415) 704-2910', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 2250, depositAmount: 2250, status: 'Expiring Soon' },
    { id: 'lease-103', unitId: 'unit-103', unitNumber: '103', floor: 1, tenantUserId: 'usr-t103', tenantName: 'Noah Patel', tenantEmail: 'noah.p@meridianhouse.io', tenantPhone: '+1 (415) 392-7741', startDate: '2026-06-01', endDate: '2027-05-31', monthlyRent: 1850, depositAmount: 1850, status: 'Active' },
    { id: 'lease-201', unitId: 'unit-201', unitNumber: '201', floor: 2, tenantUserId: 'usr-t201', tenantName: 'Sophia & Liam Brooks', tenantEmail: 'brooks@meridianhouse.io', tenantPhone: '+1 (415) 821-0094', startDate: '2025-09-01', endDate: '2027-08-31', monthlyRent: 3150, depositAmount: 3150, status: 'Active' },
    { id: 'lease-202', unitId: 'unit-202', unitNumber: '202', floor: 2, tenantUserId: 'usr-t202', tenantName: 'Kenji Takahashi', tenantEmail: 'kenji.t@meridianhouse.io', tenantPhone: '+1 (415) 643-5528', startDate: '2026-02-01', endDate: '2027-01-31', monthlyRent: 2350, depositAmount: 2350, status: 'Active' },
    { id: 'lease-204', unitId: 'unit-204', unitNumber: '204', floor: 2, tenantUserId: 'usr-t204', tenantName: 'Amara Osei', tenantEmail: 'amara.o@meridianhouse.io', tenantPhone: '+1 (415) 912-3044', startDate: '2025-12-01', endDate: '2026-11-30', monthlyRent: 3200, depositAmount: 3200, status: 'Expiring Soon' },
    { id: 'lease-301', unitId: 'unit-301', unitNumber: '301', floor: 3, tenantUserId: 'usr-t301', tenantName: 'Julian Mercer', tenantEmail: 'julian.m@meridianhouse.io', tenantPhone: '+1 (415) 778-1922', startDate: '2026-04-01', endDate: '2027-03-31', monthlyRent: 3250, depositAmount: 3250, status: 'Active' },
    { id: 'lease-302', unitId: 'unit-302', unitNumber: '302', floor: 3, tenantUserId: 'usr-t302', tenantName: 'Clara Morales', tenantEmail: 'tenant302@meridianhouse.io', tenantPhone: '+1 (415) 602-4419', startDate: '2026-01-15', endDate: '2027-01-14', monthlyRent: 2450, depositAmount: 2450, status: 'Active' },
    { id: 'lease-303', unitId: 'unit-303', unitNumber: '303', floor: 3, tenantUserId: 'usr-t303', tenantName: 'Nadia Kowalski', tenantEmail: 'nadia.k@meridianhouse.io', tenantPhone: '+1 (415) 488-9031', startDate: '2026-07-01', endDate: '2027-06-30', monthlyRent: 2450, depositAmount: 2450, status: 'Active' },
    { id: 'lease-401', unitId: 'unit-401', unitNumber: '401', floor: 4, tenantUserId: 'usr-t401', tenantName: 'Dr. Arthur Pendelton', tenantEmail: 'pendelton@meridianhouse.io', tenantPhone: '+1 (415) 901-6640', startDate: '2025-05-01', endDate: '2027-04-30', monthlyRent: 4600, depositAmount: 4600, status: 'Active' },
    { id: 'lease-402', unitId: 'unit-402', unitNumber: '402', floor: 4, tenantUserId: 'usr-t402', tenantName: 'Soren & Maya Albers', tenantEmail: 'albers@meridianhouse.io', tenantPhone: '+1 (415) 334-1290', startDate: '2026-03-01', endDate: '2027-02-28', monthlyRent: 3450, depositAmount: 3450, status: 'Active' },
    { id: 'lease-403', unitId: 'unit-403', unitNumber: '403', floor: 4, tenantUserId: 'usr-t403', tenantName: 'Priya Nair', tenantEmail: 'priya.n@meridianhouse.io', tenantPhone: '+1 (415) 552-8391', startDate: '2026-05-01', endDate: '2027-04-30', monthlyRent: 3450, depositAmount: 3450, status: 'Active' },
    { id: 'lease-404', unitId: 'unit-404', unitNumber: '404', floor: 4, tenantUserId: 'usr-t404', tenantName: 'Victor Laurent', tenantEmail: 'laurent@meridianhouse.io', tenantPhone: '+1 (415) 712-4099', startDate: '2025-11-01', endDate: '2027-10-31', monthlyRent: 4800, depositAmount: 4800, status: 'Active' },
  ];

  const payments: RentPayment[] = [
    { id: 'pay-01', leaseId: 'lease-101', unitId: 'unit-101', unitNumber: '101', tenantUserId: 'usr-t101', tenantName: 'Atelier Press Studio', amount: 3400, dueDate: '2026-11-01', paidAt: '2026-11-01T10:15:00Z', method: 'ACH Transfer', referenceCode: 'INV-202611-101', status: 'Paid', notes: 'Cleared on due date' },
    { id: 'pay-02', leaseId: 'lease-201', unitId: 'unit-201', unitNumber: '201', tenantUserId: 'usr-t201', tenantName: 'Sophia & Liam Brooks', amount: 3150, dueDate: '2026-11-01', paidAt: '2026-11-02T14:20:00Z', method: 'Wire Transfer', referenceCode: 'INV-202611-201', status: 'Paid', notes: 'Confirmed by Finance' },
    { id: 'pay-03', leaseId: 'lease-302', unitId: 'unit-302', unitNumber: '302', tenantUserId: 'usr-t302', tenantName: 'Clara Morales', amount: 2450, dueDate: '2026-11-01', paidAt: '2026-11-01T08:40:00Z', method: 'Auto-Debit', referenceCode: 'INV-202611-302', status: 'Paid', notes: 'November rent settled' },
    { id: 'pay-04', leaseId: 'lease-401', unitId: 'unit-401', unitNumber: '401', tenantUserId: 'usr-t401', tenantName: 'Dr. Arthur Pendelton', amount: 4600, dueDate: '2026-11-01', paidAt: '2026-11-03T11:05:00Z', method: 'ACH Transfer', referenceCode: 'INV-202611-401', status: 'Paid', notes: 'Includes penthouse amenity fee' },
    { id: 'pay-05', leaseId: 'lease-404', unitId: 'unit-404', unitNumber: '404', tenantUserId: 'usr-t404', tenantName: 'Victor Laurent', amount: 4800, dueDate: '2026-11-01', paidAt: '2026-11-01T09:12:00Z', method: 'Wire Transfer', referenceCode: 'INV-202611-404', status: 'Paid', notes: '' },
    { id: 'pay-06', leaseId: 'lease-103', unitId: 'unit-103', unitNumber: '103', tenantUserId: 'usr-t103', tenantName: 'Noah Patel', amount: 1850, dueDate: '2026-11-05', paidAt: null, method: null, referenceCode: 'INV-202611-103', status: 'Overdue', notes: 'Reminder sent on Nov 8' },
    { id: 'pay-07', leaseId: 'lease-303', unitId: 'unit-303', unitNumber: '303', tenantUserId: 'usr-t303', tenantName: 'Nadia Kowalski', amount: 2450, dueDate: '2026-11-10', paidAt: null, method: null, referenceCode: 'INV-202611-303', status: 'Overdue', notes: 'Pending bank clearance follow-up' },
    { id: 'pay-08', leaseId: 'lease-102', unitId: 'unit-102', unitNumber: '102', tenantUserId: 'usr-t102', tenantName: 'Hannah Lindqvist', amount: 2250, dueDate: '2026-11-15', paidAt: null, method: null, referenceCode: 'INV-202611-102', status: 'Upcoming', notes: 'Scheduled mid-month cycle' },
    { id: 'pay-09', leaseId: 'lease-202', unitId: 'unit-202', unitNumber: '202', tenantUserId: 'usr-t202', tenantName: 'Kenji Takahashi', amount: 2350, dueDate: '2026-11-15', paidAt: null, method: null, referenceCode: 'INV-202611-202', status: 'Upcoming', notes: '' },
    { id: 'pay-10', leaseId: 'lease-204', unitId: 'unit-204', unitNumber: '204', tenantUserId: 'usr-t204', tenantName: 'Amara Osei', amount: 3200, dueDate: '2026-11-18', paidAt: null, method: null, referenceCode: 'INV-202611-204', status: 'Upcoming', notes: 'Final month of current term' },
    { id: 'pay-11', leaseId: 'lease-301', unitId: 'unit-301', unitNumber: '301', tenantUserId: 'usr-t301', tenantName: 'Julian Mercer', amount: 3250, dueDate: '2026-11-20', paidAt: null, method: null, referenceCode: 'INV-202611-301', status: 'Upcoming', notes: '' },
    { id: 'pay-12', leaseId: 'lease-302', unitId: 'unit-302', unitNumber: '302', tenantUserId: 'usr-t302', tenantName: 'Clara Morales', amount: 2450, dueDate: '2026-12-01', paidAt: null, method: null, referenceCode: 'INV-202612-302', status: 'Upcoming', notes: 'December scheduled rent' },
  ];

  const documents: TenantDocument[] = [
    {
      id: 'doc-01',
      tenantUserId: 'usr-t302',
      tenantName: 'Clara Morales',
      unitId: 'unit-302',
      unitNumber: '302',
      title: 'Unit 302 Standard Residential Lease (2026–2027)',
      category: 'Lease Agreement',
      fileName: 'Meridian_Lease_Unit302_2026.txt',
      mimeType: 'text/plain',
      fileData: encodeTextDoc('MERIDIAN HOUSE RESIDENTIAL LEASE AGREEMENT\nUnit: 302 (Floor 3, 72 sqm)\nTenant: Clara Morales\nTerm: 2026-01-15 to 2027-01-14\nAccess Badge: MH-RES-302\nSigned digitally by Landlord Elena Vance & Tenant Clara Morales.'),
      verifiedBySecurity: true,
      uploadedAt: '2026-01-15T10:00:00Z',
    },
    {
      id: 'doc-02',
      tenantUserId: 'usr-t302',
      tenantName: 'Clara Morales',
      unitId: 'unit-302',
      unitNumber: '302',
      title: 'Government Photo ID & Background Clearance',
      category: 'ID Verification',
      fileName: 'Clara_Morales_ID_Clearance.txt',
      mimeType: 'text/plain',
      fileData: encodeTextDoc('SECURITY CLEARANCE RECORD\nResident: Clara Morales\nUnit: 302\nBadge Issued: MH-RES-302\nVerification Status: Verified by David Okonkwo (Head of Security)\nDate: 2026-01-14'),
      verifiedBySecurity: true,
      uploadedAt: '2026-01-14T16:25:00Z',
    },
    {
      id: 'doc-03',
      tenantUserId: 'usr-t101',
      tenantName: 'Atelier Press Studio',
      unitId: 'unit-101',
      unitNumber: '101',
      title: 'Ground Commercial Retail Lease — Atelier Press',
      category: 'Lease Agreement',
      fileName: 'Commercial_Lease_Unit101.txt',
      mimeType: 'text/plain',
      fileData: encodeTextDoc('MERIDIAN HOUSE COMMERCIAL LEASE\nUnit: 101 (Ground / Floor 1 Street Suite, 95 sqm)\nLessee: Atelier Press Studio\nTerm: 2025-03-01 to 2027-02-28'),
      verifiedBySecurity: true,
      uploadedAt: '2025-03-01T09:00:00Z',
    },
    {
      id: 'doc-04',
      tenantUserId: 'usr-t103',
      tenantName: 'Noah Patel',
      unitId: 'unit-103',
      unitNumber: '103',
      title: 'Move-In Inspection Checklist — Unit 103',
      category: 'Inspection',
      fileName: 'Unit103_MoveIn_Checklist.txt',
      mimeType: 'text/plain',
      fileData: encodeTextDoc('MOVE-IN CONDITION REPORT\nUnit: 103 (Studio, Floor 1)\nTenant: Noah Patel\nCondition: Good. Pending final ID badge verification at Security Desk.'),
      verifiedBySecurity: false,
      uploadedAt: '2026-06-01T12:10:00Z',
    },
    {
      id: 'doc-05',
      tenantUserId: 'usr-t401',
      tenantName: 'Dr. Arthur Pendelton',
      unitId: 'unit-401',
      unitNumber: '401',
      title: 'Penthouse 401 Lease & Private Terrace Addendum',
      category: 'Lease Agreement',
      fileName: 'Penthouse_401_Lease_Addendum.txt',
      mimeType: 'text/plain',
      fileData: encodeTextDoc('MERIDIAN HOUSE PENTHOUSE LEASE\nUnit: 401 (145 sqm)\nTenant: Dr. Arthur Pendelton\nIncludes private terrace & 2 reserved garage bays.'),
      verifiedBySecurity: true,
      uploadedAt: '2025-05-01T11:30:00Z',
    },
  ];

  const maintenance: MaintenanceRequest[] = [
    { id: 'mnt-101', unitId: 'unit-302', unitNumber: '302', floor: 3, zoneLabel: 'Unit 302 · Kitchen Sink Line', pinX: 72, pinY: 28, reportedByUserId: 'usr-t302', reportedByName: 'Clara Morales', assignedToUserId: 'usr-maint', assignedToName: 'Carlos Rivera', category: 'Plumbing', priority: 'High', title: 'Under-sink shutoff valve slow drip', description: 'Noticed steady moisture beneath the kitchen cold-water valve near the east wall riser.', status: 'In Progress', resolutionNotes: 'Replacement brass cartridge ordered; technician scheduled today 14:00.', createdAt: '2026-11-11T16:40:00Z', updatedAt: '2026-11-12T09:15:00Z' },
    { id: 'mnt-102', unitId: 'unit-203', unitNumber: '203', floor: 2, zoneLabel: 'Unit 203 · Main HVAC Diffuser', pinX: 24, pinY: 68, reportedByUserId: 'usr-landlord', reportedByName: 'Elena Vance', assignedToUserId: 'usr-maint', assignedToName: 'Carlos Rivera', category: 'HVAC', priority: 'Urgent', title: 'Heat pump compressor cycling fault', description: 'Unit 203 is offline for turnover inspection; condenser throws E4 airflow sensor alert.', status: 'Open', resolutionNotes: '', createdAt: '2026-11-12T11:20:00Z', updatedAt: '2026-11-12T11:20:00Z' },
    { id: 'mnt-103', unitId: 'unit-101', unitNumber: '101', floor: 1, zoneLabel: 'Unit 101 · Storefront Track Lighting', pinX: 22, pinY: 26, reportedByUserId: 'usr-t101', reportedByName: 'Atelier Press Studio', assignedToUserId: 'usr-maint', assignedToName: 'Carlos Rivera', category: 'Electrical', priority: 'Medium', title: 'North gallery track circuit breaker tripping', description: 'Circuit B2 trips intermittently when all display spotlights are active.', status: 'Open', resolutionNotes: '', createdAt: '2026-11-12T15:05:00Z', updatedAt: '2026-11-12T15:05:00Z' },
    { id: 'mnt-104', unitId: 'unit-000', unitNumber: 'COMMON', floor: 0, zoneLabel: 'Ground Lobby · East Keycard Reader', pinX: 66, pinY: 44, reportedByUserId: 'usr-security', reportedByName: 'David Okonkwo', assignedToUserId: 'usr-maint', assignedToName: 'Carlos Rivera', category: 'Access/Lock', priority: 'High', title: 'Side service vestibule RFID reader delay', description: 'Badge scans take 3–4 seconds before magnetic strike releases.', status: 'In Progress', resolutionNotes: 'Firmware diagnostic queued with security team.', createdAt: '2026-11-10T08:30:00Z', updatedAt: '2026-11-12T10:00:00Z' },
    { id: 'mnt-105', unitId: 'unit-401', unitNumber: '401', floor: 4, zoneLabel: 'Unit 401 · Terrace Sliding Seal', pinX: 30, pinY: 24, reportedByUserId: 'usr-t401', reportedByName: 'Dr. Arthur Pendelton', assignedToUserId: 'usr-maint', assignedToName: 'Carlos Rivera', category: 'Structural', priority: 'Low', title: 'Balcony weatherstrip gasket replacement', description: 'Minor draft along the west terrace glass sliding track.', status: 'Resolved', resolutionNotes: 'Replaced silicone compression gasket and tested water seal.', createdAt: '2026-11-04T13:10:00Z', updatedAt: '2026-11-06T17:00:00Z' },
    { id: 'mnt-106', unitId: 'unit-301', unitNumber: '301', floor: 3, zoneLabel: 'Unit 301 · Bathroom Exhaust Fan', pinX: 28, pinY: 32, reportedByUserId: 'usr-t301', reportedByName: 'Julian Mercer', assignedToUserId: null, assignedToName: null, category: 'Electrical', priority: 'Medium', title: 'Exhaust fan bearing rattle', description: 'Noticeable hum after 5 minutes of operation in primary bath.', status: 'Open', resolutionNotes: '', createdAt: '2026-11-13T07:50:00Z', updatedAt: '2026-11-13T07:50:00Z' },
  ];

  const securityLogs: SecurityLog[] = [
    { id: 'sec-01', logType: 'Visitor', unitId: 'unit-302', unitNumber: '302', subjectName: 'Lucas Bennett (Interior Designer)', badgeOrId: 'VIS-048', status: 'Checked In', notes: 'Authorized by Clara Morales until 18:00', loggedByUserId: 'usr-security', loggedByName: 'David Okonkwo', timestamp: '2026-11-13T09:42:00Z' },
    { id: 'sec-02', logType: 'Delivery', unitId: 'unit-101', unitNumber: '101', subjectName: 'Pacific Paper Freight', badgeOrId: 'DEL-119', status: 'Checked Out', notes: 'Loading bay delivery completed; signed by Atelier Press', loggedByUserId: 'usr-security', loggedByName: 'David Okonkwo', timestamp: '2026-11-13T08:15:00Z' },
    { id: 'sec-03', logType: 'Incident', unitId: 'unit-000', unitNumber: 'COMMON', subjectName: 'Garage Gate Sensor Obstruction', badgeOrId: 'INC-209', status: 'Flagged', notes: 'South entry loop stayed open 40s; maintenance notified via secure channel.', loggedByUserId: 'usr-security', loggedByName: 'David Okonkwo', timestamp: '2026-11-12T22:10:00Z' },
    { id: 'sec-04', logType: 'Patrol', unitId: 'unit-000', unitNumber: 'COMMON', subjectName: 'Night Perimeter & Rooftop Check', badgeOrId: 'PTR-400', status: 'Resolved', notes: 'All 4 stairwell fire doors and roof hatch locked normally.', loggedByUserId: 'usr-security', loggedByName: 'David Okonkwo', timestamp: '2026-11-13T03:00:00Z' },
  ];

  const channels: ChatChannel[] = [
    { id: 'ch-tenant-support', name: 'Landlord & Management Desk', description: 'Direct channel between tenants and property management for leases, documents, and notices.', channelType: 'tenant_support', allowedRoles: ['landlord', 'tenant'], unitId: null },
    { id: 'ch-maintenance', name: 'Maintenance Dispatch', description: 'Direct repair coordination tied to floorplan maintenance pins.', channelType: 'maintenance_direct', allowedRoles: ['landlord', 'maintenance', 'tenant', 'security'], unitId: null },
    { id: 'ch-finance', name: 'Finance & Billing Support', description: 'Rent receipts, ACH verification, and upcoming invoice questions.', channelType: 'finance_billing', allowedRoles: ['landlord', 'finance', 'tenant'], unitId: null },
    { id: 'ch-security', name: 'Front Desk & Security', description: 'Visitor pre-registration, badge activation, and building access alerts.', channelType: 'security_desk', allowedRoles: ['landlord', 'security', 'tenant'], unitId: null },
    { id: 'ch-staff-secure', name: 'Staff Secure Operations', description: 'Internal encrypted staff-only coordination across Landlord, Finance, Security, and Maintenance.', channelType: 'staff_secure', allowedRoles: ['landlord', 'finance', 'security', 'maintenance'], unitId: null },
  ];

  const messages: ChatMessage[] = [
    { id: 'msg-01', channelId: 'ch-tenant-support', senderUserId: 'usr-landlord', senderName: 'Elena Vance', senderRole: 'landlord', body: 'Welcome to the Meridian House portal. Let us know here if you need lease copies or renewal terms.', createdAt: '2026-11-12T09:00:00Z' },
    { id: 'msg-02', channelId: 'ch-tenant-support', senderUserId: 'usr-t302', senderName: 'Clara Morales', senderRole: 'tenant', body: 'Thank you Elena! I uploaded my updated renter insurance certificate to the document vault.', createdAt: '2026-11-12T09:24:00Z' },
    { id: 'msg-03', channelId: 'ch-maintenance', senderUserId: 'usr-t302', senderName: 'Clara Morales', senderRole: 'tenant', body: 'I pinned the kitchen sink valve drip on the 3rd floor plan (Unit 302). No rush, just wanted to catch it early.', createdAt: '2026-11-12T09:30:00Z' },
    { id: 'msg-04', channelId: 'ch-maintenance', senderUserId: 'usr-maint', senderName: 'Carlos Rivera', senderRole: 'maintenance', body: 'Got your pin in Unit 302. I have the brass valve cartridge on hand and will stop by at 14:00 today.', createdAt: '2026-11-12T09:42:00Z' },
    { id: 'msg-05', channelId: 'ch-staff-secure', senderUserId: 'usr-security', senderName: 'David Okonkwo', senderRole: 'security', body: 'Heads up team: Unit 103 (Noah Patel) and Unit 303 (Nadia Kowalski) still need secondary photo ID verification on file.', createdAt: '2026-11-13T07:35:00Z' },
    { id: 'msg-06', channelId: 'ch-staff-secure', senderUserId: 'usr-finance', senderName: 'Marcus Chen', senderRole: 'finance', body: 'Noted David. Both units are also flagged in the November overdue rent ledger—sending polite reminders this morning.', createdAt: '2026-11-13T07:45:00Z' },
  ];

  return {
    units,
    users,
    sessions: {},
    leases,
    payments,
    documents,
    maintenance,
    securityLogs,
    channels,
    messages,
    currencySettings: {
      currency: 'IDR',
      exchangeRates: { IDR: 16000, USD: 1, SGD: 1.35, EUR: 0.92 },
      showDecimals: false,
    },
  };
}

function loadState(): StaticDbState {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as StaticDbState;
    }
  } catch {
    // ignore corrupted storage
  }
  const initial = createInitialState();
  saveState(initial);
  return initial;
}

function saveState(state: StaticDbState) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function stripPassword(user: StoredUser): User {
  const { password: _password, ...clean } = user;
  return clean;
}

function getAuthedUser(state: StaticDbState, token: string | null): StoredUser {
  if (!token) throw new Error('Authentication required.');
  const userId = state.sessions[token];
  const found = state.users.find((u) => u.id === userId && u.status === 'Active');
  if (!found) throw new Error('Authentication required.');
  return found;
}

function assertRole(user: StoredUser, ...roles: UserRole[]) {
  if (!roles.includes(user.role)) {
    throw new Error('Insufficient role permissions for this action.');
  }
}

function enrichedUnits(state: StaticDbState): BuildingUnit[] {
  return state.units.map((u) => {
    const lease = state.leases.find((l) => l.unitId === u.id && l.status !== 'Ended');
    const tenant = lease ? state.users.find((usr) => usr.id === lease.tenantUserId) : null;
    return {
      ...u,
      tenantUserId: lease?.tenantUserId ?? null,
      tenantName: tenant?.name ?? null,
      leaseEndDate: lease?.endDate ?? null,
    };
  });
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function localApiFetch<T>(
  url: string,
  options: RequestInit = {},
  token: string | null = null
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(String(options.body)) : {};
  const pathname = url.split('?')[0];
  const state = loadState();

  if (pathname === '/api/health' && method === 'GET') {
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/demo-accounts' && method === 'GET') {
    const accounts: DemoAccount[] = [
      { id: 'usr-landlord', name: 'Elena Vance', email: 'landlord@meridianhouse.io', password: 'meridian2026', role: 'landlord', unitNumber: null, subtitle: 'Building Owner · Full Portfolio & User Admin' },
      { id: 'usr-finance', name: 'Marcus Chen', email: 'finance@meridianhouse.io', password: 'meridian2026', role: 'finance', unitNumber: null, subtitle: 'Finance Officer · Rent Ledger & Receipts' },
      { id: 'usr-security', name: 'David Okonkwo', email: 'security@meridianhouse.io', password: 'meridian2026', role: 'security', unitNumber: null, subtitle: 'Head of Security · Badges, Visitors & Incidents' },
      { id: 'usr-maint', name: 'Carlos Rivera', email: 'maintenance@meridianhouse.io', password: 'meridian2026', role: 'maintenance', unitNumber: null, subtitle: 'Lead Engineer · Floorplan Tickets & Repairs' },
      { id: 'usr-t302', name: 'Clara Morales', email: 'tenant302@meridianhouse.io', password: 'meridian2026', role: 'tenant', unitNumber: '302', subtitle: 'Resident Unit 302 · Floorplan Mapping & Chat' },
    ];
    return { accounts } as T;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const found = state.users.find((u) => u.email.toLowerCase() === email && u.password === password);
    if (!found) throw new Error('Invalid email or password.');
    if (found.status !== 'Active') throw new Error('This account has been deactivated by the landlord.');
    const newToken = randomId('tok');
    state.sessions[newToken] = found.id;
    saveState(state);
    return { token: newToken, user: stripPassword(found) } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (token) {
      delete state.sessions[token];
      saveState(state);
    }
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = getAuthedUser(state, token);
    return { user: stripPassword(user) } as T;
  }

  if (pathname === '/api/settings' && method === 'GET') {
    return { settings: state.currencySettings } as T;
  }

  if (pathname === '/api/settings' && method === 'PATCH') {
    getAuthedUser(state, token);
    const nextSettings: CurrencySettings = {
      currency: ['IDR', 'USD', 'SGD', 'EUR'].includes(body.currency)
        ? body.currency
        : state.currencySettings.currency,
      exchangeRates: {
        IDR: Number(body.exchangeRates?.IDR) > 0 ? Number(body.exchangeRates.IDR) : state.currencySettings.exchangeRates.IDR,
        USD: 1,
        SGD: Number(body.exchangeRates?.SGD) > 0 ? Number(body.exchangeRates.SGD) : state.currencySettings.exchangeRates.SGD,
        EUR: Number(body.exchangeRates?.EUR) > 0 ? Number(body.exchangeRates.EUR) : state.currencySettings.exchangeRates.EUR,
      },
      showDecimals: typeof body.showDecimals === 'boolean' ? body.showDecimals : state.currencySettings.showDecimals,
    };
    state.currencySettings = nextSettings;
    saveState(state);
    emitLocalEvent('settings:updated', nextSettings);
    return { settings: nextSettings } as T;
  }

  // All routes below require authentication
  const currentUser = getAuthedUser(state, token);

  if (pathname === '/api/dashboard' && method === 'GET') {
    const units = enrichedUnits(state).filter((u) => u.floor > 0);
    const activeUnits = units.filter((u) => u.occupancyStatus === 'Occupied').length;
    const monthlyCollected = state.payments.filter((p) => p.status === 'Paid').reduce((a, p) => a + p.amount, 0);
    const upcomingDue = state.payments.filter((p) => p.status === 'Upcoming').reduce((a, p) => a + p.amount, 0);
    const overdueAmount = state.payments.filter((p) => p.status === 'Overdue').reduce((a, p) => a + p.amount, 0);
    const openMaint = state.maintenance.filter((m) => m.status !== 'Resolved');
    const verifiedTenants = state.users.filter((u) => u.role === 'tenant' && u.securityVerified).length;

    const upcomingPayments =
      currentUser.role === 'tenant'
        ? state.payments.filter((p) => p.tenantUserId === currentUser.id)
        : state.payments.filter((p) => p.status !== 'Paid').slice(0, 8);
    const openTickets =
      currentUser.role === 'tenant'
        ? openMaint.filter((m) => m.unitId === currentUser.unitId || m.floor === 0)
        : openMaint.slice(0, 8);

    return {
      metrics: {
        activeUnits,
        totalUnits: units.length,
        monthlyCollected,
        upcomingDue,
        overdueAmount,
        openMaintenance: openMaint.length,
        urgentMaintenance: openMaint.filter((m) => m.priority === 'Urgent' || m.priority === 'High').length,
        verifiedTenants,
      },
      upcomingPayments,
      openTickets,
      units,
    } as T;
  }

  if (pathname === '/api/units' && method === 'GET') {
    return { units: enrichedUnits(state) } as T;
  }

  if (pathname.startsWith('/api/units/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord', 'maintenance');
    const id = pathname.replace('/api/units/', '');
    const unit = state.units.find((u) => u.id === id);
    if (!unit) throw new Error('Unit not found.');
    if (body.occupancyStatus) unit.occupancyStatus = body.occupancyStatus;
    if (typeof body.monthlyRent === 'number') unit.monthlyRent = body.monthlyRent;
    saveState(state);
    return { ok: true } as T;
  }

  if (pathname === '/api/users' && method === 'GET') {
    if (currentUser.role === 'tenant') {
      return { users: [stripPassword(currentUser)] } as T;
    }
    return { users: state.users.map(stripPassword) } as T;
  }

  if (pathname === '/api/users' && method === 'POST') {
    assertRole(currentUser, 'landlord');
    const { name, email, password, role, unitId, phone, badgeCode } = body;
    if (!name || !email || !role) throw new Error('Name, email, and role are required.');
    if (state.users.some((u) => u.email.toLowerCase() === String(email).trim().toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }
    const unit = unitId ? state.units.find((u) => u.id === unitId) : null;
    const created: StoredUser = {
      id: randomId('usr'),
      name: String(name).trim(),
      email: String(email).trim(),
      password: password || 'meridian2026',
      role,
      unitId: unitId || null,
      unitNumber: unit?.unitNumber ?? null,
      phone: phone || '',
      badgeCode: badgeCode || `MH-${String(role).slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`,
      securityVerified: true,
      status: 'Active',
      createdAt: new Date().toISOString(),
    };
    state.users.push(created);
    saveState(state);
    return { user: stripPassword(created) } as T;
  }

  if (pathname.startsWith('/api/users/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord', 'security');
    const id = pathname.replace('/api/users/', '');
    const target = state.users.find((u) => u.id === id);
    if (!target) throw new Error('User not found.');
    if (currentUser.role === 'security') {
      if (typeof body.securityVerified === 'boolean') target.securityVerified = body.securityVerified;
      if (body.badgeCode !== undefined) target.badgeCode = body.badgeCode;
    } else {
      if (body.name !== undefined) target.name = body.name;
      if (body.phone !== undefined) target.phone = body.phone;
      if (body.badgeCode !== undefined) target.badgeCode = body.badgeCode;
      if (typeof body.securityVerified === 'boolean') target.securityVerified = body.securityVerified;
      if (body.role !== undefined) target.role = body.role;
      if (body.unitId !== undefined) {
        target.unitId = body.unitId;
        target.unitNumber = state.units.find((u) => u.id === body.unitId)?.unitNumber ?? null;
      }
      if (body.status !== undefined) target.status = body.status;
    }
    saveState(state);
    return { user: stripPassword(target) } as T;
  }

  if (pathname === '/api/leases' && method === 'GET') {
    const leases =
      currentUser.role === 'tenant'
        ? state.leases.filter((l) => l.tenantUserId === currentUser.id)
        : state.leases;
    return { leases } as T;
  }

  if (pathname === '/api/leases' && method === 'POST') {
    assertRole(currentUser, 'landlord');
    const { unitId, tenantUserId, startDate, endDate, monthlyRent, depositAmount, status } = body;
    const unit = state.units.find((u) => u.id === unitId);
    const tenant = state.users.find((u) => u.id === tenantUserId);
    if (!unit || !tenant || !startDate || !endDate || !monthlyRent) {
      throw new Error('Missing required lease fields.');
    }
    const id = randomId('lease');
    state.leases.push({
      id,
      unitId,
      unitNumber: unit.unitNumber,
      floor: unit.floor,
      tenantUserId,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      tenantPhone: tenant.phone,
      startDate,
      endDate,
      monthlyRent: Number(monthlyRent),
      depositAmount: Number(depositAmount || monthlyRent),
      status: status || 'Active',
    });
    unit.occupancyStatus = 'Occupied';
    unit.monthlyRent = Number(monthlyRent);
    tenant.unitId = unitId;
    tenant.unitNumber = unit.unitNumber;
    saveState(state);
    return { id } as T;
  }

  if (pathname.startsWith('/api/leases/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord');
    const id = pathname.replace('/api/leases/', '');
    const lease = state.leases.find((l) => l.id === id);
    if (!lease) throw new Error('Lease not found.');
    if (body.endDate !== undefined) lease.endDate = body.endDate;
    if (typeof body.monthlyRent === 'number') lease.monthlyRent = body.monthlyRent;
    if (body.status !== undefined) lease.status = body.status;
    saveState(state);
    return { ok: true } as T;
  }

  if (pathname === '/api/payments' && method === 'GET') {
    const payments =
      currentUser.role === 'tenant'
        ? state.payments.filter((p) => p.tenantUserId === currentUser.id)
        : state.payments;
    return { payments } as T;
  }

  if (pathname === '/api/payments' && method === 'POST') {
    assertRole(currentUser, 'landlord', 'finance');
    const lease = state.leases.find((l) => l.id === body.leaseId);
    if (!lease) throw new Error('Lease not found.');
    const id = randomId('pay');
    const status = body.status || 'Upcoming';
    state.payments.unshift({
      id,
      leaseId: lease.id,
      unitId: lease.unitId,
      unitNumber: lease.unitNumber,
      tenantUserId: lease.tenantUserId,
      tenantName: lease.tenantName,
      amount: Number(body.amount || lease.monthlyRent),
      dueDate: body.dueDate || new Date().toISOString().slice(0, 10),
      paidAt: status === 'Paid' ? new Date().toISOString() : null,
      method: body.method || (status === 'Paid' ? 'ACH Transfer' : null),
      referenceCode: `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${lease.unitNumber}`,
      status,
      notes: body.notes || '',
    });
    saveState(state);
    emitLocalEvent('payment:updated', { id });
    return { id } as T;
  }

  if (pathname.startsWith('/api/payments/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord', 'finance');
    const id = pathname.replace('/api/payments/', '');
    const payment = state.payments.find((p) => p.id === id);
    if (!payment) throw new Error('Payment not found.');
    const nextStatus = body.status ?? payment.status;
    payment.status = nextStatus;
    payment.paidAt = nextStatus === 'Paid' ? payment.paidAt || new Date().toISOString() : null;
    payment.method = body.method ?? payment.method ?? (nextStatus === 'Paid' ? 'ACH Transfer' : null);
    if (body.notes !== undefined) payment.notes = body.notes;
    saveState(state);
    emitLocalEvent('payment:updated', { id, status: nextStatus });
    return { ok: true } as T;
  }

  if (pathname === '/api/documents' && method === 'GET') {
    const docs =
      currentUser.role === 'tenant'
        ? state.documents.filter((d) => d.tenantUserId === currentUser.id)
        : state.documents;
    return { documents: docs } as T;
  }

  if (pathname === '/api/documents' && method === 'POST') {
    const targetUserId = currentUser.role === 'tenant' ? currentUser.id : body.tenantUserId;
    const targetUnitId = currentUser.role === 'tenant' ? currentUser.unitId : body.unitId;
    if (!targetUserId || !targetUnitId || !body.title || !body.fileName || !body.fileData) {
      throw new Error('Document title, tenant, unit, and file payload are required.');
    }
    const targetUser = state.users.find((u) => u.id === targetUserId);
    const targetUnit = state.units.find((u) => u.id === targetUnitId);
    const id = randomId('doc');
    state.documents.unshift({
      id,
      tenantUserId: targetUserId,
      tenantName: targetUser?.name || currentUser.name,
      unitId: targetUnitId,
      unitNumber: targetUnit?.unitNumber || currentUser.unitNumber || '000',
      title: String(body.title).trim(),
      category: body.category || 'Lease Agreement',
      fileName: String(body.fileName).trim(),
      mimeType: body.mimeType || 'text/plain',
      fileData: body.fileData,
      verifiedBySecurity: currentUser.role === 'security' || currentUser.role === 'landlord',
      uploadedAt: new Date().toISOString(),
    });
    saveState(state);
    return { id } as T;
  }

  if (pathname.startsWith('/api/documents/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord', 'security');
    const id = pathname.replace('/api/documents/', '');
    const doc = state.documents.find((d) => d.id === id);
    if (doc) {
      doc.verifiedBySecurity = Boolean(body.verifiedBySecurity);
      saveState(state);
    }
    return { ok: true } as T;
  }

  if (pathname.startsWith('/api/documents/') && method === 'DELETE') {
    const id = pathname.replace('/api/documents/', '');
    const idx = state.documents.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error('Document not found.');
    if (currentUser.role !== 'landlord' && state.documents[idx].tenantUserId !== currentUser.id) {
      throw new Error('Only the landlord or document owner can delete this file.');
    }
    state.documents.splice(idx, 1);
    saveState(state);
    return { ok: true } as T;
  }

  if (pathname === '/api/maintenance' && method === 'GET') {
    return { requests: state.maintenance } as T;
  }

  if (pathname === '/api/maintenance' && method === 'POST') {
    const { unitId, floor, zoneLabel, pinX, pinY, category, priority, title, description } = body;
    if (!unitId || floor === undefined || !title || !description) {
      throw new Error('Unit, floor, title, and description are required.');
    }
    const unit = state.units.find((u) => u.id === unitId);
    const id = randomId('mnt');
    const now = new Date().toISOString();
    state.maintenance.unshift({
      id,
      unitId,
      unitNumber: unit?.unitNumber || 'COMMON',
      floor: Number(floor),
      zoneLabel: zoneLabel || `Floor ${floor} Pin`,
      pinX: typeof pinX === 'number' ? pinX : 50,
      pinY: typeof pinY === 'number' ? pinY : 50,
      reportedByUserId: currentUser.id,
      reportedByName: currentUser.name,
      assignedToUserId: 'usr-maint',
      assignedToName: 'Carlos Rivera',
      category: category || 'Plumbing',
      priority: priority || 'Medium',
      title: String(title).trim(),
      description: String(description).trim(),
      status: 'Open',
      resolutionNotes: '',
      createdAt: now,
      updatedAt: now,
    });
    saveState(state);
    emitLocalEvent('maintenance:updated', { id, action: 'created' });
    return { id } as T;
  }

  if (pathname.startsWith('/api/maintenance/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord', 'maintenance', 'security');
    const id = pathname.replace('/api/maintenance/', '');
    const ticket = state.maintenance.find((m) => m.id === id);
    if (!ticket) throw new Error('Maintenance request not found.');
    if (body.status !== undefined) ticket.status = body.status;
    if (body.priority !== undefined) ticket.priority = body.priority;
    if (body.resolutionNotes !== undefined) ticket.resolutionNotes = body.resolutionNotes;
    if (body.assignedToUserId !== undefined) {
      ticket.assignedToUserId = body.assignedToUserId;
      ticket.assignedToName = state.users.find((u) => u.id === body.assignedToUserId)?.name ?? null;
    }
    ticket.updatedAt = new Date().toISOString();
    saveState(state);
    emitLocalEvent('maintenance:updated', { id, status: ticket.status });
    return { ok: true } as T;
  }

  if (pathname === '/api/security/logs' && method === 'GET') {
    assertRole(currentUser, 'landlord', 'security', 'maintenance');
    return { logs: state.securityLogs } as T;
  }

  if (pathname === '/api/security/logs' && method === 'POST') {
    assertRole(currentUser, 'landlord', 'security');
    if (!body.logType || !body.subjectName) throw new Error('Log type and subject name are required.');
    const unitId = body.unitId || 'unit-000';
    const unit = state.units.find((u) => u.id === unitId);
    const id = randomId('sec');
    state.securityLogs.unshift({
      id,
      logType: body.logType,
      unitId,
      unitNumber: unit?.unitNumber || 'COMMON',
      subjectName: String(body.subjectName).trim(),
      badgeOrId: body.badgeOrId || `LOG-${Math.floor(100 + Math.random() * 899)}`,
      status: body.status || (body.logType === 'Incident' ? 'Flagged' : 'Checked In'),
      notes: body.notes || '',
      loggedByUserId: currentUser.id,
      loggedByName: currentUser.name,
      timestamp: new Date().toISOString(),
    });
    saveState(state);
    emitLocalEvent('security:updated', { id });
    return { id } as T;
  }

  if (pathname.startsWith('/api/security/logs/') && method === 'PATCH') {
    assertRole(currentUser, 'landlord', 'security');
    const id = pathname.replace('/api/security/logs/', '');
    const log = state.securityLogs.find((s) => s.id === id);
    if (!log) throw new Error('Security log not found.');
    if (body.status !== undefined) log.status = body.status;
    if (body.notes !== undefined) log.notes = body.notes;
    saveState(state);
    emitLocalEvent('security:updated', { id });
    return { ok: true } as T;
  }

  if (pathname === '/api/chat/channels' && method === 'GET') {
    const channels = state.channels.filter((c) => c.allowedRoles.includes(currentUser.role));
    return { channels } as T;
  }

  const msgMatch = pathname.match(/^\/api\/chat\/channels\/([^/]+)\/messages$/);
  if (msgMatch) {
    const channelId = msgMatch[1];
    const chan = state.channels.find((c) => c.id === channelId);
    if (!chan) throw new Error('Channel not found.');
    if (!chan.allowedRoles.includes(currentUser.role)) {
      throw new Error('Access denied to this communication channel.');
    }
    if (method === 'GET') {
      return { messages: state.messages.filter((m) => m.channelId === channelId) } as T;
    }
    if (method === 'POST') {
      const text = String(body.body || '').trim();
      if (!text) throw new Error('Message body cannot be empty.');
      const message: ChatMessage = {
        id: typeof body.id === 'string' && body.id.startsWith('msg-') ? body.id : randomId('msg'),
        channelId,
        senderUserId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        body: text,
        createdAt: new Date().toISOString(),
      };
      if (!state.messages.some((m) => m.id === message.id)) {
        state.messages.push(message);
        saveState(state);
      }
      emitLocalEvent('chat:message', message);
      return { message } as T;
    }
  }

  throw new Error(`Unsupported static API route: ${method} ${pathname}`);
}
