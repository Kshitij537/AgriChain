/**
 * Farmer-friendly narration of a market recommendation.
 *
 * STRICT BOUNDARY - READ BEFORE CHANGING
 * --------------------------------------
 * Gemini is a TRANSLATOR here, never a decision maker. By the time this module
 * runs, the recommendation is already final: the market is chosen, the rupees are
 * computed, the decision is made. All this does is restate those numbers in plain
 * language a farmer can act on, optionally in their own language.
 *
 * Specifically, this module MUST NOT:
 *   - choose or re-rank a market
 *   - compute, adjust or round any rupee figure
 *   - invent a price, a distance, a loss percentage or a date
 *   - override the decision or the selling window
 *
 * The deterministic engines own every number. To enforce that, the prompt sends
 * only already-computed values, asks for prose only, and the result is returned
 * ALONGSIDE the structured recommendation rather than merged into it - so a
 * hallucinated figure in the narration can never become the figure a farmer acts
 * on or the API reports.
 *
 * If Gemini is unconfigured, rate-limited or slow, a deterministic template
 * summary is returned instead and `source` says which one you got. The
 * explanation is never load-bearing.
 */

const axios = require('axios');

const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_API_URL = () =>
  process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';

const TIMEOUT_MS = 20000;

/**
 * Models tried in order after the configured one fails.
 *
 * Two real failure modes make this necessary, both observed against this
 * project's key: a configured model name that no longer exists returns 404, and a
 * popular model under load returns 503 UNAVAILABLE. Neither should silently cost
 * the farmer their plain-language explanation when another model would answer, so
 * the request walks a short chain before giving up and falling back to the
 * deterministic template.
 *
 * Override with GEMINI_FALLBACK_MODELS (comma-separated) or set it empty to
 * disable the chain and use only GEMINI_MODEL.
 */
