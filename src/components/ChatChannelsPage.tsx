import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, MessageSquare, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import type { ChatChannel, ChatMessage } from '../types';

export function ChatChannelsPage() {
  const { user, notify, subscribeWs } = useAuth();
  const { t, roleLabel, formatLocalizedDateTime } = useLanguage();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await apiFetch<{ channels: ChatChannel[] }>('/api/chat/channels');
      setChannels(res.channels);
      if (res.channels.length > 0) {
        setActiveChannelId((prev) =>
          res.channels.some((c) => c.id === prev) ? prev : res.channels[0].id
        );
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load channels.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadMessages = useCallback(async (channelId: string) => {
    if (!channelId) return;
    try {
      const res = await apiFetch<{ messages: ChatMessage[] }>(
        `/api/chat/channels/${channelId}/messages`
      );
      setMessages(res.messages);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load messages.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (activeChannelId) {
      loadMessages(activeChannelId);
    }
  }, [activeChannelId, loadMessages]);

  useEffect(() => {
    return subscribeWs('chat:message', (incoming: ChatMessage) => {
      if (incoming.channelId === activeChannelId) {
        setMessages((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
        );
      }
    });
  }, [activeChannelId, subscribeWs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !activeChannelId || !user) return;
    const clientId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bodyText = draft.trim();
    const optimistic: ChatMessage = {
      id: clientId,
      channelId: activeChannelId,
      senderUserId: user.id,
      senderName: user.name,
      senderRole: user.role,
      body: bodyText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');

    try {
      await apiFetch(`/api/chat/channels/${activeChannelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ id: clientId, body: bodyText }),
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      notify(err instanceof Error ? err.message : 'Failed to send message.', 'error');
    }
  };

  return (
    <div className="space-y-6 bg-white">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          {t.chat.title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t.chat.subtitle}
        </p>
      </div>

      {loading ? (
        <div className="h-[520px] border border-slate-200 rounded-lg bg-slate-50 animate-pulse" />
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-12 h-[600px]">
          {/* Channel List */}
          <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-700">
              {t.chat.authorizedChannels} ({channels.length})
            </div>
            <div className="divide-y divide-slate-200">
              {channels.map((ch) => {
                const active = ch.id === activeChannelId;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActiveChannelId(ch.id)}
                    className={`w-full px-4 py-3.5 text-left transition-colors cursor-pointer ${
                      active ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          active ? 'text-indigo-700' : 'text-slate-900'
                        }`}
                      >
                        {ch.name}
                      </span>
                      {ch.channelType === 'staff_secure' && (
                        <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ch.description}</p>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {t.chat.accessLabel}: {ch.allowedRoles.map((r) => roleLabel(r)).join(' · ')}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Message Feed */}
          <section className="lg:col-span-8 flex flex-col bg-white min-h-0">
            {activeChannel ? (
              <>
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-indigo-700" />
                      <span>{activeChannel.name}</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">{activeChannel.description}</p>
                  </div>
                  <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">
                    {t.chat.wsLive}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
                  {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">
                      {t.chat.noMessages}
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isSelf = m.senderUserId === user?.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                        >
                          <div className="text-xs text-slate-500 mb-1">
                            <span className="font-medium text-slate-700">{m.senderName}</span> ·{' '}
                            {roleLabel(m.senderRole)} ·{' '}
                            <span className="font-mono text-[11px]">
                              {formatLocalizedDateTime(m.createdAt)}
                            </span>
                          </div>
                          <div
                            className={`max-w-[78%] px-4 py-2.5 rounded-lg text-sm border ${
                              isSelf
                                ? 'bg-indigo-50 border-indigo-200 text-slate-900'
                                : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          >
                            {m.body}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                <form
                  onSubmit={handleSend}
                  className="p-4 border-t border-slate-200 bg-white flex items-center gap-3"
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`${t.chat.msgPlaceholder} ${activeChannel.name}...`}
                    className="flex-1 h-10 px-3.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-700"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="h-10 px-4 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t.chat.sendBtn}</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                {t.chat.selectChannel}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
