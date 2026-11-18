import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { db, hashPassword, initDatabase, verifyPassword } from './server/db.ts';
import type { ActivityAction, ActivityEntityType, ActivityLog, User, UserRole } from './src/types.ts';

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

function parseJsonSafe(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapActivityLogRow(r: any): ActivityLog {
  return {
    id: r.id,
    actorUserId: r.actor_user_id,
    actorName: r.actor_name,
    actorRole: r.actor_role as UserRole,
    action: r.action as ActivityAction,
    entityType: r.entity_type as ActivityEntityType,
    entityId: r.entity_id,
    entityLabel: r.entity_label,
    details: r.details,
    beforeData: parseJsonSafe(r.before_data),
    afterData: parseJsonSafe(r.after_data),
    timestamp: r.timestamp,
  };
}

function recordActivity(params: {
  actor: Pick<User, 'id' | 'name' | 'role'>;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  entityLabel: string;
  details: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}) {
  const id = `act-${crypto.randomBytes(5).toString('hex')}`;
  const timestamp = new Date().toISOString();
  const beforeJson = params.beforeData ? JSON.stringify(params.beforeData) : null;
  const afterJson = params.afterData ? JSON.stringify(params.afterData) : null;

  db.prepare(
    `INSERT INTO activity_logs (
      id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id,
      entity_label, details, before_data, after_data, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.actor.id,
    params.actor.name,
    params.actor.role,
    params.action,
    params.entityType,
    params.entityId,
    params.entityLabel,
    params.details,
    beforeJson,
    afterJson,
    timestamp
  );

  const entry: ActivityLog = {
    id,
    actorUserId: params.actor.id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    entityLabel: params.entityLabel,
    details: params.details,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    timestamp,
  };

  if (params.actor.role === 'tenant') {
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.user.role !== 'tenant' || client.user.id === params.actor.id) {
        client.ws.send(JSON.stringify({ event: 'activity:logged', payload: entry }));
      }
    }
  } else {
    broadcastEvent('activity:logged', entry, ['landlord', 'finance', 'security', 'maintenance']);
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

  const loggedUser = mapUserRow(row);
  recordActivity({
    actor: loggedUser,
    action: 'LOGIN',
    entityType: 'auth',
    entityId: loggedUser.id,
    entityLabel: loggedUser.email,
    details: `Signed in as ${loggedUser.name} (${loggedUser.role}).`,
    afterData: { role: loggedUser.role, email: loggedUser.email, unitNumber: loggedUser.unitNumber },
  });

  // Role is automatically detected from the verified user record
  return res.json({
    token,
    user: loggedUser,
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  if (req.token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  }
  if (req.user) {
    recordActivity({
      actor: req.user,
      action: 'LOGOUT',
      entityType: 'auth',
      entityId: req.user.id,
      entityLabel: req.user.email,
      details: `Signed out from workspace session.`,
    });
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
              b.name AS building_name,
              l.tenant_user_id,
              usr.name AS tenant_name,
              l.end_date AS lease_end_date
       FROM units u
       LEFT JOIN buildings b ON u.building_id = b.id
       LEFT JOIN leases l ON l.unit_id = u.id AND l.status != 'Ended'
       LEFT JOIN users usr ON l.tenant_user_id = usr.id
       WHERE u.floor > 0
       ORDER BY u.floor ASC, u.unit_number ASC`
    )
    .all()
    .map((r: any) => ({
      id: r.id,
      buildingId: r.building_id ?? null,
      buildingName: r.building_name ?? null,
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

// --- Buildings (Landlord CRUD) ---
function mapBuildingRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    address: r.address,
    floorsCount: r.floors_count,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    unitCount: Number(r.unit_count ?? 0),
    occupiedCount: Number(r.occupied_count ?? 0),
  };
}

app.get('/api/buildings', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*,
              COUNT(CASE WHEN u.floor > 0 THEN 1 END) AS unit_count,
              COUNT(CASE WHEN u.floor > 0 AND u.occupancy_status = 'Occupied' THEN 1 END) AS occupied_count
       FROM buildings b
       LEFT JOIN units u ON u.building_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at ASC, b.name ASC`
    )
    .all();
  res.json({ buildings: rows.map(mapBuildingRow) });
});

app.post('/api/buildings', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const { name, code, address, floorsCount, description, status } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim() || !code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Building name and code are required.' });
  }
  const cleanCode = code.trim().toUpperCase();
  const duplicate = db.prepare('SELECT id FROM buildings WHERE UPPER(code) = UPPER(?)').get(cleanCode);
  if (duplicate) {
    return res.status(409).json({ error: 'A building with this code already exists.' });
  }

  const id = `bld-${crypto.randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const resolvedFloors = Math.max(1, Number(floorsCount) || 4);
  const resolvedStatus = ['Active', 'Maintenance', 'Inactive'].includes(status) ? status : 'Active';
  const resolvedAddress = typeof address === 'string' ? address.trim() : '';
  const resolvedDescription = typeof description === 'string' ? description.trim() : '';

  db.prepare(
    `INSERT INTO buildings (id, name, code, address, floors_count, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name.trim(),
    cleanCode,
    resolvedAddress,
    resolvedFloors,
    resolvedDescription,
    resolvedStatus,
    createdAt
  );

  const created = db
    .prepare(
      `SELECT b.*, 0 AS unit_count, 0 AS occupied_count FROM buildings b WHERE b.id = ?`
    )
    .get(id);
  const mapped = mapBuildingRow(created);
  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'building',
    entityId: id,
    entityLabel: `${mapped.name} (${mapped.code})`,
    details: `Created building ${mapped.name} (${mapped.code}) with ${mapped.floorsCount} floors.`,
    afterData: {
      name: mapped.name,
      code: mapped.code,
      address: mapped.address,
      floorsCount: mapped.floorsCount,
      status: mapped.status,
      description: mapped.description,
    },
  });
  broadcastEvent('building:updated', { id, action: 'created' });
  res.status(201).json({ building: mapped });
});

app.patch('/api/buildings/:id', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Building not found.' });
  }
  const { name, code, address, floorsCount, description, status } = req.body ?? {};
  const nextCode = typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : existing.code;
  const dup = db
    .prepare('SELECT id FROM buildings WHERE UPPER(code) = UPPER(?) AND id != ?')
    .get(nextCode, req.params.id);
  if (dup) {
    return res.status(409).json({ error: 'Another building already uses this code.' });
  }

  const nextName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
  const nextAddress = typeof address === 'string' ? address.trim() : existing.address;
  const nextFloors = floorsCount !== undefined ? Math.max(1, Number(floorsCount) || existing.floors_count) : existing.floors_count;
  const nextDescription = typeof description === 'string' ? description.trim() : existing.description;
  const nextStatus = ['Active', 'Maintenance', 'Inactive'].includes(status) ? status : existing.status;

  db.prepare(
    `UPDATE buildings
     SET name = ?, code = ?, address = ?, floors_count = ?, description = ?, status = ?
     WHERE id = ?`
  ).run(nextName, nextCode, nextAddress, nextFloors, nextDescription, nextStatus, req.params.id);

  const updated = db
    .prepare(
      `SELECT b.*,
              COUNT(CASE WHEN u.floor > 0 THEN 1 END) AS unit_count,
              COUNT(CASE WHEN u.floor > 0 AND u.occupancy_status = 'Occupied' THEN 1 END) AS occupied_count
       FROM buildings b
       LEFT JOIN units u ON u.building_id = b.id
       WHERE b.id = ?
       GROUP BY b.id`
    )
    .get(req.params.id);
  const mapped = mapBuildingRow(updated);
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'building',
    entityId: req.params.id,
    entityLabel: `${mapped.name} (${mapped.code})`,
    details: `Updated building ${mapped.name} (${mapped.code}).`,
    beforeData: {
      name: existing.name,
      code: existing.code,
      address: existing.address,
      floorsCount: existing.floors_count,
      status: existing.status,
      description: existing.description,
    },
    afterData: {
      name: mapped.name,
      code: mapped.code,
      address: mapped.address,
      floorsCount: mapped.floorsCount,
      status: mapped.status,
      description: mapped.description,
    },
  });
  broadcastEvent('building:updated', { id: req.params.id, action: 'updated' });
  res.json({ building: mapped });
});

app.delete('/api/buildings/:id', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Building not found.' });
  }

  const totalBuildings = (db.prepare('SELECT COUNT(*) as cnt FROM buildings').get() as { cnt: number }).cnt;
  if (totalBuildings <= 1) {
    return res.status(409).json({ error: 'At least one building must remain in the system.' });
  }

  const activeLeaseCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM leases l
         JOIN units u ON l.unit_id = u.id
         WHERE u.building_id = ? AND l.status != 'Ended'`
      )
      .get(req.params.id) as { cnt: number }
  ).cnt;
  if (activeLeaseCount > 0) {
    return res.status(409).json({ error: 'Cannot delete a building with active leases. End leases or move spaces first.' });
  }

  const removedSpacesCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM units WHERE building_id = ? AND unit_number != 'COMMON'`)
      .get(req.params.id) as { cnt: number }
  ).cnt;

  const hasCommonUnit = db
    .prepare(`SELECT id FROM units WHERE building_id = ? AND unit_number = 'COMMON'`)
    .get(req.params.id);
  if (hasCommonUnit) {
    const fallbackBuilding = db
      .prepare('SELECT id FROM buildings WHERE id != ? ORDER BY created_at ASC LIMIT 1')
      .get(req.params.id) as { id: string } | undefined;
    if (fallbackBuilding) {
      db.prepare(`UPDATE units SET building_id = ? WHERE building_id = ? AND unit_number = 'COMMON'`).run(
        fallbackBuilding.id,
        req.params.id
      );
    }
  }

  db.prepare(`DELETE FROM units WHERE building_id = ? AND unit_number != 'COMMON'`).run(req.params.id);
  db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);

  recordActivity({
    actor: req.user!,
    action: 'DELETE',
    entityType: 'building',
    entityId: req.params.id,
    entityLabel: `${existing.name} (${existing.code})`,
    details: `Deleted building ${existing.name} (${existing.code}) and ${removedSpacesCount} associated vacant space(s).`,
    beforeData: {
      name: existing.name,
      code: existing.code,
      address: existing.address,
      floorsCount: existing.floors_count,
      status: existing.status,
      removedSpacesCount,
    },
  });

  broadcastEvent('building:updated', { id: req.params.id, action: 'deleted' });
  broadcastEvent('unit:updated', { action: 'deleted_by_building' });
  res.json({ ok: true });
});

// --- Units / Spaces ---
function mapUnitRow(r: any) {
  return {
    id: r.id,
    buildingId: r.building_id ?? null,
    buildingName: r.building_name ?? null,
    unitNumber: r.unit_number,
    floor: r.floor,
    unitType: r.unit_type,
    areaSqm: r.area_sqm,
    monthlyRent: r.monthly_rent,
    occupancyStatus: r.occupancy_status,
    tenantUserId: r.tenant_user_id ?? null,
    tenantName: r.tenant_name ?? null,
    leaseEndDate: r.lease_end_date ?? null,
  };
}

app.get('/api/units', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, b.name AS building_name, l.tenant_user_id, usr.name AS tenant_name, l.end_date AS lease_end_date
       FROM units u
       LEFT JOIN buildings b ON u.building_id = b.id
       LEFT JOIN leases l ON l.unit_id = u.id AND l.status != 'Ended'
       LEFT JOIN users usr ON l.tenant_user_id = usr.id
       ORDER BY u.floor ASC, u.unit_number ASC`
    )
    .all()
    .map(mapUnitRow);
  res.json({ units: rows });
});

app.post('/api/units', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const { buildingId, unitNumber, floor, unitType, areaSqm, monthlyRent, occupancyStatus } = req.body ?? {};
  if (!unitNumber || typeof unitNumber !== 'string' || !unitNumber.trim() || floor === undefined) {
    return res.status(400).json({ error: 'Space number and floor are required.' });
  }
  const cleanNum = unitNumber.trim();
  const duplicate = db.prepare('SELECT id FROM units WHERE LOWER(unit_number) = LOWER(?)').get(cleanNum);
  if (duplicate) {
    return res.status(409).json({ error: 'A space or unit with this number already exists.' });
  }

  let resolvedBuildingId = buildingId || null;
  if (!resolvedBuildingId) {
    const firstBuilding = db.prepare('SELECT id FROM buildings ORDER BY created_at ASC LIMIT 1').get() as
      | { id: string }
      | undefined;
    resolvedBuildingId = firstBuilding?.id ?? null;
  }

  const id = `unit-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    `INSERT INTO units (id, building_id, unit_number, floor, unit_type, area_sqm, monthly_rent, occupancy_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    resolvedBuildingId,
    cleanNum,
    Math.max(1, Number(floor) || 1),
    unitType || '1BR',
    Math.max(1, Number(areaSqm) || 40),
    Math.max(0, Math.round(Number(monthlyRent) || 0)),
    ['Occupied', 'Vacant', 'Maintenance'].includes(occupancyStatus) ? occupancyStatus : 'Vacant'
  );

  const created = db
    .prepare(
      `SELECT u.*, b.name AS building_name, NULL AS tenant_user_id, NULL AS tenant_name, NULL AS lease_end_date
       FROM units u LEFT JOIN buildings b ON u.building_id = b.id WHERE u.id = ?`
    )
    .get(id);
  const mapped = mapUnitRow(created);
  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'space',
    entityId: id,
    entityLabel: `Space ${mapped.unitNumber}${mapped.buildingName ? ` (${mapped.buildingName})` : ''}`,
    details: `Created space ${mapped.unitNumber} on Floor ${mapped.floor} (${mapped.unitType}, ${mapped.areaSqm} sqm).`,
    afterData: {
      buildingName: mapped.buildingName,
      unitNumber: mapped.unitNumber,
      floor: mapped.floor,
      unitType: mapped.unitType,
      areaSqm: mapped.areaSqm,
      monthlyRent: mapped.monthlyRent,
      occupancyStatus: mapped.occupancyStatus,
    },
  });
  broadcastEvent('unit:updated', { id, action: 'created' });
  res.status(201).json({ unit: mapped });
});

