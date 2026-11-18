import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { db, hashPassword, initDatabase, verifyPassword } from './server/db.ts';
import type { User, UserRole } from './src/types.ts';

initDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

interface AuthedRequest extends Request {
  user?: User;
  token?: string;
}

function mapUserRow(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    unitId: row.unit_id,
    unitNumber: row.unit_number ?? null,
    phone: row.phone,
    badgeCode: row.badge_code,
    securityVerified: Boolean(row.security_verified),
    status: row.status,
    createdAt: row.created_at,
  };
}

function getUserFromToken(token?: string | null): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.*, un.unit_number
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN units un ON u.unit_id = un.id
       WHERE s.token = ? AND u.status = 'Active'`
    )
    .get(token);
  return row ? mapUserRow(row) : null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.user = user;
  req.token = token!;
  return next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role permissions for this action.' });
    }
    return next();
  };
}

// --- WebSocket Hub ---
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

interface ConnectedClient {
  ws: WebSocket;
  user: User;
}

const clients = new Set<ConnectedClient>();

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    return;
  }
  const token = url.searchParams.get('token');
  const user = getUserFromToken(token);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, user);
  });
});

wss.on('connection', (ws, user: User) => {
  const client: ConnectedClient = { ws, user };
  clients.add(client);

  ws.on('close', () => {
    clients.delete(client);
  });
});

function broadcastEvent(event: string, payload: unknown, allowedRoles?: UserRole[]) {
  const message = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (allowedRoles && !allowedRoles.includes(client.user.role)) continue;
    client.ws.send(message);
  }
}

// --- Auth Routes ---
app.get('/api/auth/demo-accounts', (_req, res) => {
  const accounts = [
    {
      id: 'usr-landlord',
      name: 'Elena Vance',
      email: 'landlord@meridianhouse.io',
      password: 'meridian2026',
      role: 'landlord',
      unitNumber: null,
      subtitle: 'Building Owner · Full Portfolio & User Admin',
    },
    {
      id: 'usr-finance',
      name: 'Marcus Chen',
      email: 'finance@meridianhouse.io',
      password: 'meridian2026',
      role: 'finance',
      unitNumber: null,
      subtitle: 'Finance Officer · Rent Ledger & Receipts',
    },
    {
      id: 'usr-security',
      name: 'David Okonkwo',
      email: 'security@meridianhouse.io',
      password: 'meridian2026',
      role: 'security',
      unitNumber: null,
      subtitle: 'Head of Security · Badges, Visitors & Incidents',
    },
    {
      id: 'usr-maint',
      name: 'Carlos Rivera',
      email: 'maintenance@meridianhouse.io',
      password: 'meridian2026',
      role: 'maintenance',
      unitNumber: null,
      subtitle: 'Lead Engineer · Floorplan Tickets & Repairs',
    },
    {
      id: 'usr-t302',
      name: 'Clara Morales',
      email: 'tenant302@meridianhouse.io',
      password: 'meridian2026',
      role: 'tenant',
      unitNumber: '302',
      subtitle: 'Resident Unit 302 · Floorplan Mapping & Chat',
    },
  ];
  res.json({ accounts });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const row = db
    .prepare(
      `SELECT u.*, un.unit_number
       FROM users u
       LEFT JOIN units un ON u.unit_id = un.id
       WHERE LOWER(u.email) = LOWER(?)`
    )
    .get(email.trim()) as any;

  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (row.status !== 'Active') {
    return res.status(403).json({ error: 'This account has been deactivated by the landlord.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    row.id,
    new Date().toISOString()
  );

  // Role is automatically detected from the verified user record
  return res.json({
    token,
    user: mapUserRow(row),
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  if (req.token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// --- Dashboard Summary ---
app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const units = db
    .prepare(
      `SELECT u.*,
              l.tenant_user_id,
              usr.name AS tenant_name,
              l.end_date AS lease_end_date
       FROM units u
       LEFT JOIN leases l ON l.unit_id = u.id AND l.status != 'Ended'
       LEFT JOIN users usr ON l.tenant_user_id = usr.id
       WHERE u.floor > 0
       ORDER BY u.floor ASC, u.unit_number ASC`
    )
    .all()
    .map((r: any) => ({
      id: r.id,
      unitNumber: r.unit_number,
      floor: r.floor,
      unitType: r.unit_type,
      areaSqm: r.area_sqm,
      monthlyRent: r.monthly_rent,
      occupancyStatus: r.occupancy_status,
      tenantUserId: r.tenant_user_id ?? null,
      tenantName: r.tenant_name ?? null,
      leaseEndDate: r.lease_end_date ?? null,
    }));

  const activeUnits = units.filter((u) => u.occupancyStatus === 'Occupied').length;
  const totalUnits = units.length;

  const paymentRows = db
    .prepare(
      `SELECT p.*, un.unit_number, usr.name AS tenant_name
       FROM payments p
       JOIN units un ON p.unit_id = un.id
       JOIN users usr ON p.tenant_user_id = usr.id
       ORDER BY
         CASE p.status WHEN 'Overdue' THEN 0 WHEN 'Upcoming' THEN 1 ELSE 2 END,
         p.due_date ASC`
    )
    .all() as any[];

  const monthlyCollected = paymentRows
    .filter((p) => p.status === 'Paid')
    .reduce((acc, p) => acc + p.amount, 0);
  const upcomingDue = paymentRows
    .filter((p) => p.status === 'Upcoming')
    .reduce((acc, p) => acc + p.amount, 0);
  const overdueAmount = paymentRows
    .filter((p) => p.status === 'Overdue')
    .reduce((acc, p) => acc + p.amount, 0);

  const maintRows = db
    .prepare(
      `SELECT m.*, un.unit_number, rep.name AS reported_by_name, asg.name AS assigned_to_name
       FROM maintenance_requests m
       JOIN units un ON m.unit_id = un.id
       JOIN users rep ON m.reported_by_user_id = rep.id
       LEFT JOIN users asg ON m.assigned_to_user_id = asg.id
       WHERE m.status != 'Resolved'
       ORDER BY
         CASE m.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
         m.created_at DESC`
    )
    .all() as any[];

  const verifiedTenants = (
    db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE role = 'tenant' AND security_verified = 1`).get() as {
      cnt: number;
    }
  ).cnt;

  const formatPayment = (p: any) => ({
    id: p.id,
    leaseId: p.lease_id,
    unitId: p.unit_id,
    unitNumber: p.unit_number,
    tenantUserId: p.tenant_user_id,
    tenantName: p.tenant_name,
    amount: p.amount,
    dueDate: p.due_date,
    paidAt: p.paid_at,
    method: p.method,
    referenceCode: p.reference_code,
    status: p.status,
    notes: p.notes,
  });

  const formatMaint = (m: any) => ({
    id: m.id,
    unitId: m.unit_id,
    unitNumber: m.unit_number,
    floor: m.floor,
    zoneLabel: m.zone_label,
    pinX: m.pin_x,
    pinY: m.pin_y,
    reportedByUserId: m.reported_by_user_id,
    reportedByName: m.reported_by_name,
    assignedToUserId: m.assigned_to_user_id,
    assignedToName: m.assigned_to_name,
    category: m.category,
    priority: m.priority,
    title: m.title,
    description: m.description,
    status: m.status,
    resolutionNotes: m.resolution_notes,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  });

  const isTenant = req.user?.role === 'tenant';
  const filteredPayments = isTenant
    ? paymentRows.filter((p) => p.tenant_user_id === req.user?.id)
    : paymentRows.filter((p) => p.status !== 'Paid').slice(0, 8);

  const filteredMaint = isTenant
    ? maintRows.filter((m) => m.unit_id === req.user?.unitId || m.floor === 0)
    : maintRows.slice(0, 8);

  res.json({
    metrics: {
      activeUnits,
      totalUnits,
      monthlyCollected,
      upcomingDue,
      overdueAmount,
      openMaintenance: maintRows.length,
      urgentMaintenance: maintRows.filter((m) => m.priority === 'Urgent' || m.priority === 'High').length,
      verifiedTenants,
    },
    upcomingPayments: filteredPayments.map(formatPayment),
    openTickets: filteredMaint.map(formatMaint),
    units,
  });
});

