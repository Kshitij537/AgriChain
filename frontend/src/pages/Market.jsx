import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import CropContextBar from '../components/market/CropContextBar';
import TopRecommendation from '../components/market/TopRecommendation';
import PriceVsProfit from '../components/market/PriceVsProfit';
import RouteMatrix from '../components/market/RouteMatrix';
import NetReturnLedger from '../components/market/NetReturnLedger';
import BreakevenCard from '../components/market/BreakevenCard';
import PriceForecast from '../components/market/PriceForecast';
import SpoilageMatrix from '../components/market/SpoilageMatrix';
import AlternativeChannels from '../components/market/AlternativeChannels';
import AiExplanation from '../components/market/AiExplanation';
import BatchSetupDialog from '../components/market/BatchSetupDialog';
import FindTransport from '../components/market/FindTransport';
import DispatchBar from '../components/market/DispatchBar';
import ConfirmRemoveDialog from '../components/ConfirmRemoveDialog';
import { getUserFarms } from '../services/farmService';
import { getMarketIntelligence, getCrops } from '../services/marketService';
import { findTransporters, emptyTransportState } from '../services/transportService';
import { formatINR } from '../utils/marketHelpers';
import mp from '../services/marketplaceService';

/**
 * Market Intelligence - where and when to sell this harvest.
 *
 * The page answers one question in rupees: which mandi leaves the most cash
 * in the farmer's hand after freight and transit spoilage, not which one
 * quotes the highest board price.
 */

/**
 * ONE FLAT SHAPE FOR A DIRECT-BUYER CARD, FROM EITHER BACKEND PROJECTION.
 *
 * The two farmer-side endpoints answer different questions and return different
 * shapes, and this section used to render one against the field names of the
 * other — so the buyer name, quantity, price and cut all resolved to `undefined`
 * and the cards came out blank. Normalising here keeps the card markup reading a
 * single set of names whichever endpoint answered.
 *
 *   /farmer/matches     eligibility only. matchingService is a filter and
 *                       deliberately computes NO money.
 *   /farmer/top-buyers  buyerComparisonService's full ledger, which is where
 *                       every rupee on this card comes from.
 */

/** From buyerComparisonService — fully priced, so "your cut" is a real figure. */
const fromPricedOption = (option) => ({
  requirementId: option.requirementId,
  buyerName: option.buyerName,
  buyerType: option.buyerType,
  buyerDistrict: option.buyerDistrict,
  isVerifiedBuyer: option.isVerifiedBuyer,
  verificationStatus: option.verificationStatus,
  // `distanceKm` is the FARMER'S trip, so it is a true 0 when the buyer collects —
  // which is not the same as the business being next door. The subtitle wants how
  // far away the buyer actually is, so fall back to the straight-line figure
  // rather than telling a farmer that Akola is 0 km from Hingna.
  distanceKm: option.whoPaysTransport === 'buyer'
    ? (option.straightLineKm ?? null)
    : (option.distanceKm ?? option.straightLineKm ?? null),
  needsKg: option.requirementQuantityRemainingKg,
  matchedQuantityKg: option.matchedQuantityKg,
  isPartialFulfilment: option.isPartialFulfilment,
  offeredPricePerKg: option.offeredPricePerKg,
  priceNegotiable: option.priceNegotiable,
  // expectedMoney is the backend's net figure FOR matchedQuantityKg. Dividing it
  // by that same quantity is presentation — no cost is recomputed on the client,
  // which is what keeps this card agreeing with the Buyer Marketplace page.
  netPerKg: option.isComplete && option.matchedQuantityKg
    ? Math.round((option.expectedMoney / option.matchedQuantityKg) * 100) / 100
    : null,
  expectedMoney: option.isComplete ? option.expectedMoney : null,
  transportCost: option.transportCost,
  whoPaysTransport: option.whoPaysTransport,
  transportArrangement: option.transportArrangement,
  recommended: Boolean(option.recommended),
  isHighestPriceButNotBest: Boolean(option.isHighestPriceButNotBest),
  isPriced: true
});

/**
 * From matchingService — eligibility only.
 *
 * `netPerKg` stays null rather than being filled with an estimate: this endpoint
 * costs nothing out, and a guessed cut is worse than an honest blank.
 */
const fromMatch = (match) => ({
  requirementId: match.requirement?.id,
  buyerName: match.requirement?.buyer?.businessName || 'Buyer',
  buyerType: match.requirement?.buyer?.buyerType,
  buyerDistrict: match.requirement?.buyer?.district,
  isVerifiedBuyer: Boolean(match.requirement?.buyer?.isVerified),
  verificationStatus: match.requirement?.buyer?.verificationStatus,
  distanceKm: match.straightLineKm ?? null,
  needsKg: match.requirement?.quantityRemainingKg,
  matchedQuantityKg: match.matchedQuantityKg,
  isPartialFulfilment: match.isPartialFulfilment,
  offeredPricePerKg: match.requirement?.offeredPricePerKg,
  priceNegotiable: match.requirement?.priceNegotiable,
  netPerKg: null,
  expectedMoney: null,
  transportCost: null,
  whoPaysTransport: match.requirement?.pickupAvailable ? 'buyer' : 'farmer',
  transportArrangement: match.requirement?.pickupAvailable
    ? 'Buyer collects from your farm'
    : 'You deliver to the buyer',
  recommended: false,
  isHighestPriceButNotBest: false,
  isPriced: false
});

