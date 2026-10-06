import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';

/**
 * Offers and deals.
 *
 * One page with two tabs because they are one story: an offer becomes a deal. A
 * farmer who has just accepted something wants to see the agreement immediately,
 * not navigate somewhere else for it.
 *
 * Serves farmers and buyers identically — the backend marks each offer with
 * `isMine` and `canRespond`, so the UI never needs to know which role is looking.
 *
 * WHAT ACCEPT ACTUALLY DOES
 * -------------------------
 * Accepting is irreversible and moves real crop into a reservation, so it is
 * behind a confirmation that states the terms and says plainly that payment
 * happens off-platform. A failure here is shown verbatim: the backend's messages
 * ("the buyer now needs only 300 kg", "someone else was agreeing at the same
 * moment") are the actionable ones.
 */

const OFFER_TABS = [
  { key: 'received', label: 'To answer' },
  { key: 'sent', label: 'Sent by me' },
  { key: 'deals', label: 'Agreed deals' }
];

/** Confirmation dialog for accept / reject / counter. */
const ActionDialog = ({ action, offer, onConfirm, onClose, busy, error }) => {
  const [quantityKg, setQuantityKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (offer) {
      setQuantityKg(String(offer.quantityKg));
      setPricePerKg(String(offer.pricePerKg));
      setReason('');
    }
  }, [offer]);

  if (!action || !offer) return null;

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
    'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';

  const titles = {
    accept: 'Agree to this offer?',
    reject: 'Do not accept this offer',
    counter: 'Send a different price',
    withdraw: 'Withdraw your offer?'
  };

  const counterTotal = Number(quantityKg) * Number(pricePerKg);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog" aria-modal="true">
      <div className="bg-surface-container-lowest w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <h2 className="font-headline font-extrabold text-lg text-on-surface">{titles[action]}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs">{error}</div>
          )}

          {/* The terms, restated so nobody agrees to something they misread. */}
          <div className="p-3 rounded-xl bg-surface-container-low">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-on-surface-variant">Crop</span>
              <span className="font-semibold text-on-surface">{offer.crop}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-on-surface-variant">Quantity</span>
              <span className="font-semibold text-on-surface">{mp.formatQuantity(offer.quantityKg)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-on-surface-variant">Price per kg</span>
              <span className="font-semibold text-on-surface">₹{offer.pricePerKg}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-on-surface-variant">Transport</span>
              <span className="font-semibold text-on-surface">{offer.deliveryTermsLabel}</span>
            </div>
            <div className="flex justify-between pt-1.5 mt-1.5 border-t border-surface-container">
              <span className="text-xs font-bold text-on-surface">Total</span>
              <span className="font-headline font-extrabold text-base text-on-surface">
                {mp.formatRupees(offer.totalAmount)}
              </span>
            </div>
          </div>

          {action === 'accept' && (
            <div className="p-3 rounded-xl bg-amber-500/10">
              <p className="text-[11px] text-amber-950 leading-relaxed">
                Agreeing creates a deal and sets aside {mp.formatQuantity(offer.quantityKg)} of your
                crop, so it will no longer show as available. <strong>This cannot be undone.</strong>{' '}
                Payment and handover happen directly between you and the other party — AgriChain does
                not handle money.
              </p>
            </div>
          )}

          {action === 'counter' && (
            <>
              <div>
                <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Quantity (kg)
                </label>
                <input type="number" min="1" value={quantityKg}
                  onChange={(e) => setQuantityKg(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Your price per kg (₹)
                </label>
                <input type="number" min="1" step="0.5" value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)} className={inputClass} />
              </div>
              {counterTotal > 0 && (
                <p className="text-xs text-on-surface-variant">
                  New total: <strong className="text-on-surface">{mp.formatRupees(counterTotal)}</strong>
                </p>
              )}
            </>
          )}

          {action === 'reject' && (
            <div>
              <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Reason (optional)
              </label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. price is too low" className={inputClass} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">
            Cancel
          </button>
          <button type="button" disabled={busy}
            onClick={() => onConfirm({
              quantityKg: Number(quantityKg), pricePerKg: Number(pricePerKg), reason
            })}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold ${
              action === 'reject' || action === 'withdraw'
                ? 'bg-error-container text-on-error-container'
                : 'bg-primary text-on-primary'
            } ${busy ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}>
            {busy ? 'Working…' : {
              accept: 'Yes, agree',
              reject: 'Do not accept',
              counter: 'Send counter-offer',
              withdraw: 'Withdraw'
            }[action]}
          </button>
        </div>
      </div>
    </div>
  );
};

/** One offer row. */
const OfferCard = ({ offer, onAction }) => (
  <div className="p-4 rounded-2xl bg-surface-container-low">
    <div className="flex items-start justify-between gap-3 mb-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-headline font-bold text-sm text-on-surface">
            {mp.formatQuantity(offer.quantityKg)} {offer.crop}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.statusChipClass(offer.status)}`}>
            {offer.statusLabel}
          </span>
          {offer.parentOfferId && (
            <span className="px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[10px] font-bold">
              counter-offer
            </span>
          )}
        </div>
        <span className="text-xs text-on-surface-variant block mt-0.5">
          {offer.isMine ? `To ${offer.recipientName || 'them'}` : `From ${offer.senderName || 'them'}`}
          {offer.buyerBusinessName ? ` • ${offer.buyerBusinessName}` : ''}
        </span>
      </div>
      <div className="text-right shrink-0">
        <span className="font-headline font-extrabold text-lg text-on-surface block leading-tight">
          ₹{offer.pricePerKg}<span className="text-xs font-normal text-on-surface-variant">/kg</span>
        </span>
        <span className="text-[11px] text-on-surface-variant">{mp.formatRupees(offer.totalAmount)} total</span>
      </div>
    </div>

    <div className="flex items-center gap-3 flex-wrap text-[11px] text-on-surface-variant mb-3">
      <span className="inline-flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">local_shipping</span>
        {offer.deliveryTermsLabel}
      </span>
      {offer.expiresAt && (
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">schedule</span>
          Valid until {new Date(offer.expiresAt).toLocaleString('en-IN',
            { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        </span>
      )}
    </div>

    <div className="flex items-center gap-2 flex-wrap">
      {/* Only the recipient of a pending offer may act on it. */}
      {offer.canRespond && (
        <>
          <button type="button" onClick={() => onAction('accept', offer)}
            className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90">
            Agree to Offer
          </button>
          <button type="button" onClick={() => onAction('counter', offer)}
            className="px-4 py-2 rounded-full bg-surface-container-high hover:bg-surface-container text-on-surface text-xs font-bold">
            Send different price
          </button>
          <button type="button" onClick={() => onAction('reject', offer)}
            className="px-3 py-2 rounded-full hover:bg-surface-container text-on-surface-variant text-xs font-semibold">
            Do not accept
          </button>
        </>
      )}
      {offer.isMine && offer.status === 'pending' && (
        <button type="button" onClick={() => onAction('withdraw', offer)}
          className="px-3 py-2 rounded-full hover:bg-surface-container text-on-surface-variant text-xs font-semibold">
          Withdraw
        </button>
      )}
      {offer.conversationId && (
        <a href={`/marketplace/messages/${offer.conversationId}`}
          className="px-3 py-2 rounded-full hover:bg-surface-container text-primary text-xs font-bold">
          Open chat
        </a>
      )}
    </div>
  </div>
);

/** One agreed deal. */
const DealCard = ({ deal, onStatus, busy }) => (
  <div className="p-4 rounded-2xl bg-surface-container-low">
    <div className="flex items-start justify-between gap-3 mb-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-headline font-bold text-sm text-on-surface">Deal #{deal.id}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.statusChipClass(deal.status)}`}>
            {deal.statusLabel}
          </span>
        </div>
        <span className="text-xs text-on-surface-variant block mt-0.5">
          {deal.myRole === 'farmer' ? `Selling to ${deal.buyerName}` : `Buying from ${deal.farmerName}`}
        </span>
      </div>
      <div className="text-right shrink-0">
        {/* "Agreed", not "offered" — these are the settled terms. */}
        <span className="font-headline font-extrabold text-lg text-primary block leading-tight">
          {mp.formatRupees(deal.agreedTotal)}
        </span>
        <span className="text-[11px] text-on-surface-variant">
          {mp.formatQuantity(deal.agreedQuantityKg)} at ₹{deal.agreedPricePerKg}/kg
        </span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] mb-3">
      <span className="text-on-surface-variant">Crop</span>
      <span className="font-semibold text-on-surface text-right">{deal.crop}</span>
      <span className="text-on-surface-variant">Transport</span>
      <span className="font-semibold text-on-surface text-right">{deal.deliveryTermsLabel}</span>
      {deal.fulfillmentDate && (
        <>
          <span className="text-on-surface-variant">Handover date</span>
          <span className="font-semibold text-on-surface text-right">
            {mp.formatShortDate(deal.fulfillmentDate)}
          </span>
        </>
      )}
      {deal.deliveryLocation && (
        <>
          <span className="text-on-surface-variant">Where</span>
          <span className="font-semibold text-on-surface text-right truncate">{deal.deliveryLocation}</span>
        </>
      )}
    </div>

    {deal.statusNote && (
      <p className="text-[11px] text-on-surface-variant italic mb-2">Note: {deal.statusNote}</p>
    )}

    {/* Only transitions the backend allows are offered. */}
    {deal.allowedNextStatuses.length > 0 && (
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-surface-container">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
          Update:
        </span>
        {deal.allowedNextStatuses.map((status) => (
          <button key={status} type="button" disabled={busy}
            onClick={() => onStatus(deal, status)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold disabled:opacity-50 ${
              status === 'cancelled' || status === 'disputed'
                ? 'bg-error-container text-on-error-container'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container'
            }`}>
            {status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
    )}

    <p className="text-[10px] text-on-surface-variant mt-2">{deal.paymentNote}</p>
  </div>
);

const MarketplaceOffers = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [tab, setTab] = useState('received');
  const [offers, setOffers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState({ action: null, offer: null, error: '' });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    if (tab === 'deals') {
      const result = await mp.listDeals();
      if (result.ok) setDeals(result.data); else setError(result.message);
    } else {
      const result = await mp.listOffers({ direction: tab });
      if (result.ok) setOffers(result.data); else setError(result.message);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async ({ quantityKg, pricePerKg, reason }) => {
    const { action, offer } = dialog;
    setBusy(true);
    setDialog((d) => ({ ...d, error: '' }));

    let result;
    if (action === 'accept') result = await mp.acceptOffer(offer.id);
    else if (action === 'reject') result = await mp.rejectOffer(offer.id, reason);
    else if (action === 'withdraw') result = await mp.withdrawOffer(offer.id);
    else result = await mp.counterOffer(offer.id, { quantityKg, pricePerKg });

    setBusy(false);

    if (!result.ok) {
      // The backend's message is the useful one — it names the actual obstacle.
      setDialog((d) => ({ ...d, error: result.message }));
      return;
    }

    setDialog({ action: null, offer: null, error: '' });
    if (action === 'accept') {
      const dealId = result.data?.deal?.id;
      setNotice(
        `Deal agreed. ${mp.formatQuantity(offer.quantityKg)} of your ${offer.crop} is now set aside.` +
        ' Payment and handover happen directly with the other party.'
      );
      setTab('deals');
      if (dealId) navigate('/marketplace/offers');
    } else {
      setNotice({
        reject: 'Offer declined.',
        withdraw: 'Offer withdrawn.',
        counter: 'Counter-offer sent.'
      }[action]);
      load();
    }
  };

  const handleDealStatus = async (deal, status) => {
    setBusy(true);
    const result = await mp.updateDealStatus(deal.id, status);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setNotice(`Deal #${deal.id} updated to ${status.replace(/_/g, ' ')}.`);
    load();
  };

  const items = tab === 'deals' ? deals : offers;

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search offers..." />

        <main className="pt-24 px-8 pb-12">
          <section className="mb-6">
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
              Offers &amp; Deals
            </h1>
            <p className="text-base text-on-surface-variant mt-1.5">
              Agree a price, then track what you have promised.
            </p>
          </section>

          {notice && (
            <div className="mb-4 flex items-start justify-between gap-3 p-4 rounded-2xl bg-primary-fixed/20">
              <span className="text-xs text-on-surface">{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 p-4 rounded-2xl bg-error-container text-on-error-container">
              <span className="text-xs">{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
            <div className="flex gap-2 mb-5 flex-wrap">
              {OFFER_TABS.map((option) => (
                <button key={option.key} type="button" onClick={() => setTab(option.key)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                    tab === option.key
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}>
                  {option.label}
                </button>
              ))}
            </div>

            {loading && (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="text-center py-14 px-4">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2 block">
                  {tab === 'deals' ? 'handshake' : 'gavel'}
                </span>
                <p className="text-sm font-semibold text-on-surface mb-1">
                  {tab === 'received' && 'No offers waiting for your answer'}
                  {tab === 'sent' && 'You have not sent any offers yet'}
                  {tab === 'deals' && 'No agreed deals yet'}
                </p>
                <p className="text-xs text-on-surface-variant mb-5 max-w-sm mx-auto">
                  {tab === 'deals'
                    ? 'When you and a buyer agree a price, the deal appears here.'
                    : 'Find a buyer for your crop and send them a price.'}
                </p>
                <button type="button" onClick={() => navigate('/marketplace')}
                  className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold">
                  Find buyers
                </button>
              </div>
            )}

            {!loading && items.length > 0 && (
              <div className="space-y-3">
                {tab === 'deals'
                  ? deals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} busy={busy} onStatus={handleDealStatus} />
                  ))
                  : offers.map((offer) => (
                    <OfferCard key={offer.id} offer={offer}
                      onAction={(action, o) => setDialog({ action, offer: o, error: '' })} />
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <ActionDialog
        action={dialog.action}
        offer={dialog.offer}
        busy={busy}
        error={dialog.error}
        onConfirm={handleConfirm}
        onClose={() => setDialog({ action: null, offer: null, error: '' })}
      />
    </div>
  );
};

export default MarketplaceOffers;