// --- Units ---
app.get('/api/units', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, l.tenant_user_id, usr.name AS tenant_name, l.end_date AS lease_end_date
       FROM units u
       LEFT JOIN leases l ON l.unit_id = u.id AND l.status != 'Ended'
       LEFT JOIN users usr ON l.tenant_user_id = usr.id
       ORDER BY u.floor ASC, u.unit_number ASC`
    )
    .all()
    .map((r: any) => ({
      id: r.id,
      unitNumber: r.unit_number,
      floor: r.floor,
      unitType: r.unit_type,
      areaSqm: r.area_sqm,
      monthlyRent: r.monthly_rent,
      occupancyStatus: r.occupancy_status,
      tenantUserId: r.tenant_user_id ?? null,
      tenantName: r.tenant_name ?? null,
      leaseEndDate: r.lease_end_date ?? null,
    }));
  res.json({ units: rows });
});

app.patch('/api/units/:id', requireAuth, requireRoles('landlord', 'maintenance'), (req, res) => {
  const { occupancyStatus, monthlyRent } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Unit not found.' });
  }
  const nextStatus = occupancyStatus ?? existing.occupancy_status;
  const nextRent = typeof monthlyRent === 'number' ? monthlyRent : existing.monthly_rent;
  db.prepare('UPDATE units SET occupancy_status = ?, monthly_rent = ? WHERE id = ?').run(
    nextStatus,
    nextRent,
    req.params.id
  );
  res.json({ ok: true });
});

// --- Users & Profiles ---
app.get('/api/users', requireAuth, (req: AuthedRequest, res) => {
  if (req.user?.role === 'tenant') {
    const row = db
      .prepare(
        `SELECT u.*, un.unit_number
         FROM users u LEFT JOIN units un ON u.unit_id = un.id
         WHERE u.id = ?`
      )
      .get(req.user.id);
    return res.json({ users: row ? [mapUserRow(row)] : [] });
  }
  const rows = db
    .prepare(
      `SELECT u.*, un.unit_number
       FROM users u
       LEFT JOIN units un ON u.unit_id = un.id
       ORDER BY CASE u.role WHEN 'tenant' THEN 1 ELSE 0 END, un.unit_number ASC, u.name ASC`
    )
    .all();
  res.json({ users: rows.map(mapUserRow) });
});

app.post('/api/users', requireAuth, requireRoles('landlord'), (req, res) => {
  const { name, email, password, role, unitId, phone, badgeCode } = req.body ?? {};
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const id = `usr-${crypto.randomBytes(4).toString('hex')}`;
  const pwHash = hashPassword(password || 'meridian2026');
  const badge = badgeCode || `MH-${role.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, unit_id, phone, badge_code, security_verified, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active', ?)`
  ).run(id, name.trim(), email.trim(), pwHash, role, unitId || null, phone || '', badge, new Date().toISOString());

  const created = db
    .prepare(`SELECT u.*, un.unit_number FROM users u LEFT JOIN units un ON u.unit_id = un.id WHERE u.id = ?`)
    .get(id);
  res.status(201).json({ user: mapUserRow(created) });
});

