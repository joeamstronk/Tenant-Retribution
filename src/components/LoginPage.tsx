import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APP_LOGO_PATH, LanguageSwitcher, useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { DemoAccount } from '../types';

export function LoginPage() {
  const { login, notify } = useAuth();
  const { t, roleLabel } = useLanguage();
  const [email, setEmail] = useState('landlord@meridianhouse.io');
  const [password, setPassword] = useState('meridian2026');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    apiFetch<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts')
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {
        // fallback if initial fetch fails
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedInUser = await login(email, password);
      notify(`${signedInUser.name} (${roleLabel(signedInUser.role)})`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoFillAndLogin = async (acct: DemoAccount) => {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
    setSubmitting(true);
    try {
      const signedInUser = await login(acct.email, acct.password);
      notify(`${roleLabel(signedInUser.role)} · ${signedInUser.name}`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const matchedPreview = demoAccounts.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase()
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <img
              src={APP_LOGO_PATH}
              alt="Meridian House Logo"
              className="w-8 h-9 object-contain shrink-0"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-slate-900">
              {t.brandName}
            </span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              {t.headerTagline}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
        {/* Left: Pure White Sign-In & Auto Role Detection */}
        <section className="lg:col-span-6 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto lg:mx-0">
            <p className="text-xs font-medium text-indigo-700 mb-2">
              {t.login.kicker}
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 mb-3">
              {t.login.title}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-7">
              {t.login.subtitle}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t.login.emailLabel}
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@meridianhouse.io"
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
                />
                {matchedPreview && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {t.login.detectedAccount}: <span className="font-medium text-slate-800">{matchedPreview.name}</span> ·{' '}
                    <span className="font-medium text-indigo-700">{roleLabel(matchedPreview.role)}</span>
                    {matchedPreview.unitNumber ? ` · Unit ${matchedPreview.unitNumber}` : ''}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t.login.passwordLabel}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.login.passwordPlaceholder}
                    className="w-full h-10 pl-3 pr-10 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 px-4 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{submitting ? t.login.submitting : t.login.submit}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Demo Accounts for Instant Testing */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  {t.login.demoTitle}
                </span>
                <span className="text-xs font-mono text-slate-400">pw: meridian2026</span>
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md bg-white">
                {demoAccounts.map((acct) => {
                  const isSelected = acct.email.toLowerCase() === email.trim().toLowerCase();
                  return (
                    <button
                      key={acct.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDemoFillAndLogin(acct)}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {roleLabel(acct.role)} · {acct.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {t.login.demoSubtitles[acct.role] ?? acct.subtitle}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-indigo-700 whitespace-nowrap shrink-0">
                        {t.login.demoSignIn}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Right: Clean Architectural Showcase on White */}
        <section className="lg:col-span-6 flex flex-col justify-between border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="flex-1 min-h-[320px] bg-slate-50 relative">
            {!imageFailed ? (
              <img
                src="/src/assets/images/meridian_building_facade_1794629122160.jpg"
                alt="Meridian House"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-500">
                <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-700">{t.brandName}</p>
              </div>
            )}
          </div>

          <div className="p-6 bg-white border-t border-slate-200 grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">{t.login.buildingScope}</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{t.login.buildingScopeVal}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">{t.login.floorLevels}</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{t.login.floorLevelsVal}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">{t.login.roleChannels}</p>
              <p className="text-sm font-semibold text-slate-900">{t.login.roleChannelsVal}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
