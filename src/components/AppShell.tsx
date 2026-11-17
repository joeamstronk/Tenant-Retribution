import React, { useState } from 'react';
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { APP_LOGO_PATH, LanguageSwitcher, useLanguage } from '../context/LanguageContext';
import type { AppSection, UserRole } from '../types';

interface NavDef {
  id: AppSection;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_DEFS: NavDef[] = [
  { id: 'dashboard', icon: LayoutDashboard, roles: ['landlord', 'finance', 'security', 'maintenance'] },
  { id: 'users', icon: Users, roles: ['landlord', 'finance', 'security'] },
  { id: 'finance', icon: CreditCard, roles: ['landlord', 'finance'] },
  { id: 'security', icon: ShieldCheck, roles: ['landlord', 'security'] },
  { id: 'maintenance', icon: Wrench, roles: ['landlord', 'maintenance', 'security'] },
  { id: 'tenant', icon: MapPin, roles: ['tenant', 'landlord'] },
  { id: 'chat', icon: MessageSquare, roles: ['landlord', 'finance', 'security', 'maintenance', 'tenant'] },
  { id: 'settings', icon: Settings, roles: ['landlord', 'finance', 'security', 'maintenance', 'tenant'] },
];

interface AppShellProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  activeSection,
  onSelectSection,
  primaryAction,
  children,
}: AppShellProps) {
  const { user, logout } = useAuth();
  const { currency } = useCurrency();
  const { t, roleLabel } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const visibleNav = NAV_DEFS.filter((item) => item.roles.includes(user.role));
  const currentNav = visibleNav.find((n) => n.id === activeSection) ?? visibleNav[0];

  const handleNavClick = (id: AppSection) => {
    onSelectSection(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 bg-white shrink-0">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center gap-2.5">
          <img
            src={APP_LOGO_PATH}
            alt="Meridian House Logo"
            className="w-7 h-8 object-contain shrink-0"
          />
          <span className="font-display text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap">
            {t.brandName}
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Workspace Navigation">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-100 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-700' : 'text-slate-400'}`} />
                <span className="truncate">{t.nav[item.id]}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="text-xs font-medium text-slate-900 truncate">{user.name}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {roleLabel(user.role)}
            {user.unitNumber ? ` · Unit ${user.unitNumber}` : ''}
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-3 w-full h-9 px-3 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.common.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/20"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-full bg-white border-r border-slate-200 flex flex-col z-50">
            <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={APP_LOGO_PATH}
                  alt="Meridian House Logo"
                  className="w-7 h-8 object-contain shrink-0"
                />
                <span className="font-display text-base font-semibold text-slate-900">
                  {t.brandName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-slate-100 text-indigo-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{t.nav[item.id]}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <div className="text-xs font-medium text-slate-900">{user.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{roleLabel(user.role)}</div>
              <button
                type="button"
                onClick={() => logout()}
                className="mt-3 w-full h-9 px-3 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.common.signOut}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Pure White Content Area */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between gap-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm whitespace-nowrap truncate">
              <span className="text-slate-400">{t.brandName}</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-medium text-slate-900">
                {currentNav ? t.nav[currentNav.id] : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              {user.name} · {roleLabel(user.role)}
              {user.unitNumber ? ` · Unit ${user.unitNumber}` : ''}
            </span>
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              title={t.nav.settings}
              className="h-7 px-2 border border-slate-200 bg-white hover:bg-slate-50 rounded font-mono text-xs font-medium text-slate-700 cursor-pointer whitespace-nowrap"
            >
              {currency}
            </button>
            <LanguageSwitcher />
            {primaryAction}
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