/**
 * Per-crop presentation and perishability. `perishabilityFactor` scales the
 * spoilage curve: 1.0 is tomato-class (thin skin, rots fast).
 */
const CROP_PROFILE = {
  tomato: { emoji: '🍅', perishabilityFactor: 1, perishabilityLabel: 'HIGH (1–2 days max)' },
  onion: { emoji: '🧅', perishabilityFactor: 0.35, perishabilityLabel: 'LOW (weeks in shade)' },
  potato: { emoji: '🥔', perishabilityFactor: 0.3, perishabilityLabel: 'LOW (weeks in shade)' },
  chilli: { emoji: '🌶️', perishabilityFactor: 0.7, perishabilityLabel: 'MEDIUM (3–5 days)' },
  soybean: { emoji: '🌱', perishabilityFactor: 0.15, perishabilityLabel: 'VERY LOW (stores well)' },
  cotton: { emoji: '☁️', perishabilityFactor: 0.1, perishabilityLabel: 'VERY LOW (stores well)' },
  wheat: { emoji: '🌾', perishabilityFactor: 0.1, perishabilityLabel: 'VERY LOW (stores well)' },
  default: { emoji: '🧺', perishabilityFactor: 0.6, perishabilityLabel: 'MEDIUM' }
};

/** Rough input cost per kg used until the farm record carries real figures. */
const DEFAULT_INPUT_COST_PER_KG = 16;

/**
 * Lowest believable cost of growing one kilogram, in rupees.
 * Mirrors marketValidator.MIN_PLAUSIBLE_COST_PER_KG, which is what the backend
 * actually enforces; this copy only decides whether to send the figure at all.
 */
const MIN_PLAUSIBLE_COST_PER_KG = 1;

/**
 * Whether a total production cost is worth sending for this quantity.
 *
 * A blank cost is fine — it is optional, and the breakeven card simply does not
 * render. A cost implying under ₹1/kg is a per-kg figure typed into a total
 * field, and the backend rejects it.
 *
 * @param {number|null} totalCost
 * @param {number} quantityKg
 * @returns {boolean}
 */
const isPlausibleInputCost = (totalCost, quantityKg) => {
  const cost = Number(totalCost);
  if (!Number.isFinite(cost) || cost <= 0) return false;
  if (!quantityKg) return false;
  return cost / quantityKg >= MIN_PLAUSIBLE_COST_PER_KG;
};

/**
 * Builds the batch descriptor the whole page is priced against.
 * @param {object} farm - Farm record, may be null
 * @returns {object}
 */
const buildBatch = (farm, input) => {
  if (!input) return null;

  const cropName = String(input.crop || '').toLowerCase();
  const profile = CROP_PROFILE[cropName] || CROP_PROFILE.default;
  const quantityKg = Number(input.quantityKg) || 0;

  return {
    crop: cropName.charAt(0).toUpperCase() + cropName.slice(1),
    cropKey: cropName,
    // The farms table has no variety column, so this is not claimed as known.
    variety: null,
    grade: null,
    emoji: profile.emoji,
    perishabilityFactor: profile.perishabilityFactor,
    perishabilityLabel: profile.perishabilityLabel,
    quantityKg,
    quintals: quantityKg / 100,
    crates: Math.round(quantityKg / 25),
    // Only what the farmer actually entered. No input cost is invented, because
    // a guessed cost would produce a guessed profit figure.
    //
    // An implausible one is DROPPED rather than sent. The backend now rejects a
    // total that works out to under ₹1/kg to grow, and selections are kept in
    // localStorage — so a figure saved before that guard existed would otherwise
    // fail the recommend call and leave the page showing an error instead of the
    // mandi prices. Dropping it hides the breakeven card, which is the honest
    // outcome: no cost on record, no profit figure.
    totalInputCost: isPlausibleInputCost(input.productionCost, quantityKg)
      ? input.productionCost
      : null,
    harvestDate: input.harvestDate,
    storageType: input.storageType,
    origin: {
      name: farm?.name || 'Your field',
      district: farm?.location || null
    },
    status: 'Ready to Sell'
  };
};