app.patch('/api/units/:id', requireAuth, requireRoles('landlord', 'maintenance'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Unit not found.' });
  }
  const { buildingId, unitNumber, floor, unitType, areaSqm, monthlyRent, occupancyStatus } = req.body ?? {};

  if (req.user?.role !== 'landlord') {
    const nextStatus = occupancyStatus ?? existing.occupancy_status;
    db.prepare('UPDATE units SET occupancy_status = ? WHERE id = ?').run(nextStatus, req.params.id);
    recordActivity({
      actor: req.user!,
      action: 'UPDATE',
      entityType: 'space',
      entityId: req.params.id,
      entityLabel: `Space ${existing.unit_number}`,
      details: `Updated space ${existing.unit_number} status from ${existing.occupancy_status} to ${nextStatus}.`,
      beforeData: { occupancyStatus: existing.occupancy_status },
      afterData: { occupancyStatus: nextStatus },
    });
    broadcastEvent('unit:updated', { id: req.params.id, action: 'updated' });
    return res.json({ ok: true });
  }

  const nextNum = typeof unitNumber === 'string' && unitNumber.trim() ? unitNumber.trim() : existing.unit_number;
  const dup = db
    .prepare('SELECT id FROM units WHERE LOWER(unit_number) = LOWER(?) AND id != ?')
    .get(nextNum, req.params.id);
  if (dup) {
    return res.status(409).json({ error: 'Another space already uses this number.' });
  }

  db.prepare(
    `UPDATE units
     SET building_id = ?, unit_number = ?, floor = ?, unit_type = ?, area_sqm = ?, monthly_rent = ?, occupancy_status = ?
     WHERE id = ?`
  ).run(
    buildingId !== undefined ? buildingId : existing.building_id,
    nextNum,
    floor !== undefined ? Math.max(0, Number(floor)) : existing.floor,
    unitType ?? existing.unit_type,
    areaSqm !== undefined ? Math.max(1, Number(areaSqm) || existing.area_sqm) : existing.area_sqm,
    typeof monthlyRent === 'number' ? Math.max(0, Math.round(monthlyRent)) : existing.monthly_rent,
    occupancyStatus ?? existing.occupancy_status,
    req.params.id
  );

  const updated = db
    .prepare(
      `SELECT u.*, b.name AS building_name, l.tenant_user_id, usr.name AS tenant_name, l.end_date AS lease_end_date
       FROM units u
       LEFT JOIN buildings b ON u.building_id = b.id
       LEFT JOIN leases l ON l.unit_id = u.id AND l.status != 'Ended'
       LEFT JOIN users usr ON l.tenant_user_id = usr.id
       WHERE u.id = ?`
    )
    .get(req.params.id);
  const mapped = mapUnitRow(updated);
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'space',
    entityId: req.params.id,
    entityLabel: `Space ${mapped.unitNumber}${mapped.buildingName ? ` (${mapped.buildingName})` : ''}`,
    details: `Updated space ${mapped.unitNumber} (Floor ${mapped.floor}, ${mapped.unitType}, ${mapped.occupancyStatus}).`,
    beforeData: {
      buildingId: existing.building_id,
      unitNumber: existing.unit_number,
      floor: existing.floor,
      unitType: existing.unit_type,
      areaSqm: existing.area_sqm,
      monthlyRent: existing.monthly_rent,
      occupancyStatus: existing.occupancy_status,
    },
    afterData: {
      buildingId: mapped.buildingId,
      unitNumber: mapped.unitNumber,
      floor: mapped.floor,
      unitType: mapped.unitType,
      areaSqm: mapped.areaSqm,
      monthlyRent: mapped.monthlyRent,
      occupancyStatus: mapped.occupancyStatus,
    },
  });
  broadcastEvent('unit:updated', { id: req.params.id, action: 'updated' });
  res.json({ ok: true, unit: mapped });
});

