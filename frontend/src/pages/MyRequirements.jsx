import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';
import RequirementDialog from '../components/marketplace/RequirementDialog';
import {
  ContactDialog, OfferDialog, eligibleRequirements
} from '../components/marketplace/ApproachDialogs';

/**
 * My Requirements — the buyer's own postings, and who can fill them.
 *
 * This is where a posted requirement stops being a dead end. The backend has
 * always been able to answer "which farmers can fill this?"
 * (GET /api/buyer-requirements/:id/matching-farmers) but nothing called it, so a
 * buyer posted a requirement and then had no way to see the answer. Expanding a
 * requirement here asks that question and offers the two actions that follow
 * from it.
 *
 * WHAT CAN BE DONE TO A REQUIREMENT, AND WHEN
 * -------------------------------------------
 * The buttons mirror what requirementService actually permits, so the UI never
 * offers an action the API will refuse:
 *
 *   publish  draft only            — draft -> active, makes it visible to farmers
 *   edit     not closed/cancelled/fulfilled
 *   close    while open            — stops new offers; agreed deals stand
 *
 * MATCHES ARE FETCHED PER REQUIREMENT, ON DEMAND
 * ----------------------------------------------
 * Matching runs the eligibility engine over every active listing for the crop, so
 * it is asked for one requirement at a time when the buyer opens it, and the
 * answer is cached per requirement id for the life of the page.
 */

const STATUS_FILTERS = [
  ['all', 'All'],
  ['open', 'Open'],
  ['draft', 'Drafts'],
  ['finished', 'Closed & filled']
];

/** Which filter bucket a requirement falls in. */
const matchesFilter = (requirement, filter) => {
  if (filter === 'all') return true;
  if (filter === 'draft') return requirement.status === 'draft';
  if (filter === 'open') return requirement.isOpen;
  // "finished" is everything that can no longer take an offer and is not a draft.
  return !requirement.isOpen && requirement.status !== 'draft';
};

const EDITABLE_BLOCKED = ['closed', 'cancelled', 'fulfilled'];