app.patch('/api/users/:id', requireAuth, requireRoles('landlord', 'security'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const { name, phone, badgeCode, securityVerified, role, unitId, status } = req.body ?? {};

  // Security can only toggle securityVerified & badgeCode
  if (req.user?.role === 'security') {
    db.prepare('UPDATE users SET security_verified = ?, badge_code = ? WHERE id = ?').run(
      typeof securityVerified === 'boolean' ? (securityVerified ? 1 : 0) : existing.security_verified,
      badgeCode ?? existing.badge_code,
      req.params.id
    );
  } else {
    db.prepare(
      `UPDATE users
       SET name = ?, phone = ?, badge_code = ?, security_verified = ?, role = ?, unit_id = ?, status = ?
       WHERE id = ?`
    ).run(
      name ?? existing.name,
      phone ?? existing.phone,
      badgeCode ?? existing.badge_code,
      typeof securityVerified === 'boolean' ? (securityVerified ? 1 : 0) : existing.security_verified,
      role ?? existing.role,
      unitId !== undefined ? unitId : existing.unit_id,
      status ?? existing.status,
      req.params.id
    );
  }

  const updated = db
    .prepare(`SELECT u.*, un.unit_number FROM users u LEFT JOIN units un ON u.unit_id = un.id WHERE u.id = ?`)
    .get(req.params.id);
  res.json({ user: mapUserRow(updated) });
});

