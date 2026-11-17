import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { getDefaultSectionForRole } from './lib/api';
import type { AppSection } from './types';
import { LoginPage } from './components/LoginPage';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './components/DashboardPage';
import { UsersLeasesPage } from './components/UsersLeasesPage';
import { FinancePage } from './components/FinancePage';
import { SecurityPage } from './components/SecurityPage';
import { MaintenancePage } from './components/MaintenancePage';
import { TenantPortalPage } from './components/TenantPortalPage';
import { ChatChannelsPage } from './components/ChatChannelsPage';
import { SettingsPage } from './components/SettingsPage';

function WorkspaceRouter() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const [section, setSection] = useState<AppSection>('dashboard');
  const [maintenanceFocus, setMaintenanceFocus] = useState<{
    floor?: number;
    unitNumber?: string;
    pinId?: string;
  } | null>(null);

  useEffect(() => {
    if (user) {
      setSection(getDefaultSectionForRole(user.role));
      setMaintenanceFocus(null);
    }
  }, [user?.id, user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-sm text-slate-500">
        {t.common.loadingWorkspace}
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleNavigate = (
    target: AppSection,
    focus?: { floor?: number; unitNumber?: string; pinId?: string }
  ) => {
    setMaintenanceFocus(focus ?? null);
    setSection(target);
  };

  return (
    <AppShell activeSection={section} onSelectSection={(s) => handleNavigate(s)}>
      {section === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {section === 'users' && <UsersLeasesPage />}
      {section === 'finance' && <FinancePage />}
      {section === 'security' && <SecurityPage onNavigate={(s) => handleNavigate(s)} />}
      {section === 'maintenance' && (
        <MaintenancePage
          initialFocus={maintenanceFocus}
          onNavigate={(s) => handleNavigate(s)}
        />
      )}
      {section === 'tenant' && <TenantPortalPage />}
      {section === 'chat' && <ChatChannelsPage />}
      {section === 'settings' && <SettingsPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CurrencyProvider>
          <WorkspaceRouter />
        </CurrencyProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
