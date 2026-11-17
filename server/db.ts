import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'meridian.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = 'meridian_house_salt_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  const candidate = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      unit_number TEXT NOT NULL UNIQUE,
      floor INTEGER NOT NULL,
      unit_type TEXT NOT NULL,
      area_sqm INTEGER NOT NULL,
      monthly_rent INTEGER NOT NULL,
      occupancy_status TEXT NOT NULL DEFAULT 'Occupied'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      unit_id TEXT,
      phone TEXT NOT NULL,
      badge_code TEXT NOT NULL,
      security_verified INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leases (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      tenant_user_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      monthly_rent INTEGER NOT NULL,
      deposit_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      tenant_user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      paid_at TEXT,
      method TEXT,
      reference_code TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      tenant_user_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_data TEXT NOT NULL,
      verified_by_security INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      floor INTEGER NOT NULL,
      zone_label TEXT NOT NULL,
      pin_x REAL NOT NULL,
      pin_y REAL NOT NULL,
      reported_by_user_id TEXT NOT NULL,
      assigned_to_user_id TEXT,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      resolution_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS security_logs (
      id TEXT PRIMARY KEY,
      log_type TEXT NOT NULL,
      unit_id TEXT,
      subject_name TEXT NOT NULL,
      badge_or_id TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      logged_by_user_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
      FOREIGN KEY (logged_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      allowed_roles TEXT NOT NULL,
      unit_id TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.prepare(
    `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`
  ).run(
    'currency_settings',
    JSON.stringify({
      currency: 'IDR',
      exchangeRates: {
        IDR: 16000,
        USD: 1,
        SGD: 1.35,
        EUR: 0.92,
      },
      showDecimals: false,
    }),
    new Date().toISOString()
  );

  const unitCount = (db.prepare('SELECT COUNT(*) as cnt FROM units').get() as { cnt: number }).cnt;
  if (unitCount > 0) {
    return;
  }

  const seed = db.transaction(() => {
    const unitsData = [
      { id: 'unit-000', num: 'COMMON', floor: 0, type: 'Commercial', area: 320, rent: 0, occ: 'Occupied' },
      { id: 'unit-101', num: '101', floor: 1, type: 'Commercial', area: 95, rent: 3400, occ: 'Occupied' },
      { id: 'unit-102', num: '102', floor: 1, type: '1BR', area: 68, rent: 2250, occ: 'Occupied' },
      { id: 'unit-103', num: '103', floor: 1, type: 'Studio', area: 48, rent: 1850, occ: 'Occupied' },
      { id: 'unit-104', num: '104', floor: 1, type: '1BR', area: 70, rent: 2300, occ: 'Vacant' },
      { id: 'unit-201', num: '201', floor: 2, type: '2BR', area: 102, rent: 3150, occ: 'Occupied' },
      { id: 'unit-202', num: '202', floor: 2, type: '1BR', area: 68, rent: 2350, occ: 'Occupied' },
      { id: 'unit-203', num: '203', floor: 2, type: '1BR', area: 68, rent: 2350, occ: 'Maintenance' },
      { id: 'unit-204', num: '204', floor: 2, type: '2BR', area: 104, rent: 3200, occ: 'Occupied' },
      { id: 'unit-301', num: '301', floor: 3, type: '2BR', area: 102, rent: 3250, occ: 'Occupied' },
      { id: 'unit-302', num: '302', floor: 3, type: '1BR', area: 72, rent: 2450, occ: 'Occupied' },
      { id: 'unit-303', num: '303', floor: 3, type: '1BR', area: 72, rent: 2450, occ: 'Occupied' },
      { id: 'unit-304', num: '304', floor: 3, type: '2BR', area: 104, rent: 3300, occ: 'Vacant' },
      { id: 'unit-401', num: '401', floor: 4, type: 'Penthouse', area: 145, rent: 4600, occ: 'Occupied' },
      { id: 'unit-402', num: '402', floor: 4, type: '2BR', area: 106, rent: 3450, occ: 'Occupied' },
      { id: 'unit-403', num: '403', floor: 4, type: '2BR', area: 106, rent: 3450, occ: 'Occupied' },
      { id: 'unit-404', num: '404', floor: 4, type: 'Penthouse', area: 150, rent: 4800, occ: 'Occupied' },
    ];

    const insertUnit = db.prepare(`
      INSERT INTO units (id, unit_number, floor, unit_type, area_sqm, monthly_rent, occupancy_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of unitsData) {
      insertUnit.run(u.id, u.num, u.floor, u.type, u.area, u.rent, u.occ);
    }

    const pwHash = hashPassword('meridian2026');
    const now = '2026-11-01T09:00:00.000Z';

    const usersData = [
      {
        id: 'usr-landlord',
        name: 'Elena Vance',
        email: 'landlord@meridianhouse.io',
        role: 'landlord',
        unitId: null,
        phone: '+1 (415) 890-1100',
        badge: 'MH-OWN-001',
        verified: 1,
      },
      {
        id: 'usr-finance',
        name: 'Marcus Chen',
        email: 'finance@meridianhouse.io',
        role: 'finance',
        unitId: null,
        phone: '+1 (415) 890-1102',
        badge: 'MH-FIN-004',
        verified: 1,
      },
      {
        id: 'usr-security',
        name: 'David Okonkwo',
        email: 'security@meridianhouse.io',
        role: 'security',
        unitId: null,
        phone: '+1 (415) 890-1109',
        badge: 'MH-SEC-002',
        verified: 1,
      },
      {
        id: 'usr-maint',
        name: 'Carlos Rivera',
        email: 'maintenance@meridianhouse.io',
        role: 'maintenance',
        unitId: null,
        phone: '+1 (415) 890-1115',
        badge: 'MH-MNT-003',
        verified: 1,
      },
      {
        id: 'usr-t302',
        name: 'Clara Morales',
        email: 'tenant302@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-302',
        phone: '+1 (415) 602-4419',
        badge: 'MH-RES-302',
        verified: 1,
      },
      {
        id: 'usr-t101',
        name: 'Atelier Press Studio',
        email: 'atelier@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-101',
        phone: '+1 (415) 519-8820',
        badge: 'MH-COM-101',
        verified: 1,
      },
      {
        id: 'usr-t102',
        name: 'Hannah Lindqvist',
        email: 'hannah.l@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-102',
        phone: '+1 (415) 704-2910',
        badge: 'MH-RES-102',
        verified: 1,
      },
      {
        id: 'usr-t103',
        name: 'Noah Patel',
        email: 'noah.p@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-103',
        phone: '+1 (415) 392-7741',
        badge: 'MH-RES-103',
        verified: 0,
      },
      {
        id: 'usr-t201',
        name: 'Sophia & Liam Brooks',
        email: 'brooks@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-201',
        phone: '+1 (415) 821-0094',
        badge: 'MH-RES-201',
        verified: 1,
      },
      {
        id: 'usr-t202',
        name: 'Kenji Takahashi',
        email: 'kenji.t@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-202',
        phone: '+1 (415) 643-5528',
        badge: 'MH-RES-202',
        verified: 1,
      },
      {
        id: 'usr-t204',
        name: 'Amara Osei',
        email: 'amara.o@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-204',
        phone: '+1 (415) 912-3044',
        badge: 'MH-RES-204',
        verified: 1,
      },
      {
        id: 'usr-t301',
        name: 'Julian Mercer',
        email: 'julian.m@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-301',
        phone: '+1 (415) 778-1922',
        badge: 'MH-RES-301',
        verified: 1,
      },
      {
        id: 'usr-t303',
        name: 'Nadia Kowalski',
        email: 'nadia.k@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-303',
        phone: '+1 (415) 488-9031',
        badge: 'MH-RES-303',
        verified: 0,
      },
      {
        id: 'usr-t401',
        name: 'Dr. Arthur Pendelton',
        email: 'pendelton@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-401',
        phone: '+1 (415) 901-6640',
        badge: 'MH-RES-401',
        verified: 1,
      },
      {
        id: 'usr-t402',
        name: 'Soren & Maya Albers',
        email: 'albers@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-402',
        phone: '+1 (415) 334-1290',
        badge: 'MH-RES-402',
        verified: 1,
      },
      {
        id: 'usr-t403',
        name: 'Priya Nair',
        email: 'priya.n@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-403',
        phone: '+1 (415) 552-8391',
        badge: 'MH-RES-403',
        verified: 1,
      },
      {
        id: 'usr-t404',
        name: 'Victor Laurent',
        email: 'laurent@meridianhouse.io',
        role: 'tenant',
        unitId: 'unit-404',
        phone: '+1 (415) 712-4099',
        badge: 'MH-RES-404',
        verified: 1,
      },
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, unit_id, phone, badge_code, security_verified, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)
    `);
    for (const u of usersData) {
      insertUser.run(u.id, u.name, u.email, pwHash, u.role, u.unitId, u.phone, u.badge, u.verified, now);
    }

    const leasesData = [
      { id: 'lease-101', unitId: 'unit-101', tenantId: 'usr-t101', start: '2025-03-01', end: '2027-02-28', rent: 3400, dep: 6800, status: 'Active' },
      { id: 'lease-102', unitId: 'unit-102', tenantId: 'usr-t102', start: '2026-01-01', end: '2026-12-31', rent: 2250, dep: 2250, status: 'Expiring Soon' },
      { id: 'lease-103', unitId: 'unit-103', tenantId: 'usr-t103', start: '2026-06-01', end: '2027-05-31', rent: 1850, dep: 1850, status: 'Active' },
      { id: 'lease-201', unitId: 'unit-201', tenantId: 'usr-t201', start: '2025-09-01', end: '2027-08-31', rent: 3150, dep: 3150, status: 'Active' },
      { id: 'lease-202', unitId: 'unit-202', tenantId: 'usr-t202', start: '2026-02-01', end: '2027-01-31', rent: 2350, dep: 2350, status: 'Active' },
      { id: 'lease-204', unitId: 'unit-204', tenantId: 'usr-t204', start: '2025-12-01', end: '2026-11-30', rent: 3200, dep: 3200, status: 'Expiring Soon' },
      { id: 'lease-301', unitId: 'unit-301', tenantId: 'usr-t301', start: '2026-04-01', end: '2027-03-31', rent: 3250, dep: 3250, status: 'Active' },
      { id: 'lease-302', unitId: 'unit-302', tenantId: 'usr-t302', start: '2026-01-15', end: '2027-01-14', rent: 2450, dep: 2450, status: 'Active' },
      { id: 'lease-303', unitId: 'unit-303', tenantId: 'usr-t303', start: '2026-07-01', end: '2027-06-30', rent: 2450, dep: 2450, status: 'Active' },
      { id: 'lease-401', unitId: 'unit-401', tenantId: 'usr-t401', start: '2025-05-01', end: '2027-04-30', rent: 4600, dep: 4600, status: 'Active' },
      { id: 'lease-402', unitId: 'unit-402', tenantId: 'usr-t402', start: '2026-03-01', end: '2027-02-28', rent: 3450, dep: 3450, status: 'Active' },
      { id: 'lease-403', unitId: 'unit-403', tenantId: 'usr-t403', start: '2026-05-01', end: '2027-04-30', rent: 3450, dep: 3450, status: 'Active' },
      { id: 'lease-404', unitId: 'unit-404', tenantId: 'usr-t404', start: '2025-11-01', end: '2027-10-31', rent: 4800, dep: 4800, status: 'Active' },
    ];

    const insertLease = db.prepare(`
      INSERT INTO leases (id, unit_id, tenant_user_id, start_date, end_date, monthly_rent, deposit_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l of leasesData) {
      insertLease.run(l.id, l.unitId, l.tenantId, l.start, l.end, l.rent, l.dep, l.status);
    }

    const paymentsData = [
      { id: 'pay-01', leaseId: 'lease-101', unitId: 'unit-101', tenantId: 'usr-t101', amt: 3400, due: '2026-11-01', paid: '2026-11-01T10:15:00Z', method: 'ACH Transfer', ref: 'INV-202611-101', status: 'Paid', notes: 'Cleared on due date' },
      { id: 'pay-02', leaseId: 'lease-201', unitId: 'unit-201', tenantId: 'usr-t201', amt: 3150, due: '2026-11-01', paid: '2026-11-02T14:20:00Z', method: 'Wire Transfer', ref: 'INV-202611-201', status: 'Paid', notes: 'Confirmed by Finance' },
      { id: 'pay-03', leaseId: 'lease-302', unitId: 'unit-302', tenantId: 'usr-t302', amt: 2450, due: '2026-11-01', paid: '2026-11-01T08:40:00Z', method: 'Auto-Debit', ref: 'INV-202611-302', status: 'Paid', notes: 'November rent settled' },
      { id: 'pay-04', leaseId: 'lease-401', unitId: 'unit-401', tenantId: 'usr-t401', amt: 4600, due: '2026-11-01', paid: '2026-11-03T11:05:00Z', method: 'ACH Transfer', ref: 'INV-202611-401', status: 'Paid', notes: 'Includes penthouse amenity fee' },
      { id: 'pay-05', leaseId: 'lease-404', unitId: 'unit-404', tenantId: 'usr-t404', amt: 4800, due: '2026-11-01', paid: '2026-11-01T09:12:00Z', method: 'Wire Transfer', ref: 'INV-202611-404', status: 'Paid', notes: '' },
      { id: 'pay-06', leaseId: 'lease-103', unitId: 'unit-103', tenantId: 'usr-t103', amt: 1850, due: '2026-11-05', paid: null, method: null, ref: 'INV-202611-103', status: 'Overdue', notes: 'Reminder sent on Nov 8' },
      { id: 'pay-07', leaseId: 'lease-303', unitId: 'unit-303', tenantId: 'usr-t303', amt: 2450, due: '2026-11-10', paid: null, method: null, ref: 'INV-202611-303', status: 'Overdue', notes: 'Pending bank clearance follow-up' },
      { id: 'pay-08', leaseId: 'lease-102', unitId: 'unit-102', tenantId: 'usr-t102', amt: 2250, due: '2026-11-15', paid: null, method: null, ref: 'INV-202611-102', status: 'Upcoming', notes: 'Scheduled mid-month cycle' },
      { id: 'pay-09', leaseId: 'lease-202', unitId: 'unit-202', tenantId: 'usr-t202', amt: 2350, due: '2026-11-15', paid: null, method: null, ref: 'INV-202611-202', status: 'Upcoming', notes: '' },
      { id: 'pay-10', leaseId: 'lease-204', unitId: 'unit-204', tenantId: 'usr-t204', amt: 3200, due: '2026-11-18', paid: null, method: null, ref: 'INV-202611-204', status: 'Upcoming', notes: 'Final month of current term' },
      { id: 'pay-11', leaseId: 'lease-301', unitId: 'unit-301', tenantId: 'usr-t301', amt: 3250, due: '2026-11-20', paid: null, method: null, ref: 'INV-202611-301', status: 'Upcoming', notes: '' },
      { id: 'pay-12', leaseId: 'lease-302', unitId: 'unit-302', tenantId: 'usr-t302', amt: 2450, due: '2026-12-01', paid: null, method: null, ref: 'INV-202612-302', status: 'Upcoming', notes: 'December scheduled rent' },
    ];

    const insertPayment = db.prepare(`
      INSERT INTO payments (id, lease_id, unit_id, tenant_user_id, amount, due_date, paid_at, method, reference_code, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of paymentsData) {
      insertPayment.run(p.id, p.leaseId, p.unitId, p.tenantId, p.amt, p.due, p.paid, p.method, p.ref, p.status, p.notes);
    }

    const encodeTextDoc = (text: string) =>
      `data:text/plain;base64,${Buffer.from(text, 'utf8').toString('base64')}`;

    const docsData = [
      {
        id: 'doc-01',
        tenantId: 'usr-t302',
        unitId: 'unit-302',
        title: 'Unit 302 Standard Residential Lease (2026–2027)',
        category: 'Lease Agreement',
        fileName: 'Meridian_Lease_Unit302_2026.txt',
        mimeType: 'text/plain',
        data: encodeTextDoc(
          'MERIDIAN HOUSE RESIDENTIAL LEASE AGREEMENT\nUnit: 302 (Floor 3, 72 sqm)\nTenant: Clara Morales\nTerm: 2026-01-15 to 2027-01-14\nMonthly Rent: $2,450.00\nSecurity Deposit: $2,450.00\nAccess Badge: MH-RES-302\nSigned digitally by Landlord Elena Vance & Tenant Clara Morales.'
        ),
        verified: 1,
        uploadedAt: '2026-01-15T10:00:00Z',
      },
      {
        id: 'doc-02',
        tenantId: 'usr-t302',
        unitId: 'unit-302',
        title: 'Government Photo ID & Background Clearance',
        category: 'ID Verification',
        fileName: 'Clara_Morales_ID_Clearance.txt',
        mimeType: 'text/plain',
        data: encodeTextDoc(
          'SECURITY CLEARANCE RECORD\nResident: Clara Morales\nUnit: 302\nBadge Issued: MH-RES-302\nVerification Status: Verified by David Okonkwo (Head of Security)\nDate: 2026-01-14'
        ),
        verified: 1,
        uploadedAt: '2026-01-14T16:25:00Z',
      },
      {
        id: 'doc-03',
        tenantId: 'usr-t101',
        unitId: 'unit-101',
        title: 'Ground Commercial Retail Lease — Atelier Press',
        category: 'Lease Agreement',
        fileName: 'Commercial_Lease_Unit101.txt',
        mimeType: 'text/plain',
        data: encodeTextDoc(
          'MERIDIAN HOUSE COMMERCIAL LEASE\nUnit: 101 (Ground / Floor 1 Street Suite, 95 sqm)\nLessee: Atelier Press Studio\nTerm: 2025-03-01 to 2027-02-28\nMonthly Rent: $3,400.00'
        ),
        verified: 1,
        uploadedAt: '2025-03-01T09:00:00Z',
      },
      {
        id: 'doc-04',
        tenantId: 'usr-t103',
        unitId: 'unit-103',
        title: 'Move-In Inspection Checklist — Unit 103',
        category: 'Inspection',
        fileName: 'Unit103_MoveIn_Checklist.txt',
        mimeType: 'text/plain',
        data: encodeTextDoc(
          'MOVE-IN CONDITION REPORT\nUnit: 103 (Studio, Floor 1)\nTenant: Noah Patel\nCondition: Good. Pending final ID badge verification at Security Desk.'
        ),
        verified: 0,
        uploadedAt: '2026-06-01T12:10:00Z',
      },
      {
        id: 'doc-05',
        tenantId: 'usr-t401',
        unitId: 'unit-401',
        title: 'Penthouse 401 Lease & Private Terrace Addendum',
        category: 'Lease Agreement',
        fileName: 'Penthouse_401_Lease_Addendum.txt',
        mimeType: 'text/plain',
        data: encodeTextDoc(
          'MERIDIAN HOUSE PENTHOUSE LEASE\nUnit: 401 (145 sqm)\nTenant: Dr. Arthur Pendelton\nMonthly Rent: $4,600.00\nIncludes private terrace & 2 reserved garage bays.'
        ),
        verified: 1,
        uploadedAt: '2025-05-01T11:30:00Z',
      },
    ];

    const insertDoc = db.prepare(`
      INSERT INTO documents (id, tenant_user_id, unit_id, title, category, file_name, mime_type, file_data, verified_by_security, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of docsData) {
      insertDoc.run(d.id, d.tenantId, d.unitId, d.title, d.category, d.fileName, d.mimeType, d.data, d.verified, d.uploadedAt);
    }

    const maintData = [
      {
        id: 'mnt-101',
        unitId: 'unit-302',
        floor: 3,
        zone: 'Unit 302 · Kitchen Sink Line',
        x: 72,
        y: 28,
        reporter: 'usr-t302',
        assignee: 'usr-maint',
        cat: 'Plumbing',
        prio: 'High',
        title: 'Under-sink shutoff valve slow drip',
        desc: 'Noticed steady moisture beneath the kitchen cold-water valve near the east wall riser.',
        status: 'In Progress',
        notes: 'Replacement brass cartridge ordered; technician scheduled today 14:00.',
        created: '2026-11-11T16:40:00Z',
        updated: '2026-11-12T09:15:00Z',
      },
      {
        id: 'mnt-102',
        unitId: 'unit-203',
        floor: 2,
        zone: 'Unit 203 · Main HVAC Diffuser',
        x: 24,
        y: 68,
        reporter: 'usr-landlord',
        assignee: 'usr-maint',
        cat: 'HVAC',
        prio: 'Urgent',
        title: 'Heat pump compressor cycling fault',
        desc: 'Unit 203 is offline for turnover inspection; condenser throws E4 airflow sensor alert.',
        status: 'Open',
        notes: '',
        created: '2026-11-12T11:20:00Z',
        updated: '2026-11-12T11:20:00Z',
      },
      {
        id: 'mnt-103',
        unitId: 'unit-101',
        floor: 1,
        zone: 'Unit 101 · Storefront Track Lighting',
        x: 22,
        y: 26,
        reporter: 'usr-t101',
        assignee: 'usr-maint',
        cat: 'Electrical',
        prio: 'Medium',
        title: 'North gallery track circuit breaker tripping',
        desc: 'Circuit B2 trips intermittently when all display spotlights are active.',
        status: 'Open',
        notes: '',
        created: '2026-11-12T15:05:00Z',
        updated: '2026-11-12T15:05:00Z',
      },
      {
        id: 'mnt-104',
        unitId: 'unit-000',
        floor: 0,
        zone: 'Ground Lobby · East Keycard Reader',
        x: 66,
        y: 44,
        reporter: 'usr-security',
        assignee: 'usr-maint',
        cat: 'Access/Lock',
        prio: 'High',
        title: 'Side service vestibule RFID reader delay',
        desc: 'Badge scans take 3–4 seconds before magnetic strike releases.',
        status: 'In Progress',
        notes: 'Firmware diagnostic queued with security team.',
        created: '2026-11-10T08:30:00Z',
        updated: '2026-11-12T10:00:00Z',
      },
      {
        id: 'mnt-105',
        unitId: 'unit-401',
        floor: 4,
        zone: 'Unit 401 · Terrace Sliding Seal',
        x: 30,
        y: 24,
        reporter: 'usr-t401',
        assignee: 'usr-maint',
        cat: 'Structural',
        prio: 'Low',
        title: 'Balcony weatherstrip gasket replacement',
        desc: 'Minor draft along the west terrace glass sliding track.',
        status: 'Resolved',
        notes: 'Replaced silicone compression gasket and tested water seal.',
        created: '2026-11-04T13:10:00Z',
        updated: '2026-11-06T17:00:00Z',
      },
      {
        id: 'mnt-106',
        unitId: 'unit-301',
        floor: 3,
        zone: 'Unit 301 · Bathroom Exhaust Fan',
        x: 28,
        y: 32,
        reporter: 'usr-t301',
        assignee: null,
        cat: 'Electrical',
        prio: 'Medium',
        title: 'Exhaust fan bearing rattle',
        desc: 'Noticeable hum after 5 minutes of operation in primary bath.',
        status: 'Open',
        notes: '',
        created: '2026-11-13T07:50:00Z',
        updated: '2026-11-13T07:50:00Z',
      },
    ];

    const insertMaint = db.prepare(`
      INSERT INTO maintenance_requests (
        id, unit_id, floor, zone_label, pin_x, pin_y, reported_by_user_id, assigned_to_user_id,
        category, priority, title, description, status, resolution_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of maintData) {
      insertMaint.run(
        m.id, m.unitId, m.floor, m.zone, m.x, m.y, m.reporter, m.assignee,
        m.cat, m.prio, m.title, m.desc, m.status, m.notes, m.created, m.updated
      );
    }

    const secLogs = [
      {
        id: 'sec-01',
        type: 'Visitor',
        unitId: 'unit-302',
        subject: 'Lucas Bennett (Interior Designer)',
        badge: 'VIS-048',
        status: 'Checked In',
        notes: 'Authorized by Clara Morales until 18:00',
        logger: 'usr-security',
        ts: '2026-11-13T09:42:00Z',
      },
      {
        id: 'sec-02',
        type: 'Delivery',
        unitId: 'unit-101',
        subject: 'Pacific Paper Freight',
        badge: 'DEL-119',
        status: 'Checked Out',
        notes: 'Loading bay delivery completed; signed by Atelier Press',
        logger: 'usr-security',
        ts: '2026-11-13T08:15:00Z',
      },
      {
        id: 'sec-03',
        type: 'Incident',
        unitId: 'unit-000',
        subject: 'Garage Gate Sensor Obstruction',
        badge: 'INC-209',
        status: 'Flagged',
        notes: 'South entry loop stayed open 40s; maintenance notified via secure channel.',
        logger: 'usr-security',
        ts: '2026-11-12T22:10:00Z',
      },
      {
        id: 'sec-04',
        type: 'Patrol',
        unitId: 'unit-000',
        subject: 'Night Perimeter & Rooftop Check',
        badge: 'PTR-400',
        status: 'Resolved',
        notes: 'All 4 stairwell fire doors and roof hatch locked normally.',
        logger: 'usr-security',
        ts: '2026-11-13T03:00:00Z',
      },
    ];

    const insertSec = db.prepare(`
      INSERT INTO security_logs (id, log_type, unit_id, subject_name, badge_or_id, status, notes, logged_by_user_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of secLogs) {
      insertSec.run(s.id, s.type, s.unitId, s.subject, s.badge, s.status, s.notes, s.logger, s.ts);
    }

    const channels = [
      {
        id: 'ch-tenant-support',
        name: 'Landlord & Management Desk',
        desc: 'Direct channel between tenants and property management for leases, documents, and notices.',
        type: 'tenant_support',
        roles: JSON.stringify(['landlord', 'tenant']),
        unitId: null,
      },
      {
        id: 'ch-maintenance',
        name: 'Maintenance Dispatch',
        desc: 'Direct repair coordination tied to floorplan maintenance pins.',
        type: 'maintenance_direct',
        roles: JSON.stringify(['landlord', 'maintenance', 'tenant', 'security']),
        unitId: null,
      },
      {
        id: 'ch-finance',
        name: 'Finance & Billing Support',
        desc: 'Rent receipts, ACH verification, and upcoming invoice questions.',
        type: 'finance_billing',
        roles: JSON.stringify(['landlord', 'finance', 'tenant']),
        unitId: null,
      },
      {
        id: 'ch-security',
        name: 'Front Desk & Security',
        desc: 'Visitor pre-registration, badge activation, and building access alerts.',
        type: 'security_desk',
        roles: JSON.stringify(['landlord', 'security', 'tenant']),
        unitId: null,
      },
      {
        id: 'ch-staff-secure',
        name: 'Staff Secure Operations',
        desc: 'Internal encrypted staff-only coordination across Landlord, Finance, Security, and Maintenance.',
        type: 'staff_secure',
        roles: JSON.stringify(['landlord', 'finance', 'security', 'maintenance']),
        unitId: null,
      },
    ];

    const insertChan = db.prepare(`
      INSERT INTO chat_channels (id, name, description, channel_type, allowed_roles, unit_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const c of channels) {
      insertChan.run(c.id, c.name, c.desc, c.type, c.roles, c.unitId);
    }

    const messages = [
      {
        id: 'msg-01',
        ch: 'ch-tenant-support',
        uid: 'usr-landlord',
        name: 'Elena Vance',
        role: 'landlord',
        body: 'Welcome to the Meridian House portal. Let us know here if you need lease copies or renewal terms.',
        ts: '2026-11-12T09:00:00Z',
      },
      {
        id: 'msg-02',
        ch: 'ch-tenant-support',
        uid: 'usr-t302',
        name: 'Clara Morales',
        role: 'tenant',
        body: 'Thank you Elena! I uploaded my updated renter insurance certificate to the document vault.',
        ts: '2026-11-12T09:24:00Z',
      },
      {
        id: 'msg-03',
        ch: 'ch-maintenance',
        uid: 'usr-t302',
        name: 'Clara Morales',
        role: 'tenant',
        body: 'I pinned the kitchen sink valve drip on the 3rd floor plan (Unit 302). No rush, just wanted to catch it early.',
        ts: '2026-11-12T09:30:00Z',
      },
      {
        id: 'msg-04',
        ch: 'ch-maintenance',
        uid: 'usr-maint',
        name: 'Carlos Rivera',
        role: 'maintenance',
        body: 'Got your pin in Unit 302. I have the brass valve cartridge on hand and will stop by at 14:00 today.',
        ts: '2026-11-12T09:42:00Z',
      },
      {
        id: 'msg-05',
        ch: 'ch-staff-secure',
        uid: 'usr-security',
        name: 'David Okonkwo',
        role: 'security',
        body: 'Heads up team: Unit 103 (Noah Patel) and Unit 303 (Nadia Kowalski) still need secondary photo ID verification on file.',
        ts: '2026-11-13T07:35:00Z',
      },
      {
        id: 'msg-06',
        ch: 'ch-staff-secure',
        uid: 'usr-finance',
        name: 'Marcus Chen',
        role: 'finance',
        body: 'Noted David. Both units are also flagged in the November overdue rent ledger—sending polite reminders this morning.',
        ts: '2026-11-13T07:45:00Z',
      },
    ];

    const insertMsg = db.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_user_id, sender_name, sender_role, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of messages) {
      insertMsg.run(m.id, m.ch, m.uid, m.name, m.role, m.body, m.ts);
    }
  });

  seed();
}