// --- Leases ---
app.get('/api/leases', requireAuth, (req: AuthedRequest, res) => {
  const query =
    req.user?.role === 'tenant'
      ? `SELECT l.*, un.unit_number, un.floor, usr.name AS tenant_name, usr.email AS tenant_email, usr.phone AS tenant_phone
         FROM leases l
         JOIN units un ON l.unit_id = un.id
         JOIN users usr ON l.tenant_user_id = usr.id
         WHERE l.tenant_user_id = ?
         ORDER BY un.unit_number ASC`
      : `SELECT l.*, un.unit_number, un.floor, usr.name AS tenant_name, usr.email AS tenant_email, usr.phone AS tenant_phone
         FROM leases l
         JOIN units un ON l.unit_id = un.id
         JOIN users usr ON l.tenant_user_id = usr.id
         ORDER BY un.unit_number ASC`;

  const rows = (req.user?.role === 'tenant' ? db.prepare(query).all(req.user.id) : db.prepare(query).all()).map(
    (r: any) => ({
      id: r.id,
      unitId: r.unit_id,
      unitNumber: r.unit_number,
      floor: r.floor,
      tenantUserId: r.tenant_user_id,
      tenantName: r.tenant_name,
      tenantEmail: r.tenant_email,
      tenantPhone: r.tenant_phone,
      startDate: r.start_date,
      endDate: r.end_date,
      monthlyRent: r.monthly_rent,
      depositAmount: r.deposit_amount,
      status: r.status,
    })
  );

  res.json({ leases: rows });
});

app.post('/api/leases', requireAuth, requireRoles('landlord'), (req, res) => {
  const { unitId, tenantUserId, startDate, endDate, monthlyRent, depositAmount, status } = req.body ?? {};
  if (!unitId || !tenantUserId || !startDate || !endDate || !monthlyRent) {
    return res.status(400).json({ error: 'Missing required lease fields.' });
  }
  const id = `lease-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    `INSERT INTO leases (id, unit_id, tenant_user_id, start_date, end_date, monthly_rent, deposit_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, unitId, tenantUserId, startDate, endDate, Number(monthlyRent), Number(depositAmount || monthlyRent), status || 'Active');

  db.prepare("UPDATE units SET occupancy_status = 'Occupied', monthly_rent = ? WHERE id = ?").run(
    Number(monthlyRent),
    unitId
  );
  db.prepare('UPDATE users SET unit_id = ? WHERE id = ?').run(unitId, tenantUserId);

  res.status(201).json({ id });
});

app.patch('/api/leases/:id', requireAuth, requireRoles('landlord'), (req, res) => {
  const existing = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Lease not found.' });
  }
  const { endDate, monthlyRent, status } = req.body ?? {};
  db.prepare('UPDATE leases SET end_date = ?, monthly_rent = ?, status = ? WHERE id = ?').run(
    endDate ?? existing.end_date,
    typeof monthlyRent === 'number' ? monthlyRent : existing.monthly_rent,
    status ?? existing.status,
    req.params.id
  );
  res.json({ ok: true });
});