/** One matched farmer, with the two things a buyer can do about them. */
const MatchCard = ({ match, onContact, onOffer }) => (
  <div className="p-4 rounded-2xl bg-surface-container-low">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <p className="font-headline font-bold text-sm text-on-surface truncate">
          {match.farmerName}
        </p>
        <p className="text-[11px] text-on-surface-variant">
          {match.farmLocation || 'Location not recorded'}
          {match.straightLineKm !== null ? ` · ~${match.straightLineKm} km away` : ''}
        </p>
      </div>
      <span className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container text-[11px] font-bold whitespace-nowrap">
        {mp.formatQuantity(match.matchedQuantityKg)}
      </span>
    </div>

    <div className="flex items-center gap-2 flex-wrap mb-3">
      <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-bold">
        {match.qualityGrade ? `Grade ${match.qualityGrade}` : 'Ungraded'}
      </span>
      <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-bold">
        {match.harvestStatusLabel}
      </span>
      {match.isPartialFulfilment && (
        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 text-[10px] font-bold">
          Part of your quantity
        </span>
      )}
      {match.isDemoData && (
        <span className="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container text-[10px] font-bold">
          Demo
        </span>
      )}
    </div>

    {/* The engine's own reasons, shown rather than a score, so the buyer can see
        why this farmer was put in front of them. */}
    {match.reasons?.length > 0 && (
      <ul className="mb-3 space-y-1">
        {match.reasons.slice(0, 3).map((reason, i) => (
          <li key={i} className="text-[11px] text-on-surface-variant flex items-start gap-1.5">
            <span className="material-symbols-outlined text-[13px] leading-4 mt-0.5">check</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    )}

    <div className="flex gap-2">
      <button
        type="button" onClick={() => onContact(match)}
        className="flex-1 px-3 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90"
      >
        Message
      </button>
      <button
        type="button" onClick={() => onOffer(match)}
        className="flex-1 px-3 py-2 rounded-full bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container"
      >
        Make offer
      </button>
    </div>
  </div>
);

/** The matches panel for one expanded requirement. */
const MatchesPanel = ({ state, requirement, onContact, onOffer }) => {
  if (!state || state.loading) {
    return (
      <div className="text-center py-6">
        <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
        <p className="text-xs text-on-surface-variant mt-3">Finding farmers with this crop…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-3 rounded-xl bg-error-container text-on-error-container">
        <p className="text-xs font-semibold">{state.error}</p>
      </div>
    );
  }

  if (!state.matches.length) {
    // The diagnostics say why nothing matched, which is far more useful than an
    // empty list. They are counts keyed by exclusion reason.
    const excluded = Object.entries(state.diagnostics?.excludedByReason || {});
    return (
      <div className="text-center py-6">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2 block">
          search_off
        </span>
        <p className="text-sm font-semibold text-on-surface mb-1">No farmer can fill this yet</p>
        <p className="text-xs text-on-surface-variant max-w-md mx-auto">
          {requirement.status === 'draft'
            ? 'This is still a draft. Publish it so farmers can see it and come to you.'
            : 'No active listing for this crop meets your terms right now. Farmers can still find your requirement and send you an offer.'}
        </p>
        {excluded.length > 0 && (
          <div className="mt-4 inline-block text-left">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Why listings were excluded
            </p>
            <ul className="space-y-0.5">
              {excluded.map(([reason, count]) => (
                <li key={reason} className="text-[11px] text-on-surface-variant">
                  {count} × {reason.toLowerCase().replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">
        {state.matches.length} farmer{state.matches.length === 1 ? '' : 's'} can fill this · nearest first
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {state.matches.map((match) => (
          <MatchCard
            key={match.availabilityId}
            match={match}
            onContact={onContact}
            onOffer={onOffer}
          />
        ))}
      </div>
    </>
  );
};

const MyRequirements = () => {
  const navigate = useNavigate();
  const { requirementId: routeRequirementId } = useParams();

  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');

  // requirement id -> { loading, matches, diagnostics, error }
  const [matchesById, setMatchesById] = useState({});
  const [expandedId, setExpandedId] = useState(
    routeRequirementId ? Number(routeRequirementId) : null
  );

  const [formDialog, setFormDialog] = useState({ open: false, requirement: null, error: '', fields: null });
  const [contactDialog, setContactDialog] = useState({ open: false, match: null, requirement: null, error: '' });
  const [offerDialog, setOfferDialog] = useState({ open: false, match: null, requirement: null, error: '' });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const load = useCallback(async () => {
    setLoading(true);
    const result = await mp.listRequirements({ mine: 'true', limit: 100 });
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    setError('');
    setRequirements(result.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMatches = useCallback(async (requirementId) => {
    setMatchesById((m) => ({ ...m, [requirementId]: { loading: true, matches: [] } }));

    const result = await mp.getMatchingFarmers(requirementId);

    setMatchesById((m) => ({
      ...m,
      [requirementId]: result.ok
        ? {
            loading: false,
            matches: result.data.matches || [],
            diagnostics: result.data.diagnostics || null
          }
        : { loading: false, matches: [], error: result.message }
    }));
  }, []);

  // Expanding asks the matching engine once per requirement; collapsing keeps the
  // answer so reopening is instant.
  const toggleExpanded = (requirement) => {
    const next = expandedId === requirement.id ? null : requirement.id;
    setExpandedId(next);
    if (next !== null && !matchesById[next]) loadMatches(next);
  };

  // A deep link from the dashboard lands with one already open.
  useEffect(() => {
    if (expandedId !== null && !matchesById[expandedId]) loadMatches(expandedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const handleSubmitForm = async (payload) => {
    const editing = formDialog.requirement;
    setBusy(true);
    setFormDialog((d) => ({ ...d, error: '', fields: null }));

    const result = editing
      ? await mp.updateRequirement(editing.id, payload)
      : await mp.postRequirement(payload);

    setBusy(false);
    if (!result.ok) {
      setFormDialog((d) => ({ ...d, error: result.message, fields: result.fields }));
      return;
    }

    setFormDialog({ open: false, requirement: null, error: '', fields: null });
    setNotice(editing
      ? 'Requirement updated. Farmers see the new terms from now on.'
      : 'Requirement posted. Farmers with this crop can now see it.');

    // Edited terms change who matches, so a cached answer would be stale.
    if (editing) setMatchesById((m) => ({ ...m, [editing.id]: undefined }));
    if (editing && expandedId === editing.id) loadMatches(editing.id);
    load();
  };

  const handlePublish = async (requirement) => {
    setBusy(true);
    const result = await mp.publishRequirement(requirement.id);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setNotice('Requirement published. Farmers with this crop can see it now.');
    if (expandedId === requirement.id) loadMatches(requirement.id);
    load();
  };

  const handleClose = async (requirement) => {
    setBusy(true);
    const result = await mp.closeRequirement(requirement.id);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setNotice('Requirement closed. Deals you already agreed are unaffected.');
    load();
  };

  const handleContact = async (requirementId) => {
    const { match } = contactDialog;
    setBusy(true);
    setContactDialog((d) => ({ ...d, error: '' }));

    const result = await mp.startConversation({
      requirementId,
      availabilityId: match.availabilityId,
      farmerUserId: match.farmerUserId
    });

    setBusy(false);
    if (!result.ok) { setContactDialog((d) => ({ ...d, error: result.message })); return; }
    navigate(`/marketplace/messages/${result.data.id}`);
  };

  const handleSendOffer = async ({ requirementId, quantityKg, pricePerKg, deliveryTerms, message }) => {
    const { match } = offerDialog;
    setBusy(true);
    setOfferDialog((d) => ({ ...d, error: '' }));

    const result = await mp.sendOffer({
      requirementId,
      availabilityId: match.availabilityId,
      quantityKg, pricePerKg, deliveryTerms, message
    });

    setBusy(false);
    if (!result.ok) { setOfferDialog((d) => ({ ...d, error: result.message })); return; }

    setOfferDialog({ open: false, match: null, requirement: null, error: '' });
    setNotice(
      `Offer sent to ${match.farmerName}: ${mp.formatQuantity(quantityKg)} at ₹${pricePerKg}/kg. ` +
      'You will be told as soon as they reply.'
    );
  };

  const visible = requirements.filter((r) => matchesFilter(r, filter));

  const counts = {
    all: requirements.length,
    open: requirements.filter((r) => r.isOpen).length,
    draft: requirements.filter((r) => r.status === 'draft').length,
    finished: requirements.filter((r) => !r.isOpen && r.status !== 'draft').length
  };

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} userType="buyer" />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search requirements..." />

        <main className="pt-24 px-8 pb-12">
          <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight mb-2">
                My Requirements
              </h1>
              <p className="text-sm text-on-surface-variant">
                What you have asked for, and which farmers can fill it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormDialog({ open: true, requirement: null, error: '', fields: null })}
              className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 flex items-center gap-2 w-fit"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>Post a requirement</span>
            </button>
          </section>

          {notice && (
            <div className="bg-primary-container text-on-primary-container p-4 rounded-2xl mb-6 flex items-start justify-between gap-4">
              <p className="text-sm font-semibold">{notice}</p>
              <button onClick={() => setNotice('')} aria-label="Dismiss" className="shrink-0">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          {error && (
            <div className="bg-error-container text-on-error-container p-4 rounded-2xl mb-6 flex items-start justify-between gap-4">
              <p className="text-sm font-semibold">{error}</p>
              <button onClick={() => setError('')} aria-label="Dismiss" className="shrink-0">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          {requirements.length > 0 && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                    filter === key
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
              <p className="text-sm text-on-surface-variant mt-4">Loading your requirements…</p>
            </div>
          )}

          {!loading && requirements.length === 0 && (
            <div className="bg-surface-container-lowest rounded-3xl p-12 text-center">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant mb-4 block">
                assignment
              </span>
              <h3 className="font-headline font-bold text-lg text-on-surface mb-2">No requirements yet</h3>
              <p className="text-sm text-on-surface-variant mb-6 max-w-md mx-auto">
                Post what crop you need — quantity, price and date — and farmers who have it can
                send you offers. You can also browse what is already for sale.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFormDialog({ open: true, requirement: null, error: '', fields: null })}
                  className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90"
                >
                  Post my first requirement
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/buyer/browse')}
                  className="px-6 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold"
                >
                  Browse farmers
                </button>
              </div>
            </div>
          )}

          {!loading && requirements.length > 0 && visible.length === 0 && (
            <div className="bg-surface-container-lowest rounded-3xl p-12 text-center">
              <p className="text-sm font-semibold text-on-surface mb-1">Nothing in this view</p>
              <p className="text-xs text-on-surface-variant">
                You have {requirements.length} requirement{requirements.length === 1 ? '' : 's'} under the other filters.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {visible.map((requirement) => {
              const isExpanded = expandedId === requirement.id;
              const canEdit = !EDITABLE_BLOCKED.includes(requirement.status);
              const isDraft = requirement.status === 'draft';

              return (
                <div key={requirement.id} className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-headline font-bold text-base text-on-surface">
                          {mp.formatQuantity(requirement.quantityRequiredKg)}{' '}
                          {requirement.cropLabel || requirement.crop}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.statusChipClass(requirement.status)}`}>
                          {requirement.statusLabel}
                        </span>
                        {requirement.isExpiringSoon && requirement.isOpen && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 text-[10px] font-bold">
                            ends in {requirement.daysToExpiry}d
                          </span>
                        )}
                        {requirement.isDemoData && (
                          <span className="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container text-[10px] font-bold">
                            Demo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant">
                        ₹{requirement.offeredPricePerKg}/kg · needed by{' '}
                        {mp.formatShortDate(requirement.requiredBy)} ·{' '}
                        {mp.formatQuantity(requirement.quantityRemainingKg)} still wanted
                      </p>
                      {requirement.deliveryLocation && (
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          {requirement.pickupAvailable ? 'Collecting from farm · ' : 'Deliver to '}
                          {requirement.deliveryLocation}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isDraft && (
                        <button
                          type="button" onClick={() => handlePublish(requirement)} disabled={busy}
                          className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90 disabled:opacity-50"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        type="button" onClick={() => toggleExpanded(requirement)}
                        className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                          isExpanded
                            ? 'bg-surface-container-high text-on-surface'
                            : 'bg-primary text-on-primary hover:opacity-90'
                        }`}
                      >
                        <span>{isExpanded ? 'Hide farmers' : 'See interested farmers'}</span>
                        <span className="material-symbols-outlined text-base">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setFormDialog({ open: true, requirement, error: '', fields: null })}
                          className="px-3 py-2 rounded-full hover:bg-surface-container text-on-surface-variant text-xs font-semibold"
                        >
                          Edit
                        </button>
                      )}
                      {requirement.isOpen && (
                        <button
                          type="button" onClick={() => handleClose(requirement)} disabled={busy}
                          className="px-3 py-2 rounded-full hover:bg-surface-container text-on-surface-variant text-xs font-semibold disabled:opacity-50"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-5 pt-5 border-t border-surface-container">
                      <MatchesPanel
                        state={matchesById[requirement.id]}
                        requirement={requirement}
                        onContact={(match) =>
                          setContactDialog({ open: true, match, requirement, error: '' })}
                        onOffer={(match) =>
                          setOfferDialog({ open: true, match, requirement, error: '' })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <RequirementDialog
        open={formDialog.open}
        requirement={formDialog.requirement}
        busy={busy}
        error={formDialog.error}
        fields={formDialog.fields}
        onSubmit={handleSubmitForm}
        onClose={() => setFormDialog({ open: false, requirement: null, error: '', fields: null })}
      />

      {/* The requirement is already known here, so the dialogs are given just
          that one — their picker states it rather than asking. */}
      {contactDialog.open && (
        <ContactDialog
          farmerCrop={contactDialog.match}
          requirements={eligibleRequirements([contactDialog.requirement], contactDialog.match)}
          busy={busy}
          error={contactDialog.error}
          onClose={() => setContactDialog({ open: false, match: null, requirement: null, error: '' })}
          onConfirm={handleContact}
          onPostRequirement={() => setFormDialog({ open: true, requirement: null, error: '', fields: null })}
        />
      )}

      {offerDialog.open && (
        <OfferDialog
          farmerCrop={offerDialog.match}
          requirements={eligibleRequirements([offerDialog.requirement], offerDialog.match)}
          busy={busy}
          error={offerDialog.error}
          onClose={() => setOfferDialog({ open: false, match: null, requirement: null, error: '' })}
          onSubmit={handleSendOffer}
          onPostRequirement={() => setFormDialog({ open: true, requirement: null, error: '', fields: null })}
        />
      )}
    </div>
  );
};

export default MyRequirements;