app.delete('/api/units/:id', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Space not found.' });
  }
  if (existing.unit_number === 'COMMON' || existing.floor === 0) {
    return res.status(409).json({ error: 'The common ground floor area cannot be deleted.' });
  }
  const activeLease = db
    .prepare(`SELECT id FROM leases WHERE unit_id = ? AND status != 'Ended'`)
    .get(req.params.id);
  if (activeLease) {
    return res.status(409).json({ error: 'Cannot delete a space with an active lease. End the lease first.' });
  }

  db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
  recordActivity({
    actor: req.user!,
    action: 'DELETE',
    entityType: 'space',
    entityId: req.params.id,
    entityLabel: `Space ${existing.unit_number}`,
    details: `Deleted space ${existing.unit_number} (Floor ${existing.floor}, ${existing.unit_type}).`,
    beforeData: {
      buildingId: existing.building_id,
      unitNumber: existing.unit_number,
      floor: existing.floor,
      unitType: existing.unit_type,
      areaSqm: existing.area_sqm,
      monthlyRent: existing.monthly_rent,
      occupancyStatus: existing.occupancy_status,
    },
  });
  broadcastEvent('unit:updated', { id: req.params.id, action: 'deleted' });
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

app.post('/api/users', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
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
  const mapped = mapUserRow(created);
  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'user',
    entityId: id,
    entityLabel: `${mapped.name} (${mapped.role})`,
    details: `Created ${mapped.role} account for ${mapped.name}${mapped.unitNumber ? ` assigned to Unit ${mapped.unitNumber}` : ''}.`,
    afterData: {
      name: mapped.name,
      email: mapped.email,
      role: mapped.role,
      unitId: mapped.unitId,
      unitNumber: mapped.unitNumber,
      badgeCode: mapped.badgeCode,
      status: mapped.status,
    },
  });
  res.status(201).json({ user: mapped });
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
  const mapped = mapUserRow(updated);
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'user',
    entityId: req.params.id,
    entityLabel: `${mapped.name} (${mapped.role})`,
    details: `Updated user profile/access for ${mapped.name}.`,
    beforeData: {
      name: existing.name,
      phone: existing.phone,
      badgeCode: existing.badge_code,
      securityVerified: Boolean(existing.security_verified),
      role: existing.role,
      unitId: existing.unit_id,
      status: existing.status,
    },
    afterData: {
      name: mapped.name,
      phone: mapped.phone,
      badgeCode: mapped.badgeCode,
      securityVerified: mapped.securityVerified,
      role: mapped.role,
      unitId: mapped.unitId,
      status: mapped.status,
    },
  });
  res.json({ user: mapped });
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