// --- Payments ---
app.get('/api/payments', requireAuth, (req: AuthedRequest, res) => {
  const baseQuery = `SELECT p.*, un.unit_number, usr.name AS tenant_name
                     FROM payments p
                     JOIN units un ON p.unit_id = un.id
                     JOIN users usr ON p.tenant_user_id = usr.id`;
  const rows =
    req.user?.role === 'tenant'
      ? db.prepare(`${baseQuery} WHERE p.tenant_user_id = ? ORDER BY p.due_date DESC`).all(req.user.id)
      : db
          .prepare(
            `${baseQuery} ORDER BY CASE p.status WHEN 'Overdue' THEN 0 WHEN 'Upcoming' THEN 1 ELSE 2 END, p.due_date ASC`
          )
          .all();

  res.json({
    payments: rows.map((p: any) => ({
      id: p.id,
      leaseId: p.lease_id,
      unitId: p.unit_id,
      unitNumber: p.unit_number,
      tenantUserId: p.tenant_user_id,
      tenantName: p.tenant_name,
      amount: p.amount,
      dueDate: p.due_date,
      paidAt: p.paid_at,
      method: p.method,
      referenceCode: p.reference_code,
      status: p.status,
      notes: p.notes,
    })),
  });
});

app.post('/api/payments', requireAuth, requireRoles('landlord', 'finance'), (req, res) => {
  const { leaseId, amount, dueDate, status, method, notes } = req.body ?? {};
  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as any;
  if (!lease) {
    return res.status(404).json({ error: 'Lease not found.' });
  }
  const unit = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(lease.unit_id) as any;
  const id = `pay-${crypto.randomBytes(4).toString('hex')}`;
  const ref = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${unit?.unit_number || '000'}`;
  const paidAt = status === 'Paid' ? new Date().toISOString() : null;

  db.prepare(
    `INSERT INTO payments (id, lease_id, unit_id, tenant_user_id, amount, due_date, paid_at, method, reference_code, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    lease.id,
    lease.unit_id,
    lease.tenant_user_id,
    Number(amount || lease.monthly_rent),
    dueDate || new Date().toISOString().slice(0, 10),
    paidAt,
    method || (status === 'Paid' ? 'ACH Transfer' : null),
    ref,
    status || 'Upcoming',
    notes || ''
  );

  broadcastEvent('payment:updated', { id });
  res.status(201).json({ id });
});

app.patch('/api/payments/:id', requireAuth, requireRoles('landlord', 'finance'), (req, res) => {
  const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Payment not found.' });
  }
  const { status, method, notes } = req.body ?? {};
  const nextStatus = status ?? existing.status;
  const nextPaidAt = nextStatus === 'Paid' ? existing.paid_at || new Date().toISOString() : null;

  db.prepare('UPDATE payments SET status = ?, paid_at = ?, method = ?, notes = ? WHERE id = ?').run(
    nextStatus,
    nextPaidAt,
    method ?? existing.method ?? (nextStatus === 'Paid' ? 'ACH Transfer' : null),
    notes ?? existing.notes,
    req.params.id
  );

  broadcastEvent('payment:updated', { id: req.params.id, status: nextStatus });
  res.json({ ok: true });
});

// --- Tenant Documents ---
app.get('/api/documents', requireAuth, (req: AuthedRequest, res) => {
  const baseQuery = `SELECT d.*, un.unit_number, usr.name AS tenant_name
                     FROM documents d
                     JOIN units un ON d.unit_id = un.id
                     JOIN users usr ON d.tenant_user_id = usr.id`;
  const rows =
    req.user?.role === 'tenant'
      ? db.prepare(`${baseQuery} WHERE d.tenant_user_id = ? ORDER BY d.uploaded_at DESC`).all(req.user.id)
      : db.prepare(`${baseQuery} ORDER BY d.uploaded_at DESC`).all();

  res.json({
    documents: rows.map((d: any) => ({
      id: d.id,
      tenantUserId: d.tenant_user_id,
      tenantName: d.tenant_name,
      unitId: d.unit_id,
      unitNumber: d.unit_number,
      title: d.title,
      category: d.category,
      fileName: d.file_name,
      mimeType: d.mime_type,
      fileData: d.file_data,
      verifiedBySecurity: Boolean(d.verified_by_security),
      uploadedAt: d.uploaded_at,
    })),
  });
});

