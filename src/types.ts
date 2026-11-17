export type UserRole = 'landlord' | 'finance' | 'security' | 'maintenance' | 'tenant';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  unitId: string | null;
  unitNumber?: string | null;
  phone: string;
  badgeCode: string;
  securityVerified: boolean;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  unitNumber: string | null;
  subtitle: string;
}

export interface BuildingUnit {
  id: string;
  unitNumber: string;
  floor: number;
  unitType: 'Studio' | '1BR' | '2BR' | 'Penthouse' | 'Commercial';
  areaSqm: number;
  monthlyRent: number;
  occupancyStatus: 'Occupied' | 'Vacant' | 'Maintenance';
  tenantUserId?: string | null;
  tenantName?: string | null;
  leaseEndDate?: string | null;
}

export interface Lease {
  id: string;
  unitId: string;
  unitNumber: string;
  floor: number;
  tenantUserId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  status: 'Active' | 'Expiring Soon' | 'Ended';
}

export interface RentPayment {
  id: string;
  leaseId: string;
  unitId: string;
  unitNumber: string;
  tenantUserId: string;
  tenantName: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  method: string | null;
  referenceCode: string;
  status: 'Paid' | 'Upcoming' | 'Overdue';
  notes: string;
}

export interface TenantDocument {
  id: string;
  tenantUserId: string;
  tenantName: string;
  unitId: string;
  unitNumber: string;
  title: string;
  category: 'Lease Agreement' | 'ID Verification' | 'Inspection' | 'Receipt';
  fileName: string;
  mimeType: string;
  fileData: string;
  verifiedBySecurity: boolean;
  uploadedAt: string;
}

export interface MaintenanceRequest {
  id: string;
  unitId: string;
  unitNumber: string;
  floor: number;
  zoneLabel: string;
  pinX: number;
  pinY: number;
  reportedByUserId: string;
  reportedByName: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  category: 'Plumbing' | 'Electrical' | 'HVAC' | 'Access/Lock' | 'Structural';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  title: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  resolutionNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityLog {
  id: string;
  logType: 'Visitor' | 'Delivery' | 'Incident' | 'Patrol';
  unitId: string | null;
  unitNumber: string | null;
  subjectName: string;
  badgeOrId: string;
  status: 'Checked In' | 'Checked Out' | 'Flagged' | 'Resolved';
  notes: string;
  loggedByUserId: string;
  loggedByName: string;
  timestamp: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  channelType: 'tenant_support' | 'maintenance_direct' | 'finance_billing' | 'security_desk' | 'staff_secure';
  allowedRoles: UserRole[];
  unitId: string | null;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderUserId: string;
  senderName: string;
  senderRole: UserRole;
  body: string;
  createdAt: string;
}

export interface DashboardSummary {
  metrics: {
    activeUnits: number;
    totalUnits: number;
    monthlyCollected: number;
    upcomingDue: number;
    overdueAmount: number;
    openMaintenance: number;
    urgentMaintenance: number;
    verifiedTenants: number;
  };
  upcomingPayments: RentPayment[];
  openTickets: MaintenanceRequest[];
  units: BuildingUnit[];
}

export type CurrencyCode = 'IDR' | 'USD' | 'SGD' | 'EUR';

export interface CurrencySettings {
  currency: CurrencyCode;
  exchangeRates: Record<CurrencyCode, number>;
  showDecimals: boolean;
}

export type AppSection =
  | 'dashboard'
  | 'users'
  | 'finance'
  | 'security'
  | 'maintenance'
  | 'tenant'
  | 'chat'
  | 'settings';