app.post('/api/leases', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const { unitId, tenantUserId, startDate, endDate, monthlyRent, depositAmount, status } = req.body ?? {};
  if (!unitId || !tenantUserId || !startDate || !endDate || !monthlyRent) {
    return res.status(400).json({ error: 'Missing required lease fields.' });
  }
  const id = `lease-${crypto.randomBytes(4).toString('hex')}`;
  const resolvedRent = Number(monthlyRent);
  const resolvedDeposit = Number(depositAmount || monthlyRent);
  const resolvedStatus = status || 'Active';

  db.prepare(
    `INSERT INTO leases (id, unit_id, tenant_user_id, start_date, end_date, monthly_rent, deposit_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, unitId, tenantUserId, startDate, endDate, resolvedRent, resolvedDeposit, resolvedStatus);

  db.prepare("UPDATE units SET occupancy_status = 'Occupied', monthly_rent = ? WHERE id = ?").run(
    resolvedRent,
    unitId
  );
  db.prepare('UPDATE users SET unit_id = ? WHERE id = ?').run(unitId, tenantUserId);

  const unitRow = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(unitId) as { unit_number?: string } | undefined;
  const tenantRow = db.prepare('SELECT name FROM users WHERE id = ?').get(tenantUserId) as { name?: string } | undefined;
  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'lease',
    entityId: id,
    entityLabel: `Unit ${unitRow?.unit_number ?? unitId} · ${tenantRow?.name ?? tenantUserId}`,
    details: `Created lease for ${tenantRow?.name ?? tenantUserId} in Unit ${unitRow?.unit_number ?? unitId} (${startDate} to ${endDate}).`,
    afterData: {
      unitId,
      unitNumber: unitRow?.unit_number ?? null,
      tenantUserId,
      tenantName: tenantRow?.name ?? null,
      startDate,
      endDate,
      monthlyRent: resolvedRent,
      depositAmount: resolvedDeposit,
      status: resolvedStatus,
    },
  });

  res.status(201).json({ id });
});

app.patch('/api/leases/:id', requireAuth, requireRoles('landlord'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Lease not found.' });
  }
  const { endDate, monthlyRent, status } = req.body ?? {};
  const nextEndDate = endDate ?? existing.end_date;
  const nextRent = typeof monthlyRent === 'number' ? monthlyRent : existing.monthly_rent;
  const nextStatus = status ?? existing.status;

  db.prepare('UPDATE leases SET end_date = ?, monthly_rent = ?, status = ? WHERE id = ?').run(
    nextEndDate,
    nextRent,
    nextStatus,
    req.params.id
  );

  const unitRow = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(existing.unit_id) as { unit_number?: string } | undefined;
  const tenantRow = db.prepare('SELECT name FROM users WHERE id = ?').get(existing.tenant_user_id) as { name?: string } | undefined;
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'lease',
    entityId: req.params.id,
    entityLabel: `Unit ${unitRow?.unit_number ?? existing.unit_id} · ${tenantRow?.name ?? existing.tenant_user_id}`,
    details: `Updated lease terms/status (${nextStatus}) for Unit ${unitRow?.unit_number ?? existing.unit_id}.`,
    beforeData: {
      endDate: existing.end_date,
      monthlyRent: existing.monthly_rent,
      status: existing.status,
    },
    afterData: {
      endDate: nextEndDate,
      monthlyRent: nextRent,
      status: nextStatus,
    },
  });

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

app.post('/api/payments', requireAuth, requireRoles('landlord', 'finance'), (req: AuthedRequest, res) => {
  const { leaseId, amount, dueDate, status, method, notes } = req.body ?? {};
  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(leaseId) as any;
  if (!lease) {
    return res.status(404).json({ error: 'Lease not found.' });
  }
  const unit = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(lease.unit_id) as any;
  const tenant = db.prepare('SELECT name FROM users WHERE id = ?').get(lease.tenant_user_id) as any;
  const id = `pay-${crypto.randomBytes(4).toString('hex')}`;
  const ref = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${unit?.unit_number || '000'}`;
  const resolvedStatus = status || 'Upcoming';
  const paidAt = resolvedStatus === 'Paid' ? new Date().toISOString() : null;
  const resolvedAmount = Number(amount || lease.monthly_rent);
  const resolvedDueDate = dueDate || new Date().toISOString().slice(0, 10);
  const resolvedMethod = method || (resolvedStatus === 'Paid' ? 'ACH Transfer' : null);

  db.prepare(
    `INSERT INTO payments (id, lease_id, unit_id, tenant_user_id, amount, due_date, paid_at, method, reference_code, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    lease.id,
    lease.unit_id,
    lease.tenant_user_id,
    resolvedAmount,
    resolvedDueDate,
    paidAt,
    resolvedMethod,
    ref,
    resolvedStatus,
    notes || ''
  );

  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'payment',
    entityId: id,
    entityLabel: `${ref} · Unit ${unit?.unit_number || lease.unit_id}`,
    details: `Created rent entry ${ref} (${resolvedStatus}) for ${tenant?.name || lease.tenant_user_id}.`,
    afterData: {
      referenceCode: ref,
      unitNumber: unit?.unit_number || null,
      tenantName: tenant?.name || null,
      amount: resolvedAmount,
      dueDate: resolvedDueDate,
      status: resolvedStatus,
      method: resolvedMethod,
      notes: notes || '',
    },
  });

  broadcastEvent('payment:updated', { id });
  res.status(201).json({ id });
});

app.patch('/api/payments/:id', requireAuth, requireRoles('landlord', 'finance'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Payment not found.' });
  }
  const { status, method, notes } = req.body ?? {};
  const nextStatus = status ?? existing.status;
  const nextPaidAt = nextStatus === 'Paid' ? existing.paid_at || new Date().toISOString() : null;
  const nextMethod = method ?? existing.method ?? (nextStatus === 'Paid' ? 'ACH Transfer' : null);
  const nextNotes = notes ?? existing.notes;

  db.prepare('UPDATE payments SET status = ?, paid_at = ?, method = ?, notes = ? WHERE id = ?').run(
    nextStatus,
    nextPaidAt,
    nextMethod,
    nextNotes,
    req.params.id
  );

  const unit = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(existing.unit_id) as any;
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'payment',
    entityId: req.params.id,
    entityLabel: `${existing.reference_code} · Unit ${unit?.unit_number || existing.unit_id}`,
    details: `Updated payment ${existing.reference_code} from ${existing.status} to ${nextStatus}.`,
    beforeData: {
      status: existing.status,
      paidAt: existing.paid_at,
      method: existing.method,
      notes: existing.notes,
    },
    afterData: {
      status: nextStatus,
      paidAt: nextPaidAt,
      method: nextMethod,
      notes: nextNotes,
    },
  });

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
  const verifiedFlag = req.user?.role === 'security' || req.user?.role === 'landlord' ? 1 : 0;
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
    verifiedFlag,
    new Date().toISOString()
  );

  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'document',
    entityId: id,
    entityLabel: title.trim(),
    details: `Uploaded document "${title.trim()}" (${fileName.trim()}).`,
    afterData: {
      title: title.trim(),
      category: category || 'Lease Agreement',
      fileName: fileName.trim(),
      mimeType: mimeType || 'text/plain',
      tenantUserId: targetUserId,
      unitId: targetUnitId,
      verifiedBySecurity: Boolean(verifiedFlag),
    },
  });

  res.status(201).json({ id });
});

app.patch('/api/documents/:id', requireAuth, requireRoles('landlord', 'security'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  const { verifiedBySecurity } = req.body ?? {};
  const nextVerified = verifiedBySecurity ? 1 : 0;
  db.prepare('UPDATE documents SET verified_by_security = ? WHERE id = ?').run(
    nextVerified,
    req.params.id
  );
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'document',
    entityId: req.params.id,
    entityLabel: existing.title,
    details: `${nextVerified ? 'Verified' : 'Unverified'} document "${existing.title}" (${existing.file_name}).`,
    beforeData: { verifiedBySecurity: Boolean(existing.verified_by_security) },
    afterData: { verifiedBySecurity: Boolean(nextVerified) },
  });
  res.json({ ok: true });
});

app.delete('/api/documents/:id', requireAuth, (req: AuthedRequest, res) => {
  const docRow = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!docRow) return res.status(404).json({ error: 'Document not found.' });
  if (req.user?.role !== 'landlord' && docRow.tenant_user_id !== req.user?.id) {
    return res.status(403).json({ error: 'Only the landlord or document owner can delete this file.' });
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  recordActivity({
    actor: req.user!,
    action: 'DELETE',
    entityType: 'document',
    entityId: req.params.id,
    entityLabel: docRow.title,
    details: `Deleted document "${docRow.title}" (${docRow.file_name}).`,
    beforeData: {
      title: docRow.title,
      category: docRow.category,
      fileName: docRow.file_name,
      mimeType: docRow.mime_type,
      tenantUserId: docRow.tenant_user_id,
      unitId: docRow.unit_id,
      verifiedBySecurity: Boolean(docRow.verified_by_security),
    },
  });
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
  const resolvedZone = zoneLabel || `Floor ${floor} Pin`;
  const resolvedCat = category || 'Plumbing';
  const resolvedPrio = priority || 'Medium';

  db.prepare(
    `INSERT INTO maintenance_requests (
      id, unit_id, floor, zone_label, pin_x, pin_y, reported_by_user_id, assigned_to_user_id,
      category, priority, title, description, status, resolution_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'usr-maint', ?, ?, ?, ?, 'Open', '', ?, ?)`
  ).run(
    id,
    unitId,
    Number(floor),
    resolvedZone,
    typeof pinX === 'number' ? pinX : 50,
    typeof pinY === 'number' ? pinY : 50,
    req.user!.id,
    resolvedCat,
    resolvedPrio,
    title.trim(),
    description.trim(),
    now,
    now
  );

  const unitRow = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(unitId) as { unit_number?: string } | undefined;
  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'maintenance',
    entityId: id,
    entityLabel: `Unit ${unitRow?.unit_number || unitId} · ${title.trim()}`,
    details: `Reported ${resolvedCat} issue (${resolvedPrio} priority) at ${resolvedZone}.`,
    afterData: {
      unitNumber: unitRow?.unit_number || null,
      floor: Number(floor),
      zoneLabel: resolvedZone,
      category: resolvedCat,
      priority: resolvedPrio,
      title: title.trim(),
      status: 'Open',
    },
  });

  broadcastEvent('maintenance:updated', { id, action: 'created' });
  res.status(201).json({ id });
});

app.patch('/api/maintenance/:id', requireAuth, requireRoles('landlord', 'maintenance', 'security'), (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_requests WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Maintenance request not found.' });
  }
  const { status, priority, resolutionNotes, assignedToUserId } = req.body ?? {};
  const now = new Date().toISOString();
  const nextStatus = status ?? existing.status;
  const nextPriority = priority ?? existing.priority;
  const nextNotes = resolutionNotes ?? existing.resolution_notes;
  const nextAssignee = assignedToUserId !== undefined ? assignedToUserId : existing.assigned_to_user_id;

  db.prepare(
    `UPDATE maintenance_requests
     SET status = ?, priority = ?, resolution_notes = ?, assigned_to_user_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextStatus, nextPriority, nextNotes, nextAssignee, now, req.params.id);

  const unitRow = db.prepare('SELECT unit_number FROM units WHERE id = ?').get(existing.unit_id) as { unit_number?: string } | undefined;
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'maintenance',
    entityId: req.params.id,
    entityLabel: `Unit ${unitRow?.unit_number || existing.unit_id} · ${existing.title}`,
    details: `Updated maintenance ticket "${existing.title}" (${nextStatus}, ${nextPriority}).`,
    beforeData: {
      status: existing.status,
      priority: existing.priority,
      resolutionNotes: existing.resolution_notes,
      assignedToUserId: existing.assigned_to_user_id,
    },
    afterData: {
      status: nextStatus,
      priority: nextPriority,
      resolutionNotes: nextNotes,
      assignedToUserId: nextAssignee,
    },
  });

  broadcastEvent('maintenance:updated', { id: req.params.id, status: nextStatus });
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
  const resolvedUnitId = unitId || 'unit-000';
  const resolvedBadge = badgeOrId || `LOG-${Math.floor(100 + Math.random() * 899)}`;
  const resolvedStatus = status || (logType === 'Incident' ? 'Flagged' : 'Checked In');
  db.prepare(
    `INSERT INTO security_logs (id, log_type, unit_id, subject_name, badge_or_id, status, notes, logged_by_user_id, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    logType,
    resolvedUnitId,
    subjectName.trim(),
    resolvedBadge,
    resolvedStatus,
    notes || '',
    req.user!.id,
    new Date().toISOString()
  );

  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'security_log',
    entityId: id,
    entityLabel: `${logType} · ${subjectName.trim()}`,
    details: `Logged ${logType} entry for ${subjectName.trim()} (${resolvedBadge}, ${resolvedStatus}).`,
    afterData: {
      logType,
      unitId: resolvedUnitId,
      subjectName: subjectName.trim(),
      badgeOrId: resolvedBadge,
      status: resolvedStatus,
      notes: notes || '',
    },
  });

  broadcastEvent('security:updated', { id }, ['landlord', 'security', 'maintenance']);
  res.status(201).json({ id });
});

app.patch('/api/security/logs/:id', requireAuth, requireRoles('landlord', 'security'), (req: AuthedRequest, res) => {
  const { status, notes } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM security_logs WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Security log not found.' });

  const nextStatus = status ?? existing.status;
  const nextNotes = notes ?? existing.notes;
  db.prepare('UPDATE security_logs SET status = ?, notes = ? WHERE id = ?').run(
    nextStatus,
    nextNotes,
    req.params.id
  );
  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'security_log',
    entityId: req.params.id,
    entityLabel: `${existing.log_type} · ${existing.subject_name}`,
    details: `Updated security log "${existing.subject_name}" from ${existing.status} to ${nextStatus}.`,
    beforeData: { status: existing.status, notes: existing.notes },
    afterData: { status: nextStatus, notes: nextNotes },
  });
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

  recordActivity({
    actor: req.user!,
    action: 'CREATE',
    entityType: 'chat_message',
    entityId: message.id,
    entityLabel: `${chan.name}`,
    details: `Posted message in ${chan.name}: "${message.body.slice(0, 80)}${message.body.length > 80 ? '…' : ''}"`,
    afterData: {
      channelId: chan.id,
      channelName: chan.name,
      bodyPreview: message.body.slice(0, 140),
    },
  });

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

app.patch('/api/settings', requireAuth, (req: AuthedRequest, res) => {
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

  recordActivity({
    actor: req.user!,
    action: 'UPDATE',
    entityType: 'settings',
    entityId: 'currency_settings',
    entityLabel: `Currency Settings (${nextSettings.currency})`,
    details: `Updated workspace currency settings (${current.currency} -> ${nextSettings.currency}).`,
    beforeData: current as unknown as Record<string, unknown>,
    afterData: nextSettings as unknown as Record<string, unknown>,
  });

  broadcastEvent('settings:updated', nextSettings);
  res.json({ settings: nextSettings });
});

// --- User Activity Logs ---
app.get('/api/activity-logs', requireAuth, (req: AuthedRequest, res) => {
  const rows =
    req.user?.role === 'tenant'
      ? db
          .prepare('SELECT * FROM activity_logs WHERE actor_user_id = ? ORDER BY timestamp DESC LIMIT 500')
          .all(req.user.id)
      : db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 500').all();

  res.json({ logs: rows.map(mapActivityLogRow) });
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