app.post('/api/documents', requireAuth, (req: AuthedRequest, res) => {
  const { tenantUserId, unitId, title, category, fileName, mimeType, fileData } = req.body ?? {};
  const targetUserId = req.user?.role === 'tenant' ? req.user.id : tenantUserId;
  const targetUnitId = req.user?.role === 'tenant' ? req.user.unitId : unitId;

  if (!targetUserId || !targetUnitId || !title || !fileName || !fileData) {
    return res.status(400).json({ error: 'Document title, tenant, unit, and file payload are required.' });
  }

  const id = `doc-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    `INSERT INTO documents (id, tenant_user_id, unit_id, title, category, file_name, mime_type, file_data, verified_by_security, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    targetUserId,
    targetUnitId,
    title.trim(),
    category || 'Lease Agreement',
    fileName.trim(),
    mimeType || 'text/plain',
    fileData,
    req.user?.role === 'security' || req.user?.role === 'landlord' ? 1 : 0,
    new Date().toISOString()
  );

  res.status(201).json({ id });
});

app.patch('/api/documents/:id', requireAuth, requireRoles('landlord', 'security'), (req, res) => {
  const { verifiedBySecurity } = req.body ?? {};
  db.prepare('UPDATE documents SET verified_by_security = ? WHERE id = ?').run(
    verifiedBySecurity ? 1 : 0,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/documents/:id', requireAuth, (req: AuthedRequest, res) => {
  const docRow = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!docRow) return res.status(404).json({ error: 'Document not found.' });
  if (req.user?.role !== 'landlord' && docRow.tenant_user_id !== req.user?.id) {
    return res.status(403).json({ error: 'Only the landlord or document owner can delete this file.' });
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Maintenance Requests & Floorplan Pins ---
app.get('/api/maintenance', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, un.unit_number, rep.name AS reported_by_name, asg.name AS assigned_to_name
       FROM maintenance_requests m
       JOIN units un ON m.unit_id = un.id
       JOIN users rep ON m.reported_by_user_id = rep.id
       LEFT JOIN users asg ON m.assigned_to_user_id = asg.id
       ORDER BY
         CASE m.status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
         m.created_at DESC`
    )
    .all() as any[];

  const mapped = rows.map((m) => ({
    id: m.id,
    unitId: m.unit_id,
    unitNumber: m.unit_number,
    floor: m.floor,
    zoneLabel: m.zone_label,
    pinX: m.pin_x,
    pinY: m.pin_y,
    reportedByUserId: m.reported_by_user_id,
    reportedByName: m.reported_by_name,
    assignedToUserId: m.assigned_to_user_id,
    assignedToName: m.assigned_to_name,
    category: m.category,
    priority: m.priority,
    title: m.title,
    description: m.description,
    status: m.status,
    resolutionNotes: m.resolution_notes,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }));

  res.json({ requests: mapped });
});

app.post('/api/maintenance', requireAuth, (req: AuthedRequest, res) => {
  const { unitId, floor, zoneLabel, pinX, pinY, category, priority, title, description } = req.body ?? {};
  if (!unitId || floor === undefined || !title || !description) {
    return res.status(400).json({ error: 'Unit, floor, title, and description are required.' });
  }

  const id = `mnt-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO maintenance_requests (
      id, unit_id, floor, zone_label, pin_x, pin_y, reported_by_user_id, assigned_to_user_id,
      category, priority, title, description, status, resolution_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'usr-maint', ?, ?, ?, ?, 'Open', '', ?, ?)`
  ).run(
    id,
    unitId,
    Number(floor),
    zoneLabel || `Floor ${floor} Pin`,
    typeof pinX === 'number' ? pinX : 50,
    typeof pinY === 'number' ? pinY : 50,
    req.user!.id,
    category || 'Plumbing',
    priority || 'Medium',
    title.trim(),
    description.trim(),
    now,
    now
  );

  broadcastEvent('maintenance:updated', { id, action: 'created' });
  res.status(201).json({ id });
});

app.patch('/api/maintenance/:id', requireAuth, requireRoles('landlord', 'maintenance', 'security'), (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_requests WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Maintenance request not found.' });
  }
  const { status, priority, resolutionNotes, assignedToUserId } = req.body ?? {};
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE maintenance_requests
     SET status = ?, priority = ?, resolution_notes = ?, assigned_to_user_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    status ?? existing.status,
    priority ?? existing.priority,
    resolutionNotes ?? existing.resolution_notes,
    assignedToUserId !== undefined ? assignedToUserId : existing.assigned_to_user_id,
    now,
    req.params.id
  );

  broadcastEvent('maintenance:updated', { id: req.params.id, status: status ?? existing.status });
  res.json({ ok: true });
});

// --- Security Logs ---
app.get('/api/security/logs', requireAuth, requireRoles('landlord', 'security', 'maintenance'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, un.unit_number, usr.name AS logged_by_name
       FROM security_logs s
       LEFT JOIN units un ON s.unit_id = un.id
       JOIN users usr ON s.logged_by_user_id = usr.id
       ORDER BY s.timestamp DESC`
    )
    .all()
    .map((s: any) => ({
      id: s.id,
      logType: s.log_type,
      unitId: s.unit_id,
      unitNumber: s.unit_number,
      subjectName: s.subject_name,
      badgeOrId: s.badge_or_id,
      status: s.status,
      notes: s.notes,
      loggedByUserId: s.logged_by_user_id,
      loggedByName: s.logged_by_name,
      timestamp: s.timestamp,
    }));

  res.json({ logs: rows });
});

app.post('/api/security/logs', requireAuth, requireRoles('landlord', 'security'), (req: AuthedRequest, res) => {
  const { logType, unitId, subjectName, badgeOrId, status, notes } = req.body ?? {};
  if (!logType || !subjectName) {
    return res.status(400).json({ error: 'Log type and subject name are required.' });
  }
  const id = `sec-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    `INSERT INTO security_logs (id, log_type, unit_id, subject_name, badge_or_id, status, notes, logged_by_user_id, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    logType,
    unitId || 'unit-000',
    subjectName.trim(),
    badgeOrId || `LOG-${Math.floor(100 + Math.random() * 899)}`,
    status || (logType === 'Incident' ? 'Flagged' : 'Checked In'),
    notes || '',
    req.user!.id,
    new Date().toISOString()
  );

  broadcastEvent('security:updated', { id }, ['landlord', 'security', 'maintenance']);
  res.status(201).json({ id });
});

app.patch('/api/security/logs/:id', requireAuth, requireRoles('landlord', 'security'), (req, res) => {
  const { status, notes } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM security_logs WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Security log not found.' });

  db.prepare('UPDATE security_logs SET status = ?, notes = ? WHERE id = ?').run(
    status ?? existing.status,
    notes ?? existing.notes,
    req.params.id
  );
  broadcastEvent('security:updated', { id: req.params.id }, ['landlord', 'security', 'maintenance']);
  res.json({ ok: true });
});

// --- Chat Channels & Messages ---
app.get('/api/chat/channels', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM chat_channels ORDER BY rowid ASC').all() as any[];
  const channels = rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      channelType: c.channel_type,
      allowedRoles: JSON.parse(c.allowed_roles) as UserRole[],
      unitId: c.unit_id,
    }))
    .filter((c) => c.allowedRoles.includes(req.user!.role));

  res.json({ channels });
});