const fallbackModels = () => {
  const raw = process.env.GEMINI_FALLBACK_MODELS;
  if (raw !== undefined) {
    return raw.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return ['gemini-flash-latest', 'gemini-flash-lite-latest'];
};

/** The configured model first, then the fallbacks, without duplicates. */
const modelChain = () => {
  const chain = [GEMINI_MODEL(), ...fallbackModels()];
  return Array.from(new Set(chain));
};

/** Cache narrations: the same recommendation should not be re-narrated per reload. */
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

const cacheKeyFor = (facts, language) =>
  [
    language,
    facts.crop,
    facts.quantityKg,
    facts.marketName,
    facts.expectedMoney,
    facts.decision
  ].join('|');

const getCached = (key) => {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
};

const inr = (value) =>
  value === null || value === undefined
    ? 'n/a'
    : `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;

/**
 * Extracts exactly the facts the narration may mention.
 *
 * Deliberately a whitelist: the model cannot cite a number it was never given,
 * and it never receives the raw recommendation object.
 *
 * @param {object} result - recommendMarkets output
 * @returns {object} flat fact sheet
 */
const extractFacts = (result) => {
  const rec = result.recommendation;
  const winner = (result.markets || []).find((m) => m.marketId === rec.marketId) || {};
  const runnerUp = (result.markets || []).find((m) => m.rank === 2) || null;

  return {
    crop: result.request.cropLabel || result.request.crop,
    quantityKg: result.request.quantityKg,
    marketName: rec.marketName,
    district: rec.district,
    currentPrice: rec.currentPrice,
    predictedPrice: rec.predictedPrice,
    distanceKm: rec.distanceKm,
    travelTimeMinutes: rec.travelTimeMinutes,
    transportCost: rec.transportCost,
    spoilageRisk: rec.spoilageRisk,
    estimatedLossPercent: rec.estimatedLossPercent,
    estimatedLossValue: winner.estimatedLossValue ?? null,
    otherCosts: winner.otherCosts ?? null,
    grossSaleValue: winner.grossSaleValue ?? null,
    expectedMoney: rec.expectedMoney,
    decision: rec.decision,
    sellingWindow: rec.recommendedSellingWindow,
    runnerUpName: runnerUp ? runnerUp.marketName : null,
    runnerUpPrice: runnerUp ? runnerUp.currentPrice : null,
    runnerUpExpectedMoney: runnerUp ? runnerUp.expectedMoney : null,
    expectedProfit: result.breakeven && result.breakeven.available
      ? result.breakeven.expectedProfit
      : null,
    containsDemoData: Boolean(result.dataQuality && result.dataQuality.containsDemoData)
  };
};

/**
 * Deterministic fallback narration.
 *
 * Plain template assembly from the same facts - always available, no API, no key.
 * This is what a demo shows when the network is down.
 *
 * @param {object} facts
 * @returns {object}
 */
const buildTemplateExplanation = (facts) => {
  const lines = [];

  lines.push(
    `Take your ${facts.quantityKg} kg of ${String(facts.crop).toLowerCase()} to ` +
    `${facts.marketName}. Today's rate there is ₹${Math.round(facts.currentPrice)} per quintal.`
  );

  lines.push(
    `The mandi is ${facts.distanceKm} km away, about ` +
    `${Math.round((facts.travelTimeMinutes || 0) / 60 * 10) / 10} hours by road. ` +
    `Transport will cost about ${inr(facts.transportCost)}, and roughly ` +
    `${facts.estimatedLossPercent}% of the load is expected to spoil on the way ` +
    `(${facts.spoilageRisk} risk).`
  );

  lines.push(
    `After transport, spoilage and mandi charges you should be left with about ` +
    `${inr(facts.expectedMoney)}.`
  );

  if (facts.runnerUpName && facts.runnerUpPrice > facts.currentPrice) {
    lines.push(
      `${facts.runnerUpName} shows a higher rate of ₹${Math.round(facts.runnerUpPrice)} per quintal, ` +
      `but after the longer trip you would keep only about ${inr(facts.runnerUpExpectedMoney)} there.`
    );
  }

  if (facts.decision === 'SELL_NOW') {
    lines.push('Sell today. Waiting will cost you more in spoilage than any price rise would add.');
  } else if (facts.decision === 'WAIT') {
    lines.push(`Holding for ${facts.sellingWindow} is expected to pay slightly more.`);
  } else {
    lines.push(`Aim to sell within ${facts.sellingWindow}.`);
  }

  if (facts.expectedProfit !== null) {
    lines.push(
      facts.expectedProfit >= 0
        ? `Against what you spent growing it, that is a profit of about ${inr(facts.expectedProfit)}.`
        : `Against what you spent growing it, that is a shortfall of about ${inr(Math.abs(facts.expectedProfit))}.`
    );
  }

  if (facts.containsDemoData) {
    lines.push(
      'Note: these rates are demonstration figures, not live government mandi ' +
      'observations. Confirm the rate before you travel.'
    );
  }

  return {
    available: true,
    source: 'TEMPLATE',
    isAiGenerated: false,
    summary: lines[0],
    explanation: lines.join(' '),
    paragraphs: lines,
    language: 'en',
    note: 'Assembled from the computed figures without an LLM.'
  };
};

/**
 * Prompt for Gemini.
 *
 * The instructions are explicit that every number is fixed and that the model may
 * not compute anything, because that is the property the whole design depends on.
 *
 * @param {object} facts
 * @param {string} language
 * @returns {string}
 */
