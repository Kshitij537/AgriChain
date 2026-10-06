import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';

/**
 * Marketplace messages: conversation list and thread.
 *
 * Serves both farmers and buyers from one page — the backend tells each side who
 * their counterparty is, so no role branching is needed in the UI.
 *
 * REALTIME
 * --------
 * Polling, not sockets. AgriChain has no realtime infrastructure and the brief
 * says not to add technologies unnecessarily; a 6-second poll while a thread is
 * open is indistinguishable from push for a negotiation that moves in minutes, and
 * it costs zero new dependencies. `visibilitychange` pauses it on a backgrounded
 * tab so a phone is not polling in the user's pocket.
 *
 * PRIVACY
 * -------
 * The thread shows a display name only. No phone number, no email — the backend's
 * conversation projection does not carry them, so the UI cannot leak them even by
 * accident. A user who wants to share a number types it into a message.
 */

const POLL_INTERVAL_MS = 6000;

/** An attachment, fetched with the auth token because attachments are private. */
const MessageAttachment = ({ messageId }) => {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoke = null;
    (async () => {
      const objectUrl = await mp.fetchAttachmentBlob(messageId);
      if (objectUrl) { setUrl(objectUrl); revoke = objectUrl; } else setFailed(true);
    })();
    // Object URLs leak memory until revoked.
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [messageId]);

  if (failed) {
    return <span className="text-[11px] italic opacity-70">Photo could not be loaded</span>;
  }
  if (!url) {
    return <span className="text-[11px] italic opacity-70">Loading photo…</span>;
  }
  return <img src={url} alt="Attachment" className="rounded-xl max-w-full max-h-64 object-contain" />;
};

