import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';
import RequirementDialog from '../components/marketplace/RequirementDialog';
import BuyerProfileDialog from '../components/marketplace/BuyerProfileDialog';

/**
 * Buyer area: onboarding, dashboard, post requirement, farmer responses.
 *
 * One page with three states rather than three routes, because a buyer's journey
 * is linear and a not-yet-registered buyer landing on an empty dashboard would
 * have nowhere to go:
 *
 *   no profile  -> registration form
 *   has profile -> dashboard with requirements and responses
 *   posting     -> requirement form (dialog)
 *
 * VERIFICATION IS NEVER SELF-AWARDED
 * ----------------------------------
 * The badge renders only from `verificationStatus` returned by the backend. A new
 * buyer sees "Not verified" and a button to submit for review; only an
 * administrator can make it say "Verified".
 */

const BUYER_TYPES = [
  ['wholesaler', 'Wholesaler'],
  ['processor', 'Processor / food factory'],
  ['retailer', 'Retailer / shop'],
  ['restaurant', 'Restaurant / hotel'],
  ['exporter', 'Exporter'],
  ['cooperative_fpo', 'Cooperative / FPO'],
  ['other', 'Other']
];

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
  'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';
const labelClass =
  'block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

/** Buyer registration. */
const BuyerOnboarding = ({ onRegister, busy, error, fields }) => {
  const [form, setForm] = useState({
    businessName: '', buyerType: 'wholesaler', contactPerson: '', businessPhone: '',
    businessEmail: '', villageCity: '', district: '', state: 'Maharashtra', pinCode: '',
    cropsPurchased: '', typicalPurchaseQuantityKg: '', serviceAreaKm: ''
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const fieldError = (name) => fields?.find((f) => f.field === name)?.message;
  const valid = form.businessName.trim().length >= 2 && form.buyerType;

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm max-w-2xl">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-2xl">storefront</span>
        </div>
        <div>
          <h2 className="font-headline font-extrabold text-xl text-on-surface">
            Register your business
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Tell farmers who you are, then post what crop you want to buy.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-error-container text-on-error-container text-xs">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Business name *</label>
          <input type="text" value={form.businessName} onChange={set('businessName')}
            placeholder="e.g. Nagpur Fresh Foods" className={inputClass} />
          {fieldError('businessName') && (
            <p className="text-[11px] text-error font-semibold mt-1">{fieldError('businessName')}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>What kind of business? *</label>
          <select value={form.buyerType} onChange={set('buyerType')} className={inputClass}>
            {BUYER_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Contact person</label>
            <input type="text" value={form.contactPerson} onChange={set('contactPerson')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Business phone</label>
            <input type="tel" value={form.businessPhone} onChange={set('businessPhone')}
              placeholder="10 digits" className={inputClass} />
            {fieldError('businessPhone') && (
              <p className="text-[11px] text-error font-semibold mt-1">{fieldError('businessPhone')}</p>
            )}
            <p className="text-[10px] text-on-surface-variant mt-1">
              Not shown to farmers. They contact you through AgriChain chat.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Business email</label>
          <input type="email" value={form.businessEmail} onChange={set('businessEmail')} className={inputClass} />
          {fieldError('businessEmail') && (
            <p className="text-[11px] text-error font-semibold mt-1">{fieldError('businessEmail')}</p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Town / city</label>
            <input type="text" value={form.villageCity} onChange={set('villageCity')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>District</label>
            <input type="text" value={form.district} onChange={set('district')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>PIN</label>
            <input type="text" value={form.pinCode} onChange={set('pinCode')}
              placeholder="440001" className={inputClass} />
            {fieldError('pinCode') && (
              <p className="text-[11px] text-error font-semibold mt-1">{fieldError('pinCode')}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Crops you buy</label>
            <input type="text" value={form.cropsPurchased} onChange={set('cropsPurchased')}
              placeholder="tomato, onion, potato" className={inputClass} />
            {fieldError('cropsPurchased') && (
              <p className="text-[11px] text-error font-semibold mt-1">{fieldError('cropsPurchased')}</p>
            )}
          </div>
          <div>
            <label className={labelClass}>How far will you buy from? (km)</label>
            <input type="number" min="1" value={form.serviceAreaKm} onChange={set('serviceAreaKm')}
              placeholder="e.g. 150" className={inputClass} />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-container-low">
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Your business will show as <strong>Not verified</strong> until an AgriChain administrator
            checks it. You can still post requirements straight away.
          </p>
        </div>
      </div>

      <button type="button" disabled={!valid || busy}
        onClick={() => onRegister({
          ...form,
          cropsPurchased: form.cropsPurchased
            ? form.cropsPurchased.split(',').map((c) => c.trim()).filter(Boolean)
            : undefined,
          typicalPurchaseQuantityKg: form.typicalPurchaseQuantityKg || undefined,
          serviceAreaKm: form.serviceAreaKm || undefined
        })}
        className={`w-full mt-6 px-6 py-3 rounded-xl text-sm font-bold ${
          valid && !busy ? 'bg-primary text-on-primary hover:opacity-90'
            : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
        }`}>
        {busy ? 'Registering…' : 'Register my business'}
      </button>
    </div>
  );
};

const BuyerDashboard = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [profile, setProfile] = useState(null);
  const [checkedProfile, setCheckedProfile] = useState(false);
  const [requirements, setRequirements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [offers, setOffers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState(null);
  const [notice, setNotice] = useState('');
  const [postOpen, setPostOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const load = useCallback(async () => {
    setLoading(true);
    const profileResult = await mp.getMyBuyerProfile();
    setCheckedProfile(true);

    if (!profileResult.ok) {
      // 404 simply means "not registered yet" - the onboarding form is the answer.
      setProfile(null);
      setLoading(false);
      return;
    }
    setProfile(profileResult.data);

    const [reqResult, summaryResult, offerResult, dealResult] = await Promise.all([
      mp.listRequirements({ mine: 'true', limit: 50 }),
      mp.getBuyerSummary(),
      mp.listOffers({ direction: 'received', status: 'pending' }),
      mp.listDeals()
    ]);
    if (reqResult.ok) setRequirements(reqResult.data);
    if (summaryResult.ok) setSummary(summaryResult.data);
    if (offerResult.ok) setOffers(offerResult.data);
    if (dealResult.ok) setDeals(dealResult.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async (form) => {
    setBusy(true); setError(''); setFields(null);
    const result = await mp.registerBuyer(form);
    setBusy(false);
    if (!result.ok) { setError(result.message); setFields(result.fields); return; }
    setNotice('Business registered. You can post a requirement now.');
    load();
  };

  const handlePost = async (form) => {
    setBusy(true); setError(''); setFields(null);
    const result = await mp.postRequirement(form);
    setBusy(false);
    if (!result.ok) { setError(result.message); setFields(result.fields); return; }
    setPostOpen(false);
    setNotice('Requirement posted. Farmers with this crop can now see it.');
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

  const handleUpdateProfile = async (changes) => {
    setBusy(true); setError(''); setFields(null);
    const result = await mp.updateBuyerProfile(changes);
    setBusy(false);
    if (!result.ok) { setError(result.message); setFields(result.fields); return; }
    setProfileOpen(false);
    setNotice('Business profile updated.');
    load();
  };

  const handleVerify = async () => {
    setBusy(true);
    const result = await mp.submitVerification();
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setNotice('Sent for review. An administrator will check your business.');
    load();
  };

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} userType="buyer" />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search requirements..." />

        <main className="pt-24 px-8 pb-12">
          <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
                {profile ? profile.businessName : 'Buy crops directly'}
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <p className="text-base text-on-surface-variant">
                  {profile
                    ? 'Post what you need and farmers will come to you.'
                    : 'Register your business to start buying straight from farmers.'}
                </p>
                {profile && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.verificationBadgeClass(profile.verificationStatus)}`}>
                    {profile.verificationLabel}
                  </span>
                )}
              </div>
            </div>
            {profile && (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setProfileOpen(true)}
                  className="px-5 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">edit</span>
                  <span>Edit profile</span>
                </button>
                <button type="button" onClick={() => setPostOpen(true)}
                  className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">add_business</span>
                  <span>Post Requirement</span>
                </button>
              </div>
            )}
          </section>

          {notice && (
            <div className="mb-4 flex items-center justify-between gap-3 p-4 rounded-2xl bg-primary-fixed/20">
              <span className="text-xs text-on-surface">{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          {error && !profile && null}
          {error && profile && (
            <div className="mb-4 flex items-center justify-between gap-3 p-4 rounded-2xl bg-error-container text-on-error-container">
              <span className="text-xs">{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          {loading && !checkedProfile && (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
            </div>
          )}

          {/* Not registered */}
          {checkedProfile && !profile && (
            <BuyerOnboarding onRegister={handleRegister} busy={busy} error={error} fields={fields} />
          )}

          {/* Registered */}
          {profile && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  ['Open requirements', summary?.activeRequirements ?? 0, 'assignment'],
                  ['Still needed', `${summary?.openRemainingKg ?? 0} kg`, 'scale'],
                  ['Offers to answer', offers.length, 'gavel'],
                  ['Agreed deals', deals.filter((d) => d.status !== 'cancelled').length, 'handshake']
                ].map(([label, value, icon]) => (
                  <div key={label} className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm">
                    <span className="material-symbols-outlined text-xl text-on-surface-variant">{icon}</span>
                    <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block mt-1">
                      {label}
                    </span>
                    <span className="font-headline font-extrabold text-xl text-on-surface">{value}</span>
                  </div>
                ))}
              </div>

              {profile.verificationStatus === 'unverified' && (
                <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10">
                  <p className="text-xs text-amber-950">
                    Your business is not verified yet. Verified businesses get more responses from farmers.
                  </p>
                  <button type="button" onClick={handleVerify} disabled={busy}
                    className="px-4 py-2 rounded-full bg-amber-600 text-white text-xs font-bold shrink-0 disabled:opacity-50">
                    Send for verification
                  </button>
                </div>
              )}

              {offers.length > 0 && (
                <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm mb-6">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="font-headline font-bold text-lg text-on-surface">
                      Farmers waiting for your answer
                    </h2>
                    <button type="button" onClick={() => navigate('/marketplace/offers')}
                      className="text-xs font-bold text-primary hover:underline">See all</button>
                  </div>
                  <div className="space-y-2">
                    {offers.slice(0, 4).map((offer) => (
                      <div key={offer.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-container-low">
                        <div className="min-w-0">
                          <span className="font-semibold text-sm text-on-surface block truncate">
                            {offer.senderName} — {mp.formatQuantity(offer.quantityKg)} {offer.crop}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">
                            ₹{offer.pricePerKg}/kg • {mp.formatRupees(offer.totalAmount)} total
                          </span>
                        </div>
                        <button type="button" onClick={() => navigate('/marketplace/offers')}
                          className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold shrink-0">
                          Review
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
                <h2 className="font-headline font-bold text-lg text-on-surface mb-4">My requirements</h2>

                {requirements.length === 0 && (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2 block">assignment</span>
                    <p className="text-sm font-semibold text-on-surface mb-1">No requirements yet</p>
                    <p className="text-xs text-on-surface-variant mb-5">
                      Post what crop you need and farmers will find you.
                    </p>
                    <button type="button" onClick={() => setPostOpen(true)}
                      className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold">
                      Post my first requirement
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  {requirements.map((requirement) => (
                    <div key={requirement.id} className="p-4 rounded-2xl bg-surface-container-low">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-headline font-bold text-sm text-on-surface">
                              {mp.formatQuantity(requirement.quantityRequiredKg)} {requirement.crop}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.statusChipClass(requirement.status)}`}>
                              {requirement.statusLabel}
                            </span>
                            {requirement.isExpiringSoon && requirement.isOpen && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 text-[10px] font-bold">
                                ends in {requirement.daysToExpiry}d
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-on-surface-variant block mt-0.5">
                            ₹{requirement.offeredPricePerKg}/kg • needed by {mp.formatShortDate(requirement.requiredBy)}
                            {' • '}{requirement.quantityRemainingKg} kg still wanted
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button"
                          onClick={() => navigate(`/buyer/requirements/${requirement.id}`)}
                          className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold">
                          See interested farmers
                        </button>
                        {requirement.isOpen && (
                          <button type="button" onClick={() => handleClose(requirement)} disabled={busy}
                            className="px-3 py-2 rounded-full hover:bg-surface-container text-on-surface-variant text-xs font-semibold disabled:opacity-50">
                            Close
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <RequirementDialog
        open={postOpen}
        busy={busy}
        error={error}
        fields={fields}
        onSubmit={handlePost}
        onClose={() => { setPostOpen(false); setError(''); setFields(null); }}
      />

      <BuyerProfileDialog
        open={profileOpen}
        profile={profile}
        busy={busy}
        error={error}
        fields={fields}
        onSubmit={handleUpdateProfile}
        onSubmitVerification={handleVerify}
        onClose={() => { setProfileOpen(false); setError(''); setFields(null); }}
      />
    </div>
  );
};

export default BuyerDashboard;