app.get('/api/chat/channels/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const chan = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(req.params.id) as any;
  if (!chan) return res.status(404).json({ error: 'Channel not found.' });
  const allowed: UserRole[] = JSON.parse(chan.allowed_roles);
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Access denied to this communication channel.' });
  }

  const rows = db
    .prepare('SELECT * FROM chat_messages WHERE channel_id = ? ORDER BY created_at ASC')
    .all(req.params.id)
    .map((m: any) => ({
      id: m.id,
      channelId: m.channel_id,
      senderUserId: m.sender_user_id,
      senderName: m.sender_name,
      senderRole: m.sender_role as UserRole,
      body: m.body,
      createdAt: m.created_at,
    }));

  res.json({ messages: rows });
});

app.post('/api/chat/channels/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const chan = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(req.params.id) as any;
  if (!chan) return res.status(404).json({ error: 'Channel not found.' });
  const allowed: UserRole[] = JSON.parse(chan.allowed_roles);
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Access denied to this communication channel.' });
  }

  const { body, id: clientId } = req.body ?? {};
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'Message body cannot be empty.' });
  }

  const id = typeof clientId === 'string' && clientId.startsWith('msg-') ? clientId : `msg-${crypto.randomBytes(6).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const message = {
    id,
    channelId: req.params.id,
    senderUserId: req.user!.id,
    senderName: req.user!.name,
    senderRole: req.user!.role,
    body: body.trim(),
    createdAt,
  };

  db.prepare(
    `INSERT OR IGNORE INTO chat_messages (id, channel_id, sender_user_id, sender_name, sender_role, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message.id,
    message.channelId,
    message.senderUserId,
    message.senderName,
    message.senderRole,
    message.body,
    message.createdAt
  );

  broadcastEvent('chat:message', message, allowed);
  res.status(201).json({ message });
});