/** One message bubble. */
const MessageBubble = ({ message }) => {
  // Platform-generated offer events read as a centred note, not as either side
  // talking, so the negotiation timeline stays legible.
  if (message.messageType === 'offer_event' || message.messageType === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-[11px] font-semibold text-on-surface-variant text-center max-w-[85%]">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${message.isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl ${
        message.isMine
          ? 'bg-primary text-on-primary rounded-br-md'
          : 'bg-surface-container-high text-on-surface rounded-bl-md'
      }`}>
        {message.hasAttachment && (
          <div className="mb-1.5"><MessageAttachment messageId={message.id} /></div>
        )}
        {message.content && (
          // Content arrives HTML-escaped from the backend; React escapes again.
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        )}
        <span className={`text-[10px] block mt-1 ${message.isMine ? 'opacity-70' : 'text-on-surface-variant'}`}>
          {new Date(message.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
          {message.isMine && (
            <span className="ml-1">{message.status === 'read' ? '✓✓' : '✓'}</span>
          )}
        </span>
      </div>
    </div>
  );
};

/**
 * Reason picker for reporting a conversation.
 *
 * The reason is a short code the backend truncates to 48 characters and stores
 * for an administrator to act on; the fixed list keeps those codes consistent
 * instead of free text no one can group or count.
 */
const REPORT_REASONS = [
  ['spam', 'Spam or advertising'],
  ['abusive', 'Abusive or threatening'],
  ['fake_listing', 'Fake listing or false claims'],
  ['payment_dispute', 'Payment problem'],
  ['other', 'Something else']
];

const ReportDialog = ({ counterpartyName, busy, onReport, onClose }) => {
  const [reason, setReason] = useState(REPORT_REASONS[0][0]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-surface-container-lowest rounded-3xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h3 className="font-headline font-extrabold text-lg text-on-surface">
              Report this conversation
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              About {counterpartyName}. An administrator will review it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface shrink-0">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-1.5 mb-5">
          {REPORT_REASONS.map(([value, label]) => (
            <label key={value}
              className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-surface-container-low cursor-pointer">
              <input type="radio" name="report-reason" value={value}
                checked={reason === value} onChange={() => setReason(value)}
                className="accent-primary" />
              <span className="text-sm text-on-surface">{label}</span>
            </label>
          ))}
        </div>

        <p className="text-[11px] text-on-surface-variant mb-4">
          Reporting does not block them. Use the block button as well if you do not
          want further messages.
        </p>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold">
            Cancel
          </button>
          <button onClick={() => onReport(reason)} disabled={busy}
            className="flex-1 px-4 py-3 rounded-full bg-error text-on-error text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? 'Reporting…' : 'Report'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MarketplaceMessages = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(conversationId ? Number(conversationId) : null);
  const [messages, setMessages] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const loadConversations = useCallback(async () => {
    const result = await mp.listConversations();
    if (result.ok) setConversations(result.data);
    else setError(result.message);
    setLoadingList(false);
  }, []);

  const loadThread = useCallback(async (id, { quiet = false } = {}) => {
    if (!id) return;
    if (!quiet) setLoadingThread(true);
    const result = await mp.getMessages(id);
    if (result.ok) {
      setMessages(result.data);
      setActiveConversation(result.meta.conversation);
      setHasMore(result.meta.hasMore);
      setNextBefore(result.meta.nextBefore);
      setError('');
    } else if (!quiet) {
      setError(result.message);
    }
    if (!quiet) setLoadingThread(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  /**
   * Clears the unread marker for a thread the user is actually looking at.
   *
   * Nothing called this before, so a thread stayed unread for ever: the badge in
   * the list and the counts in the sidebar never went down once they went up.
   * The list is reloaded afterwards because the count it shows comes from the
   * server, not from local state.
   */
  const markRead = useCallback(async (id) => {
    if (!id) return;
    const result = await mp.markConversationRead(id);
    if (result.ok) loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    markRead(activeId);
  }, [activeId, loadThread, markRead]);

  // Poll only while a thread is open and the tab is visible.
  useEffect(() => {
    if (!activeId) return undefined;
    let timer = null;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        loadThread(activeId, { quiet: true });
        // A message arriving in the thread on screen has been seen, so it is
        // marked read rather than briefly showing an unread badge.
        markRead(activeId);
      }
    };
    timer = setInterval(tick, POLL_INTERVAL_MS);

    const onVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeId, loadThread, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setSending(true);
    const result = await mp.sendMessage(activeId, text);
    setSending(false);
    if (!result.ok) { setError(result.message); return; }
    setDraft('');
    setMessages((prev) => [...prev, result.data]);
    loadConversations();
  };

  const handleAttach = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeId) return;
    setSending(true);
    const result = await mp.sendAttachment(activeId, file, draft.trim());
    setSending(false);
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) { setError(result.message); return; }
    setDraft('');
    loadThread(activeId, { quiet: true });
  };

  /**
   * Blocks or unblocks the other side of this thread.
   *
   * The backend already supported this and exposed `blockedByMe`, which this page
   * was reading to disable the composer — but nothing could ever set it, so the
   * flag was permanently false and there was no way out of an unwanted thread.
   */
  const handleToggleBlock = async () => {
    if (!activeId || !activeConversation) return;
    const blocking = !activeConversation.blockedByMe;

    setBusy(true);
    const result = await mp.blockConversation(activeId, blocking);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }

    setNotice(blocking
      ? 'Blocked. They can no longer message you in this conversation.'
      : 'Unblocked. They can message you again.');
    loadThread(activeId, { quiet: true });
    loadConversations();
  };

  /** Reports the other side to an administrator. */
  const handleReport = async (reason) => {
    if (!activeConversation) return;
    setBusy(true);
    const result = await mp.reportEntity({
      entityType: 'conversation',
      entityId: activeId,
      reportedUserId: activeConversation.counterparty?.userId,
      reason
    });
    setBusy(false);
    setReportOpen(false);
    if (!result.ok) { setError(result.message); return; }
    setNotice('Reported. An administrator will look at this conversation.');
  };

  const handleLoadOlder = async () => {
    if (!nextBefore) return;
    const result = await mp.getMessages(activeId, { before: nextBefore });
    if (result.ok) {
      setMessages((prev) => [...result.data, ...prev]);
      setHasMore(result.meta.hasMore);
      setNextBefore(result.meta.nextBefore);
    }
  };

  const blocked = activeConversation?.blockedByMe || activeConversation?.blockedByThem;

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search messages..." />

        <main className="pt-24 px-8 pb-12">
          <section className="mb-6">
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
              Messages
            </h1>
            <p className="text-base text-on-surface-variant mt-1.5">
              Private conversations with buyers about your crop.
            </p>
          </section>

          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 p-4 rounded-2xl bg-error-container text-on-error-container">
              <span className="text-xs">{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          {notice && (
            <div className="mb-4 flex items-center justify-between gap-3 p-4 rounded-2xl bg-primary-container text-on-primary-container">
              <span className="text-xs font-semibold">{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Conversation list */}
            <div className="lg:col-span-4 bg-surface-container-lowest rounded-3xl p-4 shadow-sm">
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block px-2 mb-3">
                Conversations
              </span>

              {loadingList && (
                <div className="flex items-center justify-center py-10">
                  <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                </div>
              )}

              {!loadingList && conversations.length === 0 && (
                <div className="text-center py-10 px-4">
                  <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2 block">forum</span>
                  <p className="text-sm font-semibold text-on-surface mb-1">No conversations yet</p>
                  <p className="text-xs text-on-surface-variant mb-4">
                    Contact a buyer from the marketplace to start talking.
                  </p>
                  <button type="button" onClick={() => navigate('/marketplace')}
                    className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold">
                    Find buyers
                  </button>
                </div>
              )}

              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {conversations.map((conversation) => (
                  <button key={conversation.id} type="button"
                    onClick={() => { setActiveId(conversation.id); navigate(`/marketplace/messages/${conversation.id}`); }}
                    className={`w-full text-left p-3 rounded-2xl transition-colors ${
                      conversation.id === activeId
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-surface-container-low border border-transparent'
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-headline font-bold text-sm text-on-surface block truncate">
                          {conversation.counterparty.name}
                        </span>
                        <span className="text-[11px] text-on-surface-variant block">
                          {conversation.crop ? `About ${conversation.crop}` : 'Marketplace'}
                          {conversation.offeredPricePerKg ? ` • ₹${conversation.offeredPricePerKg}/kg advertised` : ''}
                        </span>
                        {conversation.lastMessagePreview && (
                          <span className="text-[11px] text-on-surface-variant block truncate mt-0.5">
                            {conversation.lastMessagePreview}
                          </span>
                        )}
                      </div>
                      {conversation.unreadCount > 0 && (
                        <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Thread */}
            <div className="lg:col-span-8 bg-surface-container-lowest rounded-3xl shadow-sm flex flex-col min-h-[60vh]">
              {!activeId && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">chat</span>
                  <p className="text-sm text-on-surface-variant">
                    Choose a conversation to read it.
                  </p>
                </div>
              )}

              {activeId && (
                <>
                  <div className="flex items-center justify-between gap-3 p-4 border-b border-surface-container">
                    <div className="min-w-0">
                      <span className="font-headline font-bold text-base text-on-surface block truncate">
                        {activeConversation?.counterparty?.name || 'Conversation'}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        {activeConversation?.counterparty?.role === 'buyer' ? 'Buyer' : 'Farmer'}
                        {activeConversation?.crop ? ` • ${activeConversation.crop}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Only the buyer who owns the requirement has a page for
                          it; /buyer/requirements is buyer-gated, and sending a
                          farmer there would bounce them. The previous target,
                          /marketplace/requirements/:id, was not a route at all. */}
                      {activeConversation?.requirementId && activeConversation?.mySide === 'buyer' && (
                        <button type="button"
                          onClick={() => navigate(`/buyer/requirements/${activeConversation.requirementId}`)}
                          className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface text-[11px] font-bold">
                          View requirement
                        </button>
                      )}
                      <button type="button" onClick={() => navigate('/marketplace/offers')}
                        className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold">
                        Offers
                      </button>
                      <button type="button" onClick={() => setReportOpen(true)} disabled={busy}
                        title="Report this conversation"
                        className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant disabled:opacity-50">
                        <span className="material-symbols-outlined text-lg">flag</span>
                      </button>
                      <button type="button" onClick={handleToggleBlock} disabled={busy}
                        title={activeConversation?.blockedByMe ? 'Unblock' : 'Block'}
                        className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant disabled:opacity-50">
                        <span className="material-symbols-outlined text-lg">
                          {activeConversation?.blockedByMe ? 'lock_open' : 'block'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
                    {loadingThread && (
                      <div className="flex items-center justify-center py-10">
                        <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                      </div>
                    )}

                    {!loadingThread && hasMore && (
                      <button type="button" onClick={handleLoadOlder}
                        className="w-full py-2 mb-2 text-[11px] font-bold text-primary hover:underline">
                        Load older messages
                      </button>
                    )}

                    {!loadingThread && messages.length === 0 && (
                      <p className="text-center text-xs text-on-surface-variant py-10">
                        No messages yet. Say hello and tell them about your crop.
                      </p>
                    )}

                    {messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                    <div ref={bottomRef} />
                  </div>

                  <div className="p-4 border-t border-surface-container">
                    {blocked ? (
                      <p className="text-xs text-on-surface-variant text-center py-2">
                        {activeConversation.blockedByMe
                          ? 'You blocked this conversation.'
                          : 'This conversation has been blocked.'}
                      </p>
                    ) : (
                      <div className="flex items-end gap-2">
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                          onChange={handleAttach} className="hidden" id="mp-attachment" />
                        <label htmlFor="mp-attachment"
                          className="w-10 h-10 rounded-xl bg-surface-container-high hover:bg-surface-container flex items-center justify-center cursor-pointer shrink-0"
                          title="Send a photo">
                          <span className="material-symbols-outlined text-on-surface text-xl">image</span>
                        </label>
                        <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                          }}
                          placeholder="Write a message…"
                          className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high text-sm text-on-surface resize-none focus:outline-none focus:border-primary" />
                        <button type="button" onClick={handleSend} disabled={!draft.trim() || sending}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            draft.trim() && !sending
                              ? 'bg-primary text-on-primary hover:opacity-90'
                              : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                          }`}>
                          <span className="material-symbols-outlined text-xl">send</span>
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-on-surface-variant mt-2">
                      Do not share your bank details. Payment happens directly between you and the buyer.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {reportOpen && activeConversation && (
        <ReportDialog
          counterpartyName={activeConversation.counterparty?.name || 'this user'}
          busy={busy}
          onReport={handleReport}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
};

export default MarketplaceMessages;