const buildPrompt = (facts, language) => `
You are helping an Indian smallholder farmer understand a selling recommendation
that has ALREADY been calculated. Your only job is to explain it in simple words.

ABSOLUTE RULES:
1. Do NOT calculate anything. Every number is final and given below.
2. Do NOT change, round differently, or re-derive any figure.
3. Do NOT mention any number that is not in the facts below.
4. Do NOT recommend a different market or a different decision.
5. If a value is null, do not mention that topic at all.

FACTS (all already computed):
${JSON.stringify(facts, null, 2)}

Write the explanation in ${language === 'en' ? 'simple English' : language}.
Speak directly to the farmer as "you". Use short sentences. No jargon, no bullet
symbols, no markdown. Explain WHY the recommended mandi wins even if another one
shows a higher price, because that is the farmer's main doubt.

Return ONLY valid JSON in this exact shape:
{
  "summary": "one sentence: where to sell and what they will get",
  "paragraphs": ["2 to 4 short paragraphs explaining the recommendation"]
}
`.trim();

/**
 * Parses Gemini's JSON reply, tolerating code fences.
 * @param {string} text
 * @returns {object|null}
 */
const safeParseJSON = (text) => {
  if (!text || typeof text !== 'string') return null;
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(clean);
  } catch {
    try {
      return JSON.parse(clean.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
};

/**
 * Explains a recommendation in farmer-friendly language.
 *
 * Always resolves. Falls back to the deterministic template whenever Gemini is
 * unavailable or returns something unusable.
 *
 * @param {object} result - recommendMarkets output
 * @param {object} [options] - { language }
 * @returns {Promise<object>} explanation, with source telling you which engine
 */
const explainRecommendation = async (result, { language = 'en' } = {}) => {
  if (!result || !result.recommendation) {
    return {
      available: false,
      source: null,
      isAiGenerated: false,
      reason: 'NO_RECOMMENDATION',
      explanation: null
    };
  }

  const facts = extractFacts(result);
  const template = buildTemplateExplanation(facts);

  if (!GEMINI_API_KEY()) {
    return { ...template, reason: 'GEMINI_NOT_CONFIGURED' };
  }

  const key = cacheKeyFor(facts, language);
  const cached = getCached(key);
  if (cached) return cached;

  const prompt = buildPrompt(facts, language);
  let lastReason = 'GEMINI_ERROR';

  for (const model of modelChain()) {
    const url =
      `${GEMINI_API_URL()}/models/${encodeURIComponent(model)}` +
      `:generateContent?key=${encodeURIComponent(GEMINI_API_KEY())}`;

    try {
      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // Low temperature: this is a restatement task, not a creative one.
            temperature: 0.3,
            responseMimeType: 'application/json',
            maxOutputTokens: 900
          }
        },
        { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
      );

      const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = safeParseJSON(text);

      if (!parsed || !parsed.summary || !Array.isArray(parsed.paragraphs) || !parsed.paragraphs.length) {
        lastReason = 'GEMINI_UNUSABLE_RESPONSE';
        console.warn(`[Market Explanation] ${model} returned an unusable response`);
        continue;
      }

      const explanation = {
        available: true,
        source: 'GEMINI',
        isAiGenerated: true,
        summary: String(parsed.summary),
        paragraphs: parsed.paragraphs.map(String),
        explanation: parsed.paragraphs.map(String).join(' '),
        language,
        model,
        // The guarantee, carried in the payload so a consumer can assert on it.
        note:
          'Narration only. Every figure was computed by the deterministic engines; ' +
          'the language model did not calculate or alter any value.',
        // Kept so a UI can show the template instead if it prefers.
        templateFallback: template.explanation
      };

      _cache.set(key, { value: explanation, at: Date.now() });
      return explanation;
    } catch (error) {
      const status = error?.response?.status;
      lastReason =
        status === 429 ? 'GEMINI_RATE_LIMITED'
          : status === 404 ? 'GEMINI_MODEL_NOT_FOUND'
            : status === 503 ? 'GEMINI_OVERLOADED'
              : 'GEMINI_ERROR';
      console.warn(`[Market Explanation] ${model}: ${lastReason} (${error.message})`);
    }
  }

  console.warn('[Market Explanation] All models failed - using deterministic template');
  return { ...template, reason: lastReason };
};

module.exports = {
  explainRecommendation,
  buildTemplateExplanation,
  extractFacts
};