// --- App Settings (Currency) ---
const DEFAULT_CURRENCY_SETTINGS = {
  currency: 'IDR',
  exchangeRates: {
    IDR: 16000,
    USD: 1,
    SGD: 1.35,
    EUR: 0.92,
  },
  showDecimals: false,
};

function readCurrencySettings() {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get('currency_settings') as { value: string } | undefined;
  if (!row) return DEFAULT_CURRENCY_SETTINGS;
  try {
    const parsed = JSON.parse(row.value);
    return {
      currency: ['IDR', 'USD', 'SGD', 'EUR'].includes(parsed.currency) ? parsed.currency : 'IDR',
      exchangeRates: {
        IDR: Number(parsed.exchangeRates?.IDR) > 0 ? Number(parsed.exchangeRates.IDR) : 16000,
        USD: 1,
        SGD: Number(parsed.exchangeRates?.SGD) > 0 ? Number(parsed.exchangeRates.SGD) : 1.35,
        EUR: Number(parsed.exchangeRates?.EUR) > 0 ? Number(parsed.exchangeRates.EUR) : 0.92,
      },
      showDecimals: Boolean(parsed.showDecimals),
    };
  } catch {
    return DEFAULT_CURRENCY_SETTINGS;
  }
}

app.get('/api/settings', (_req, res) => {
  res.json({ settings: readCurrencySettings() });
});

app.patch('/api/settings', requireAuth, (req, res) => {
  const current = readCurrencySettings();
  const { currency, exchangeRates, showDecimals } = req.body ?? {};

  const allowedCurrencies = ['IDR', 'USD', 'SGD', 'EUR'];
  if (currency !== undefined && !allowedCurrencies.includes(currency)) {
    return res.status(400).json({ error: 'Unsupported currency code.' });
  }

  const nextRates = {
    IDR:
      exchangeRates?.IDR !== undefined && Number(exchangeRates.IDR) > 0
        ? Number(exchangeRates.IDR)
        : current.exchangeRates.IDR,
    USD: 1,
    SGD:
      exchangeRates?.SGD !== undefined && Number(exchangeRates.SGD) > 0
        ? Number(exchangeRates.SGD)
        : current.exchangeRates.SGD,
    EUR:
      exchangeRates?.EUR !== undefined && Number(exchangeRates.EUR) > 0
        ? Number(exchangeRates.EUR)
        : current.exchangeRates.EUR,
  };

  const nextSettings = {
    currency: currency ?? current.currency,
    exchangeRates: nextRates,
    showDecimals: typeof showDecimals === 'boolean' ? showDecimals : current.showDecimals,
  };

  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run('currency_settings', JSON.stringify(nextSettings), new Date().toISOString());

  broadcastEvent('settings:updated', nextSettings);
  res.json({ settings: nextSettings });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// --- Server & Vite Mount ---
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data/**'] },
      },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