const Market = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [farms, setFarms] = useState([]);
  const [farm, setFarm] = useState(null);
  const [crops, setCrops] = useState([]);
  const [farmLoaded, setFarmLoaded] = useState(false);
  // What the farmer told us about this harvest. Null until they have chosen a
  // field and entered a quantity, which is why the dialog opens on arrival -
  // nothing can be priced before then, and guessing would put invented rupees
  // on screen.
  const [batchInput, setBatchInput] = useState(null);
  const [batchHistory, setBatchHistory] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Clearing out saved selections. `selectMode` exists so a single tap on a card
  // still re-loads that harvest — the common action — and only becomes a tick box
  // once the farmer has explicitly asked to select.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForRemoval, setSelectedForRemoval] = useState([]);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [intelligence, setIntelligence] = useState(null);
  const [buyerMatches, setBuyerMatches] = useState([]);
  const [loadingBuyers, setLoadingBuyers] = useState(false);
  // The farmer's own crop listing these buyers were matched against. Needed to
  // price the comparison, and passed on to the marketplace page so "Contact this
  // buyer" opens the same lot rather than making the farmer pick it again.
  const [buyerListingId, setBuyerListingId] = useState(null);
  // The backend's own reason for an empty list. "No buyer has asked for this
  // crop" and "you have not told us what you have to sell" need different
  // answers from the farmer, and only the backend knows which it is.
  const [buyerEmptyHint, setBuyerEmptyHint] = useState('');

  // Load batch history from localStorage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('marketBatchHistory');
      if (savedHistory) {
        setBatchHistory(JSON.parse(savedHistory));
      }
    } catch (error) {
      console.error('Error loading batch history:', error);
    }
  }, []);
  const [selectedMarketId, setSelectedMarketId] = useState(null);
  // Transport lookup is kept in its own state so a Google Places outage shows up
  // inside the Find Transport card and can never fail the recommendation.
  const [transport, setTransport] = useState(emptyTransportState());
  const [transportReloadKey, setTransportReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const batch = useMemo(() => buildBatch(farm, batchInput), [farm, batchInput]);

  // Load the farmer's fields and the crop catalogue, then ask what they are
  // selling. The field is NOT auto-picked any more: with several saved fields,
  // silently using the first one priced the wrong harvest.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [farmList, cropList] = await Promise.all([
        getUserFarms(user?.id || 1),
        getCrops()
      ]);
      if (cancelled) return;
      setFarms(farmList);
      setCrops(cropList);
      // Pre-select when there is only one field - there is nothing to choose.
      const usable = farmList.filter((f) => f.latitude != null && f.longitude != null);
      if (usable.length === 1) setFarm(usable[0]);
      setFarmLoaded(true);
      setDialogOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Price every nearby mandi against this batch. Runs only once the farmer has
  // actually described the harvest.
  useEffect(() => {
    if (!farmLoaded || !farm || !batch) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // farmId and userId let the backend resolve the farm's saved location and
        // authorise the request; the recommendation is computed server-side.
        const data = await getMarketIntelligence(batch, {
          lat: farm?.latitude || farm?.lat,
          lon: farm?.longitude || farm?.lon,
          farmId: farm?.id,
          userId: user?.id,
          harvestDate: batch.harvestDate,
          storageType: batch.storageType
        });
        if (cancelled) return;
        setIntelligence(data);
        setSelectedMarketId(data.recommended?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Could not load market intelligence.');
        // A rejected request has no answer, so clear the previous one rather than
        // leaving an old market list sitting under a contradicting error.
        if (err.isBackendRejection) {
          setIntelligence(null);
          setSelectedMarketId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmLoaded, batch, farm, user]);

  // Fetch buyer marketplace matches alongside mandi intelligence
  //
  // TWO CALLS, ON PURPOSE. /farmer/matches answers "which buyers could take this
  // crop at all" but costs nothing out — matchingService is a filter and says so.
  // The rupee figures come from /farmer/top-buyers, the same comparison the Buyer
  // Marketplace page renders, so the two screens cannot disagree about what a
  // farmer would keep. The matches response already carries the farmer's own
  // listing id, which is the only argument top-buyers needs, so this costs one
  // extra request and no extra lookup.
  useEffect(() => {
    if (!batch || !batch.crop) {
      setBuyerMatches([]);
      setBuyerListingId(null);
      setBuyerEmptyHint('');
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingBuyers(true);
      try {
        const matched = await mp.getMyMatches({
          crop: batch.crop,
          limit: 20
        });

        if (cancelled) return;

        if (!matched.ok || !Array.isArray(matched.data) || !matched.data.length) {
          setBuyerMatches([]);
          setBuyerListingId(null);
          setBuyerEmptyHint(matched.meta?.diagnostics?.hint || '');
          return;
        }

        const availabilityId = matched.data[0]?.availability?.id ?? null;
        const priced = availabilityId
          ? await mp.getTopBuyers(availabilityId, { limit: 20 })
          : { ok: false };

        if (cancelled) return;

        setBuyerEmptyHint('');
        setBuyerListingId(availabilityId);
        // Priced options when the comparison succeeded; the unpriced match rows as
        // a fallback, so a routing or weather outage still shows WHO wants the crop
        // and at what advertised price instead of emptying the section.
        setBuyerMatches(
          priced.ok && priced.data?.buyers?.length
            ? priced.data.buyers.map(fromPricedOption)
            : matched.data.map(fromMatch)
        );
      } catch (err) {
        console.error('Error fetching buyer matches:', err);
        if (!cancelled) {
          setBuyerMatches([]);
          setBuyerListingId(null);
          setBuyerEmptyHint('');
        }
      } finally {
        if (!cancelled) setLoadingBuyers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [batch]);

  const selectedMarket = useMemo(() => {
    if (!intelligence?.markets?.length) return null;
    return (
      intelligence.markets.find((m) => m.id === selectedMarketId) || intelligence.recommended
    );
  }, [intelligence, selectedMarketId]);

  // Find transporters near whichever mandi the farmer is inspecting.
  //
  // Keyed on the market the farmer actually selected, so switching mandi in the
  // route matrix re-runs the lookup for the new one. The farmer is never asked
  // for mandi coordinates - the backend resolves them from the market id.
  useEffect(() => {
    // Accept either the numeric markets.id or the market_code. The backend's
    // getMarketById resolves both, and the fallback/demo market objects carry only
    // a code - which is why requiring marketId alone meant the transport lookup
    // silently never ran and the card rendered its header with nothing under it.
    const marketRef = selectedMarket?.marketId ?? selectedMarket?.id;

    if (!marketRef || !farm?.id || !batch?.quantityKg) {
      setTransport(emptyTransportState());
      return undefined;
    }

    let cancelled = false;
    setTransport((previous) => ({ ...previous, loading: true, error: null }));

    (async () => {
      const result = await findTransporters({
        marketId: marketRef,
        farmId: farm.id,
        quantityKg: batch.quantityKg
      });
      if (!cancelled) setTransport(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMarket?.marketId, selectedMarket?.id, farm?.id, batch?.quantityKg, transportReloadKey]);

  // Breakeven follows whichever mandi the farmer is currently inspecting. It stays
  // null when no production cost was entered - the card then shows its own
  // "add your input cost" state instead of a fabricated margin.
  const selectedBreakeven = useMemo(() => {
    if (!selectedMarket || !intelligence || !batch?.totalInputCost) return null;
    if (selectedMarket.id === intelligence.recommended?.id) return intelligence.breakeven;
    const quantityKg = batch.quantityKg;
    const costPerKg = batch.totalInputCost / quantityKg;
    const realizedPerKg = selectedMarket.netReturn / quantityKg;
    return {
      ...intelligence.breakeven,
      realizedPerKg,
      marginPerKg: realizedPerKg - costPerKg,
      netMargin: selectedMarket.netReturn - batch.totalInputCost,
      roiPct: batch.totalInputCost
        ? ((selectedMarket.netReturn - batch.totalInputCost) / batch.totalInputCost) * 100
        : 0,
      profitable: realizedPerKg > costPerKg,
      costSharePct:
        realizedPerKg > 0 ? Math.min(100, Math.max(0, (costPerKg / realizedPerKg) * 100)) : 100
    };
  }, [selectedMarket, intelligence, batch]);

  const handleNavigate = useCallback(() => {
    if (!selectedMarket) return;
    const query = encodeURIComponent(`${selectedMarket.name}, Maharashtra`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank', 'noopener');
  }, [selectedMarket]);

  const handleCallAgent = useCallback(() => {
    // No agent directory in the API yet - surface it rather than fail silently.
    setError('Mandi agent contacts are not available yet for this market.');
  }, []);

  /**
   * Applies the farmer's field + harvest details and re-prices every mandi.
   * @param {object} next - from BatchSetupDialog
   */
  const handleApplyBatch = useCallback((next) => {
    setFarm(next.farm);
    const newBatchInput = {
      crop: next.crop,
      quantityKg: next.quantityKg,
      harvestDate: next.harvestDate,
      productionCost: next.productionCost,
      storageType: next.storageType
    };
    setBatchInput(newBatchInput);
    
    // Save to history
    try {
      const historyEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        farmId: next.farm?.id,
        farmName: next.farm?.name || 'Field',
        ...newBatchInput
      };
      
      // Add to beginning of history, keep last 10
      const updatedHistory = [historyEntry, ...batchHistory.filter(h => 
        !(h.farmId === historyEntry.farmId && h.crop === historyEntry.crop)
      )].slice(0, 10);
      
      setBatchHistory(updatedHistory);
      localStorage.setItem('marketBatchHistory', JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Error saving batch history:', error);
    }
    
    setDialogOpen(false);
    setError('');
    // A batch hides the history grid, so leave select mode rather than stranding
    // ticks that would reappear the next time the grid is shown.
    setSelectMode(false);
    setSelectedForRemoval([]);
  }, [batchHistory]);

  /**
   * Quick load from history
   */
  const handleLoadFromHistory = useCallback((historyEntry) => {
    const selectedFarm = farms.find(f => f.id === historyEntry.farmId);
    if (selectedFarm) {
      setFarm(selectedFarm);
      setBatchInput({
        crop: historyEntry.crop,
        quantityKg: historyEntry.quantityKg,
        harvestDate: historyEntry.harvestDate,
        productionCost: historyEntry.productionCost,
        storageType: historyEntry.storageType
      });
      setError('');
    }
  }, [farms]);

  // Only the cards actually on screen take part in selection, so "Select all"
  // cannot quietly remove the four entries the grid is not showing.
  const visibleHistory = useMemo(() => batchHistory.slice(0, 6), [batchHistory]);

  const historyForRemoval = useMemo(
    () => visibleHistory.filter((entry) => selectedForRemoval.includes(entry.id)),
    [visibleHistory, selectedForRemoval]
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedForRemoval([]);
  }, []);

  const toggleForRemoval = useCallback((id) => {
    setSelectedForRemoval((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }, []);

  /**
   * Drops the ticked selections from the saved history.
   *
   * localStorage is the only home this list has, so the write is the deletion —
   * there is nothing on the server to call. The in-memory copy is updated from the
   * same array that is persisted, so a failed write cannot leave the screen
   * claiming entries are gone while the next page load brings them back.
   */
  const handleRemoveSelected = useCallback(() => {
    const remaining = batchHistory.filter((entry) => !selectedForRemoval.includes(entry.id));
    const removedCount = batchHistory.length - remaining.length;
    if (!removedCount) return;

    try {
      localStorage.setItem('marketBatchHistory', JSON.stringify(remaining));
    } catch (storageError) {
      console.error('Error saving batch history:', storageError);
      setError('Could not remove those selections on this device. Please try again.');
      setRemoveDialogOpen(false);
      return;
    }

    setBatchHistory(remaining);
    setRemoveDialogOpen(false);
    exitSelectMode();
  }, [batchHistory, selectedForRemoval, exitSelectMode]);

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search mandi, crops, or district..." />

        <main className="relative pt-24 px-8 pb-12">
          {/* Ambient backdrop */}
          <div className="absolute -top-8 -left-20 w-96 h-96 rounded-full bg-primary-fixed/20 blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-secondary-fixed/30 blur-3xl pointer-events-none" />

          <div className="relative">
            {/* Page header */}
            <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-primary font-semibold text-xs mb-2">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                  <span>
                    {batch?.origin?.district ? `${batch.origin.district} ` : ''}APMC Grid
                    {intelligence && intelligence.containsDemoData ? ' • Demo Data' : ' • Live'}
                  </span>
                </div>
                <h1 className="font-headline font-extrabold text-3xl sm:text-4xl text-on-surface tracking-tight">
                  Market Intelligence
                </h1>
                <p className="font-body text-base text-on-surface-variant max-w-2xl mt-1.5">
                  Find the best place and time to sell your produce based on net cash in hand,
                  accounting for live mandi rates, transport freight and heat-induced transit spoilage.
                </p>
              </div>

              {selectedMarket && (
                <div className="flex items-center gap-3 bg-surface-container-lowest shadow-sm rounded-2xl p-2 px-4 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-2xl">verified_user</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
                      Estimated In-Hand
                    </span>
                    <span className="font-headline font-extrabold text-xl text-primary leading-tight">
                      {formatINR(selectedMarket.netReturn)}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Provenance notice: never let a farmer mistake demo rates for real quotes.
                Two distinct cases, because they mean different things:
                  - the backend answered, but the prices behind it are DEMO_SEED rows
                  - the backend could not be reached at all                          */}
            {/* Show warning from backend if no mandi data but not an error */}
            {intelligence && intelligence.warning && !error && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-primary-container/20 border border-primary/20">
                <span className="material-symbols-outlined text-primary text-xl shrink-0">info</span>
                <div className="flex-1">
                  <p className="text-xs text-on-surface leading-relaxed">
                    <strong>{intelligence.warning}</strong> Direct buyers can sometimes offer better rates than mandis.
                  </p>
                </div>
              </div>
            )}

            {/* The demo-data banner was removed by product decision. The header chip
                still reads "Demo Data" when containsDemoData is true, and every
                market row still carries priceSource/isDemoData, so the information
                remains available to the UI and to any API consumer.

                The OFFLINE notice below is deliberately kept: those figures are
                computed in the browser rather than by the engine, so acting on them
                is a different and larger risk than a demo mandi rate. */}

            {intelligence && !intelligence.isLiveData && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <span className="material-symbols-outlined text-amber-700 text-xl shrink-0">
                  cloud_off
                </span>
                <p className="text-xs text-amber-950 leading-relaxed">
                  <strong>Offline - showing demonstration figures.</strong> The market service could
                  not be reached, so these rates and totals were estimated in your browser rather
                  than by the recommendation engine. Do not act on these numbers.
                </p>
              </div>
            )}

            {error && (
              <div className="mb-6 flex items-center justify-between gap-3 p-4 rounded-2xl bg-error-container text-on-error-container">
                <span className="text-xs">{error}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Every backend rejection is fixable by changing the batch —
                      a different crop, a field with a location — so offer that
                      directly rather than only a dismiss. */}
                  <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="text-xs font-bold underline"
                  >
                    Change crop or field
                  </button>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="text-xs font-bold underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {batch && (
              <div className="mb-10">
                <CropContextBar
                  batch={batch}
                  onChangeCrop={() => setDialogOpen(true)}
                  onEditQuantity={() => setDialogOpen(true)}
                />
              </div>
            )}

            {/* Nothing can be priced until the farmer says what they are selling,
                so prompt instead of showing invented figures. */}
            {!batch && !loading && (
              <div className="py-8">
                {/* Recent Selections History */}
                {batchHistory.length > 0 && (
                  <div className="mb-12">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h2 className="font-headline font-bold text-lg text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">history</span>
                        {selectMode ? 'Tick the selections to remove' : 'Recent Selections'}
                      </h2>
                      <button
                        type="button"
                        onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 flex items-center gap-1 ${
                          selectMode
                            ? 'bg-surface-container-high text-on-surface'
                            : 'text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {selectMode ? 'close' : 'check_box'}
                        </span>
                        <span>{selectMode ? 'Cancel' : 'Select'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {visibleHistory.map((entry) => {
                        const cropProfile = CROP_PROFILE[entry.crop?.toLowerCase()] || CROP_PROFILE.default;
                        const ticked = selectedForRemoval.includes(entry.id);
                        const cardBody = (
                          <>
                            <div className="flex items-start justify-between mb-3">
                              <span className="text-3xl">{cropProfile.emoji}</span>
                              <span className="text-[10px] text-on-surface-variant">
                                {new Date(entry.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <h3 className="font-headline font-bold text-base text-on-surface mb-1">
                              {entry.crop}
                            </h3>
                            <p className="text-xs text-on-surface-variant mb-2">
                              {entry.farmName}
                            </p>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="font-semibold text-primary">
                                {entry.quantityKg} kg
                              </span>
                              {entry.productionCost && (
                                <span className="text-on-surface-variant">
                                  Cost: ₹{entry.productionCost}
                                </span>
                              )}
                            </div>
                          </>
                        );

                        // In select mode the card is a real checkbox, so the
                        // keyboard and screen readers get the tick state for free.
                        if (selectMode) {
                          return (
                            <label
                              key={entry.id}
                              className={`bg-surface-container-lowest rounded-2xl p-5 text-left cursor-pointer transition-colors border-2 flex items-start gap-3 ${
                                ticked ? 'border-error bg-error/5' : 'border-transparent hover:border-error/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={ticked}
                                onChange={() => toggleForRemoval(entry.id)}
                                className="mt-1 rounded shrink-0"
                              />
                              <span className="block min-w-0 flex-1">{cardBody}</span>
                            </label>
                          );
                        }

                        return (
                          <button
                            key={entry.id}
                            onClick={() => handleLoadFromHistory(entry)}
                            className="bg-surface-container-lowest hover:bg-surface-container-high rounded-2xl p-5 text-left transition-colors border-2 border-transparent hover:border-primary/20"
                          >
                            {cardBody}
                          </button>
                        );
                      })}
                    </div>

                    {selectMode && (
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-surface-container">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-on-surface">
                            {selectedForRemoval.length} selected
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedForRemoval(
                              selectedForRemoval.length === visibleHistory.length
                                ? []
                                : visibleHistory.map((entry) => entry.id)
                            )}
                            className="text-[11px] font-bold text-primary hover:underline"
                          >
                            {selectedForRemoval.length === visibleHistory.length ? 'Clear all' : 'Select all'}
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={selectedForRemoval.length === 0}
                          onClick={() => setRemoveDialogOpen(true)}
                          className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                            selectedForRemoval.length === 0
                              ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                              : 'bg-error text-on-error hover:opacity-90'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                          <span>
                            Remove{selectedForRemoval.length > 0 ? ` (${selectedForRemoval.length})` : ''}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty State / New Selection */}
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-primary-container text-on-primary flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-3xl">agriculture</span>
                  </div>
                  <h2 className="font-headline font-bold text-xl text-on-surface mb-1.5">
                    {batchHistory.length > 0 ? 'Start New Market Analysis' : 'Which harvest are you selling?'}
                  </h2>
                  <p className="text-sm text-on-surface-variant max-w-md mb-6">
                    Pick the field and tell us how much came off it. We will measure the road
                    distance to every nearby mandi and work out which one leaves you the most
                    money in hand.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="px-6 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90"
                  >
                    Choose field &amp; harvest
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-24">
                <div className="flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                    progress_activity
                  </span>
                  <span className="text-sm text-on-surface-variant">
                    Pricing nearby mandis for your batch...
                  </span>
                </div>
              </div>
            )}

            {!loading && (intelligence || buyerMatches.length > 0) && (
              <>
                {/* If no mandi data but buyers exist, show info message */}
                {!intelligence && buyerMatches.length > 0 && (
                  <div className="mb-8 p-6 bg-primary-container/20 rounded-3xl border-2 border-primary/20">
                    <div className="flex items-start gap-4">
                      <span className="material-symbols-outlined text-3xl text-primary">info</span>
                      <div>
                        <h3 className="font-headline font-bold text-lg text-on-surface mb-2">
                          No Government Mandi Prices Available
                        </h3>
                        <p className="text-sm text-on-surface-variant mb-3">
                          APMC mandi prices haven't been collected for {batch?.crop} yet. 
                          However, we found direct buyers interested in your crop below.
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Direct buyers can sometimes offer better rates than mandis, especially if they 
                          collect from your farm (saving you transport costs).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show mandi intelligence only when there are actually mandis to
                    show. With no mandi rates for the crop, this whole block would
                    otherwise render a dashboard of empty cards - a recommendation
                    with no market, a route matrix with no routes, a forecast of
                    nothing - instead of the "no mandi rates" notice above. */}
                {intelligence && intelligence.markets?.length > 0 && (
                  <>
                    {/* Hero + the counterintuitive lesson */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
                      <div className="lg:col-span-7">
                        <TopRecommendation
                          market={intelligence.recommended}
                          runnerUp={intelligence.runnerUp}
                          batch={batch}
                          ambient={intelligence.ambient}
                        />
                      </div>
                      <div className="lg:col-span-5">
                        <PriceVsProfit
                          recommended={intelligence.recommended}
                          markets={intelligence.markets}
                        />
                      </div>
                    </div>

                    <div className="mb-12">
                      <RouteMatrix
                        markets={intelligence.markets}
                        selected={selectedMarket}
                        onSelect={setSelectedMarketId}
                        batch={batch}
                      />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
                      <div className="lg:col-span-7">
                        <NetReturnLedger market={selectedMarket} batch={batch} />
                  </div>
                  <div className="lg:col-span-5">
                    <BreakevenCard breakeven={selectedBreakeven} batch={batch} />
                  </div>
                </div>

                <div className="mb-12">
                  <PriceForecast forecast={intelligence.forecast} decision={intelligence.decision} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
                  <div className="lg:col-span-6">
                    <SpoilageMatrix markets={intelligence.markets} batch={batch} />
                  </div>
                  <div className="lg:col-span-6">
                    <AlternativeChannels channels={intelligence.channels} batch={batch} />
                  </div>
                </div>

                    {/* Find Transport - only for mandi sales */}
                    {selectedMarket && (
                      <div className="mb-12">
                        <FindTransport
                          transport={transport}
                          market={selectedMarket}
                          batch={batch}
                          onRetry={() => setTransportReloadKey((key) => key + 1)}
                        />
                      </div>
                    )}

                    <div className="mb-6">
                      <AiExplanation />
                    </div>

                    <DispatchBar
                      market={selectedMarket}
                      batch={batch}
                      onCallAgent={handleCallAgent}
                      onNavigate={handleNavigate}
                    />
                  </>
                )}

                {/* Explore Direct Buyers - the marketplace channel with actual buyer matches */}
                <div className="mb-12">
                  <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-2xl">storefront</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                          Another way to sell
                        </span>
                        <h2 className="font-headline font-extrabold text-xl text-on-surface">
                          Direct Buyers for {batch?.crop}
                        </h2>
                        <p className="text-xs text-on-surface-variant mt-1">
                          Businesses looking for {batch?.crop}. Sometimes a direct buyer leaves you 
                          more money than any mandi — especially when they collect from your farm.
                        </p>
                      </div>
                    </div>

                    {loadingBuyers && (
                      <div className="text-center py-8">
                        <span className="text-xs text-on-surface-variant">Loading buyers...</span>
                      </div>
                    )}

                    {!loadingBuyers && buyerMatches.length === 0 && (
                      <div className="text-center py-8">
                        <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2 block">
                          business
                        </span>
                        <p className="text-sm font-semibold text-on-surface mb-1">
                          {buyerEmptyHint
                            ? `Nothing listed to sell for ${batch?.crop} yet`
                            : `No active buyer requirements for ${batch?.crop}`}
                        </p>
                        {/* The backend's hint, when it gave one: matching needs a crop
                            and a quantity before it can find anyone, and telling the
                            farmer "no buyers" in that case is simply wrong. */}
                        <p className="text-xs text-on-surface-variant mb-4">
                          {buyerEmptyHint
                            || "Buyers haven't posted requirements for this crop yet. Check back later."}
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate('/marketplace/my-crops')}
                          className="text-xs font-bold text-primary underline hover:no-underline mr-4"
                        >
                          {buyerEmptyHint ? 'Add what I have to sell →' : 'My crops for sale →'}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/marketplace')}
                          className="text-xs font-bold text-primary underline hover:no-underline"
                        >
                          Browse all buyer requirements →
                        </button>
                      </div>
                    )}

                    {!loadingBuyers && buyerMatches.length > 0 && (
                      <div className="space-y-4">
                        {buyerMatches.slice(0, 3).map((buyer) => (
                          <div 
                            key={buyer.requirementId} 
                            className="p-4 rounded-2xl bg-surface-container-low border-2 border-transparent hover:border-primary/20 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="min-w-0">
                                <h3 className="font-headline font-bold text-base text-on-surface">
                                  {buyer.buyerName}
                                </h3>
                                <p className="text-xs text-on-surface-variant">
                                  {[
                                    buyer.buyerType?.replace(/_/g, ' '),
                                    buyer.buyerDistrict,
                                    buyer.distanceKm !== null && buyer.distanceKm !== undefined
                                      ? `${buyer.distanceKm} km away`
                                      : null
                                  ].filter(Boolean).join(' • ')}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {buyer.recommended && (
                                  <span className="px-2 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">
                                    MOST MONEY
                                  </span>
                                )}
                                {/* Rendered only from the backend's verification status —
                                    never inferred from anything else on the card. */}
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${mp.verificationBadgeClass(buyer.verificationStatus)}`}
                                >
                                  {buyer.isVerifiedBuyer && (
                                    <span className="material-symbols-outlined text-[11px]">verified</span>
                                  )}
                                  {buyer.isVerifiedBuyer ? 'Verified' : 'Not verified'}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mb-3 p-3 rounded-xl bg-surface-container">
                              <div>
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase block">
                                  Needs
                                </span>
                                <span className="text-sm font-bold text-on-surface">
                                  {buyer.needsKg !== null && buyer.needsKg !== undefined
                                    ? `${buyer.needsKg} kg`
                                    : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase block">
                                  Offering
                                </span>
                                <span className="text-sm font-bold text-primary">
                                  {buyer.offeredPricePerKg !== null && buyer.offeredPricePerKg !== undefined
                                    ? `₹${buyer.offeredPricePerKg}/kg`
                                    : '—'}
                                </span>
                                <span className="text-[10px] text-on-surface-variant block">
                                  advertised{buyer.priceNegotiable ? ', negotiable' : ''}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase block">
                                  Your Cut
                                </span>
                                <span className="text-sm font-bold text-on-surface">
                                  {buyer.netPerKg !== null ? `₹${buyer.netPerKg}/kg` : '—'}
                                </span>
                                {/* An unpriced option says so rather than showing a zero:
                                    a free trip is a far more attractive lie than an
                                    unknown one. */}
                                <span className="text-[10px] text-on-surface-variant block">
                                  {buyer.netPerKg !== null
                                    ? `after costs • ${mp.formatRupees(buyer.expectedMoney)} for ${buyer.matchedQuantityKg} kg`
                                    : 'not yet costed'}
                                </span>
                              </div>
                            </div>

                            {/* Why the cut differs from the advertised price. This is the
                                whole point of the section, so it is stated, not implied. */}
                            <p className="text-xs text-on-surface-variant mb-3 flex items-start gap-1.5">
                              <span className="material-symbols-outlined text-sm shrink-0">
                                {buyer.whoPaysTransport === 'buyer' ? 'local_shipping' : 'route'}
                              </span>
                              <span>
                                {buyer.transportArrangement}
                                {buyer.whoPaysTransport === 'buyer'
                                  ? ' — no transport cost to you.'
                                  : buyer.transportCost !== null
                                    ? ` — about ${mp.formatRupees(buyer.transportCost)} freight.`
                                    : '.'}
                                {buyer.isPartialFulfilment && buyer.matchedQuantityKg
                                  ? ` You can supply ${buyer.matchedQuantityKg} kg of what they still need.`
                                  : ''}
                              </span>
                            </p>

                            {buyer.isHighestPriceButNotBest && (
                              <p className="text-xs font-semibold text-on-surface bg-secondary-fixed/40 rounded-xl px-3 py-2 mb-3">
                                Advertises more per kg than the top buyer, but leaves you less money
                                once freight and expected crop loss are counted.
                              </p>
                            )}

                            {/* availabilityId preselects the same lot on the marketplace
                                page (it reads location.state.availabilityId), so the
                                farmer does not have to choose their crop a second time. */}
                            <button
                              onClick={() => navigate('/marketplace', {
                                state: {
                                  availabilityId: buyerListingId,
                                  crop: batch?.cropKey,
                                  quantityKg: batch?.quantityKg,
                                  farmId: farm?.id
                                }
                              })}
                              className="w-full px-4 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90 flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined text-base">chat</span>
                              <span>Contact this buyer</span>
                            </button>
                          </div>
                        ))}

                        {buyerMatches.length > 3 && (
                          <button
                            onClick={() => navigate('/marketplace', {
                              state: {
                                availabilityId: buyerListingId,
                                crop: batch?.cropKey,
                                quantityKg: batch?.quantityKg,
                                farmId: farm?.id
                              }
                            })}
                            className="w-full px-4 py-2.5 rounded-full bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container"
                          >
                            See all {buyerMatches.length} buyers for {batch?.crop} →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Saved selections are a shortcut back to a harvest already priced, so
          removing them touches no crop, field or deal — the wording says so. */}
      <ConfirmRemoveDialog
        open={removeDialogOpen}
        title={`Remove ${historyForRemoval.length === 1 ? 'this saved selection' : `these ${historyForRemoval.length} saved selections`}?`}
        description={
          `${historyForRemoval.length === 1 ? 'It is' : 'They are'} only a shortcut back to a ` +
          'harvest you priced before, kept on this device. Your crops, fields and deals are not ' +
          'affected.'
        }
        items={historyForRemoval.map((entry) => ({
          key: entry.id,
          primary: entry.crop,
          secondary: `${entry.farmName} • ${new Date(entry.timestamp).toLocaleDateString()}`,
          trailing: `${entry.quantityKg} kg`
        }))}
        confirmLabel={`Remove ${historyForRemoval.length}`}
        cancelLabel={`Keep ${historyForRemoval.length === 1 ? 'it' : 'them'}`}
        confirmDisabled={historyForRemoval.length === 0}
        onConfirm={handleRemoveSelected}
        onClose={() => setRemoveDialogOpen(false)}
      />

      <BatchSetupDialog
        open={dialogOpen}
        farms={farms}
        crops={crops}
        initialFarm={farm}
        initialBatch={batch}
        onApply={handleApplyBatch}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
};

export default Market;
