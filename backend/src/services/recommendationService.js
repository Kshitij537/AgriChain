const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';

// ─── Result cache: keyed by context hash, TTL = 10 minutes ───────────────────
// Subsequent requests with the same farm/NDVI/weather skip Gemini entirely.
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const _getCached = (key) => {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.value;
};
const _setCache = (key, value) => _cache.set(key, { value, ts: Date.now() });

// ─── In-flight deduplication: if two requests arrive at the same time ────────
// (e.g. FieldAnalytics + FarmBoundarySetup both calling /api/ndvi/advice)
// the second one awaits the first promise — only ONE Gemini call is made.
const _inflight = new Map();

const safeParseJSON = (text) => {
  if (!text || typeof text !== 'string') return null;
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  if (!clean) return null;

  try {
    return JSON.parse(clean);
  } catch (e1) {
    // 1. Remove trailing commas
    try {
      const sanitized = clean.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(sanitized);
    } catch (e2) {
      // 2. Attempt auto-recovery for truncated JSON objects
      try {
        let fixed = clean.replace(/,\s*$/, '');
        const quoteCount = (fixed.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) fixed += '"';

        const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
        const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;

        for (let i = 0; i < openBrackets; i++) fixed += ']';
        for (let i = 0; i < openBraces; i++) fixed += '}';

        const recovered = JSON.parse(fixed);
        console.log('[Recommendation Service] 🛠️ Recovered truncated Gemini JSON.');
        return recovered;
      } catch (e3) {
        console.warn('[Recommendation Service] Gemini response invalid, using fallback.');
        return null;
      }
    }
  }
};

// Startup log
if (!GEMINI_API_KEY) {
  console.warn('[Recommendation Service] ⚠️  GEMINI_API_KEY is not set. AI advice will use fallback.');
} else {
  console.log(`[Recommendation Service] ✅ Gemini configured: model=${GEMINI_MODEL}`);
}

const languageNames = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
};

const cropProfiles = {
  cotton: {
    label: 'Cotton',
    ndviTargets: 'Healthy cotton canopy is usually dense and uniform; falling NDVI often means moisture stress, nutrient imbalance, sucking pest pressure, or foliar disease.',
    weatherSignals: 'Cotton stress rises under prolonged heat, erratic irrigation, waterlogging after rain, and humid conditions that favor leaf disease and pest buildup.',
    priorityFocus: 'Check square retention, new leaf color, pest activity on tender growth, and patchy vigor across the field.',
  },
  soybean: {
    label: 'Soybean',
    ndviTargets: 'Healthy soybean should show quick canopy cover; weak NDVI often reflects poor nodulation, moisture stress, nutrient shortage, or disease in the lower canopy.',
    weatherSignals: 'Soybean is sensitive to extended leaf wetness, high humidity, standing water, and hot dry spells during flowering and pod fill.',
    priorityFocus: 'Inspect nodulation, lower leaves, canopy closure, moisture status, and any yellowing spreading from field pockets.',
  },
  orange: {
    label: 'Orange',
    ndviTargets: 'Healthy orange orchards maintain steady canopy vigor; NDVI decline often points to uneven irrigation, root stress, micronutrient deficiency, or citrus disease pressure.',
    weatherSignals: 'Orange trees respond strongly to humidity swings, heat load, poor drainage, and irrigation inconsistency around the root zone.',
    priorityFocus: 'Check flush growth, leaf chlorosis, fruit drop, root-zone moisture, and block-to-block canopy uniformity.',
  },
  default: {
    label: 'Selected Field',
    ndviTargets: 'Higher and stable NDVI generally indicates stronger canopy vigor, while decline suggests stress, uneven growth, or reduced biomass.',
    weatherSignals: 'Heat, humidity, rainfall timing, wind, and moisture imbalance can quickly change crop recovery speed and field risk.',
    priorityFocus: 'Inspect the weakest field zones first and compare canopy color, leaf posture, and soil moisture conditions.',
  },
};

const isMeaningfulCropType = (cropType) => {
  const value = String(cropType || '').trim().toLowerCase();
  if (!value) return false;
  return !['unknown', 'crop', 'general', 'selected field', 'field crop', '--', 'n/a', 'na'].includes(value);
};

const cleanList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5);
};

const getNdviBand = (ndvi) => {
  const value = Number(ndvi);
  if (!Number.isFinite(value)) {
    return {
      key: 'unknown',
      label: 'unknown',
      summary: 'NDVI reading is unavailable, so rely more on physical field scouting.',
    };
  }

  if (value >= 0.7) {
    return {
      key: 'strong',
      label: 'strong',
      summary: 'canopy vigor is strong and biomass cover looks healthy',
    };
  }

  if (value >= 0.45) {
    return {
      key: 'moderate',
      label: 'moderate',
      summary: 'canopy vigor is moderate and recovery depends on timely field management',
    };
  }

  return {
    key: 'weak',
    label: 'weak',
    summary: 'canopy vigor is weak and the field likely has active stress pockets',
  };
};

const getTrendBand = (trendPct, trendAbs) => {
  const pct = Number(trendPct);
  const abs = Number(trendAbs);
  if (!Number.isFinite(pct) && !Number.isFinite(abs)) {
    return { key: 'unknown', summary: 'recent NDVI trend is unavailable' };
  }

  const absText = Number.isFinite(abs) ? `${abs >= 0 ? '+' : ''}${abs.toFixed(2)} NDVI` : null;
  const pctText = Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : null;

  if ((Number.isFinite(abs) && abs >= 0.08) || (Number.isFinite(pct) && pct >= 20)) {
    return {
      key: 'rising',
      summary: `NDVI improved recently${absText ? ` by ${absText}` : ''}${pctText ? ` (${pctText})` : ''}`,
    };
  }

  if ((Number.isFinite(abs) && abs <= -0.08) || (Number.isFinite(pct) && pct <= -20)) {
    return {
      key: 'falling',
      summary: `NDVI declined recently${absText ? ` by ${absText}` : ''}${pctText ? ` (${pctText})` : ''}`,
    };
  }

  return {
    key: 'steady',
    summary: `NDVI has remained broadly stable${absText ? ` around ${absText}` : ''}${pctText ? ` (${pctText})` : ''}`,
  };
};

const getWeatherBand = (currentWeather = {}, forecast = []) => {
  const humidity = Number(currentWeather?.humidity);
  const temp = Number(currentWeather?.temp);
  const rainSoon = Array.isArray(forecast) && forecast.slice(0, 3).some((day) => Number(day?.rainChance) >= 60 || Number(day?.rainfall) >= 10);
  const hot = Number.isFinite(temp) && temp >= 34;
  const humid = Number.isFinite(humidity) && humidity >= 80;
  const dry = Number.isFinite(humidity) && humidity <= 45;

  if (rainSoon && humid) {
    return {
      key: 'wet_humid',
      summary: 'humid and rainy conditions may prolong leaf wetness and increase disease pressure',
    };
  }

  if (hot && dry) {
    return {
      key: 'hot_dry',
      summary: 'hot and dry conditions can increase evapotranspiration and moisture stress',
    };
  }

  if (hot) {
    return {
      key: 'hot',
      summary: 'high temperature can slow recovery and raise crop stress',
    };
  }

  if (humid) {
    return {
      key: 'humid',
      summary: 'high humidity can keep the canopy wet and raise disease risk',
    };
  }

  return {
    key: 'normal',
    summary: 'near-term weather looks manageable if irrigation and drainage stay balanced',
  };
};

const buildHeuristicAdvice = (context = {}, fallbackLanguage = 'en') => {
  const cropProfile = getCropProfile(context?.cropType);
  const hasKnownCropType = isMeaningfulCropType(context?.cropType);
  const ndviBand = getNdviBand(context?.ndvi);
  const trend7 = getTrendBand(context?.trend7d, context?.trend7dAbs);
  const trend30 = getTrendBand(context?.trend30d, context?.trend30dAbs);
  const weatherBand = getWeatherBand(context?.currentWeather, context?.weatherForecast);

  const currentTemp = Number(context?.currentWeather?.temp);
  const currentHumidity = Number(context?.currentWeather?.humidity);
  const isHi = fallbackLanguage === 'hi';
  const isMr = fallbackLanguage === 'mr';

  if (isHi || isMr) {
    return null;
  }

  const cropName = hasKnownCropType ? cropProfile.label : 'this field';
  const weatherSummaryParts = [];
  if (Number.isFinite(currentTemp)) weatherSummaryParts.push(`${currentTemp}C`);
  if (Number.isFinite(currentHumidity)) weatherSummaryParts.push(`${currentHumidity}% humidity`);
  const weatherSummary = weatherSummaryParts.length > 0 ? weatherSummaryParts.join(', ') : 'limited live weather data';
  const isSoybean = cropProfile.label === 'Soybean';
  const isCotton = cropProfile.label === 'Cotton';
  const isOrange = cropProfile.label === 'Orange';

  let irrigationGuidance = `Base irrigation on root-zone moisture and the next 3-day rainfall outlook.`;
  if (weatherBand.key === 'wet_humid') {
    irrigationGuidance = 'Hold or reduce irrigation in already moist zones and keep drainage channels open before more rain.';
  } else if (weatherBand.key === 'hot_dry' || weatherBand.key === 'hot') {
    irrigationGuidance = 'Prefer early morning or evening irrigation and avoid moisture stress in the most affected patches.';
  }
  if (hasKnownCropType && isSoybean) {
    irrigationGuidance = weatherBand.key === 'wet_humid'
      ? 'Avoid over-irrigating soybean blocks, protect root zones from waterlogging, and keep lower canopy humidity down.'
      : weatherBand.key === 'hot_dry' || weatherBand.key === 'hot'
      ? 'Protect soybean during flowering and pod-fill with timely light irrigation, especially in fast-drying patches.'
      : 'Keep soybean root-zone moisture even and avoid big wet-dry swings that interrupt nodulation and pod development.';
  } else if (hasKnownCropType && isCotton) {
    irrigationGuidance = weatherBand.key === 'wet_humid'
      ? 'Reduce unnecessary cotton irrigation and drain wet pockets quickly to avoid prolonged root stress.'
      : weatherBand.key === 'hot_dry' || weatherBand.key === 'hot'
      ? 'Time cotton irrigation to avoid heat stress and protect square and boll retention in weaker zones.'
      : irrigationGuidance;
  } else if (hasKnownCropType && isOrange) {
    irrigationGuidance = weatherBand.key === 'wet_humid'
      ? 'Avoid saturating orange root zones and ensure orchard basins drain freely after rain.'
      : weatherBand.key === 'hot_dry' || weatherBand.key === 'hot'
      ? 'Keep orange root-zone moisture steady with deep, even irrigation rather than short frequent cycles.'
      : 'Maintain uniform moisture across the orchard and avoid irregular irrigation between tree rows.';
  }

  let nutritionGuidance = `Use soil-test-led balanced nutrition and focus corrections on the weakest zones first.`;
  if (ndviBand.key === 'weak') {
    nutritionGuidance = `Check whether weak zones are linked to nitrogen, micronutrient, or root-zone stress before blanket fertilizer use.`;
  } else if (ndviBand.key === 'strong') {
    nutritionGuidance = `Maintain the current nutrient program and only correct localized deficiencies seen in weaker patches.`;
  }
  if (hasKnownCropType && isSoybean) {
    nutritionGuidance = ndviBand.key === 'weak'
      ? 'Check soybean nodulation, sulfur, potassium, and iron status before applying blanket fertilizer to weak patches.'
      : 'Protect soybean nodulation and use targeted sulfur, potash, or micronutrient correction only where canopy is lagging.';
  } else if (hasKnownCropType && isCotton) {
    nutritionGuidance = ndviBand.key === 'weak'
      ? 'Review cotton nitrogen-potash balance and check whether weak growth is tied to pests before extra fertilizer.'
      : 'Maintain balanced cotton N and K supply and correct only patchy deficiency zones, not the whole field.';
  } else if (hasKnownCropType && isOrange) {
    nutritionGuidance = ndviBand.key === 'weak'
      ? 'Check orange trees for zinc, iron, and root-zone stress before broad nutrient correction.'
      : 'Use targeted micronutrient support where canopy color is weak and keep orchard nutrition even block to block.';
  }

  const recommendations = [
    hasKnownCropType
      ? isSoybean
        ? 'Scout soybean lower canopy and weak patches before uniform areas'
        : isCotton
        ? 'Scout cotton tender growth and weak patches before uniform areas'
        : isOrange
        ? 'Scout weak orange tree rows before the stronger orchard blocks'
        : `Scout the weakest ${cropName.toLowerCase()} patches before the stronger areas`
      : 'Add the crop type to unlock truly crop-specific recommendations',
    isSoybean
      ? 'Inspect nodulation, lower leaves, canopy closure, and yellowing spread between patches'
      : cropProfile.priorityFocus,
    trend7.key === 'falling'
      ? 'Compare declining zones with irrigation, pest, and nutrient patterns'
      : isSoybean
      ? 'Record pod-fill and canopy differences between healthy and lagging soybean patches'
      : 'Record healthy and weak zones separately for the next scan',
  ];

  const watchouts = [
    isSoybean && ndviBand.key !== 'weak'
      ? 'Lower-canopy yellowing, poor nodulation, or patchy soybean closure'
      : ndviBand.key === 'weak'
      ? 'Patchy canopy or pale leaves in low-NDVI zones'
      : `New yellowing or uneven canopy growth despite acceptable NDVI`,
    isSoybean && weatherBand.key === 'wet_humid'
      ? 'Standing water, prolonged leaf wetness, and disease pressure in dense soybean canopy'
      : weatherBand.key === 'wet_humid'
      ? 'Standing water, persistent leaf wetness, or humid canopy pockets'
      : weatherBand.key === 'hot_dry'
      ? 'Leaf curling, midday wilt, or rapid topsoil drying'
      : 'Any sudden decline in new growth or canopy color',
    isSoybean && trend30.key !== 'falling'
      ? 'Weak patches failing to catch up during flowering or pod development'
      : trend30.key === 'falling'
      ? 'Repeated NDVI decline over multiple scans in the same field block'
      : 'Stress spreading from isolated patches into larger blocks',
  ];

  const priorityActions = [
    isSoybean && ndviBand.key !== 'weak'
      ? 'Inspect soybean root nodules and lower leaves in lagging patches today'
      : ndviBand.key === 'weak'
      ? 'Inspect low-vigor zones today and verify root-zone moisture'
      : 'Inspect variable zones and confirm canopy uniformity',
    isSoybean && weatherBand.key === 'wet_humid'
      ? 'Open drainage and reduce extra moisture in dense soybean patches'
      : weatherBand.key === 'wet_humid'
      ? 'Clear drainage paths and postpone unnecessary irrigation'
      : weatherBand.key === 'hot_dry' || weatherBand.key === 'hot'
      ? 'Protect moisture in stressed zones with timely irrigation'
      : 'Match irrigation timing to soil moisture and forecast',
    'Capture notes or photos from stressed patches for the next comparison',
  ];

  return {
    summary: hasKnownCropType
      ? `${cropProfile.label} analysis indicates ${ndviBand.summary}. The short-term signal suggests ${trend7.summary}, while field conditions around ${weatherSummary} mean ${weatherBand.summary}.`
      : `This field currently shows ${ndviBand.summary}. The short-term signal suggests ${trend7.summary}, but crop-specific advice will improve once the crop type is saved for this field.`,
    crop_analysis: hasKnownCropType
      ? `${cropProfile.label} should be evaluated by checking ${cropProfile.priorityFocus.toLowerCase()} This helps tie the NDVI pattern to crop-specific field behavior instead of treating it as a generic score.`
      : `Crop type is not set for this field yet. For now, inspect the weakest field zones first, compare canopy color, leaf posture, and soil moisture, and save the crop type so recommendations can become crop-specific.`,
    ndvi_analysis: hasKnownCropType
      ? `For ${cropProfile.label.toLowerCase()}, the current NDVI suggests that ${ndviBand.summary}. The longer pattern shows ${trend30.summary}, so use this reading to compare weak patches against uniform areas.`
      : `The current NDVI suggests that ${ndviBand.summary}. The longer pattern shows ${trend30.summary}, but the agronomic interpretation will be more accurate after the crop type is set.`,
    weather_analysis: hasKnownCropType
      ? `Current weather around ${weatherSummary} means ${weatherBand.summary}. For ${cropProfile.label.toLowerCase()}, this matters because ${cropProfile.weatherSignals.toLowerCase()}`
      : `Current weather around ${weatherSummary} means ${weatherBand.summary}. Without a saved crop type, use this mainly to guide irrigation, drainage, and on-ground scouting decisions.`,
    irrigation_guidance: irrigationGuidance,
    nutrition_guidance: nutritionGuidance,
    recommendations: cleanList(recommendations),
    watchouts: cleanList(watchouts),
    priority_actions: cleanList(priorityActions),
    tips: cleanList(recommendations),
    actions: cleanList(priorityActions),
  };
};

const normalizeAdvice = (payload, fallbackLanguage = 'en', context = {}) => {
  const summary = String(payload?.summary || '').trim();
  const cropAnalysis = String(payload?.crop_analysis || '').trim();
  const ndviAnalysis = String(payload?.ndvi_analysis || '').trim();
  const weatherAnalysis = String(payload?.weather_analysis || '').trim();
  const irrigationGuidance = String(payload?.irrigation_guidance || '').trim();
  const nutritionGuidance = String(payload?.nutrition_guidance || '').trim();
  let recommendations = cleanList(payload?.recommendations || payload?.tips);
  let watchouts = cleanList(payload?.watchouts);
  let priorityActions = cleanList(payload?.priority_actions || payload?.actions);

  const heuristic = buildHeuristicAdvice(context, fallbackLanguage);

  const isHi = fallbackLanguage === 'hi';
  const isMr = fallbackLanguage === 'mr';

  if (recommendations.length === 0) {
    recommendations = heuristic?.recommendations?.length
      ? heuristic.recommendations
      : isHi
      ? ['फसल के कमजोर हिस्सों की अलग से जांच करें', 'संतुलित पोषण और नमी प्रबंधन बनाए रखें']
      : isMr
      ? ['पिकाच्या कमकुवत भागांची स्वतंत्र तपासणी करा', 'संतुलित अन्नद्रव्ये आणि ओलावा व्यवस्थापन ठेवा']
      : ['Inspect weaker field patches separately', 'Maintain balanced nutrition and moisture management'];
  }

  if (watchouts.length === 0) {
    watchouts = heuristic?.watchouts?.length
      ? heuristic.watchouts
      : isHi
      ? ['पत्तियों में पीलेपन, धब्बों या मुरझाहट के शुरुआती लक्षण देखें', 'खेत के निचले हिस्सों में पानी जमा न होने दें']
      : isMr
      ? ['पानांवरील पिवळेपणा, डाग किंवा कोमेजणे यांची सुरुवातीची चिन्हे पहा', 'शेतातील सखल भागात पाणी साचू देऊ नका']
      : ['Watch for early yellowing, spots, or wilting', 'Avoid standing water in low-lying spots'];
  }

  if (priorityActions.length === 0) {
    priorityActions = heuristic?.priority_actions?.length
      ? heuristic.priority_actions
      : isHi
      ? ['आज ही कमजोर हिस्सों का निरीक्षण करें', 'सिंचाई और जल निकासी मार्गों की जांच करें']
      : isMr
      ? ['आजच कमकुवत भागांची पाहणी करा', 'सिंचन आणि निचरा मार्ग तपासा']
      : ['Inspect weaker crop zones today', 'Check irrigation and drainage pathways'];
  }

  return {
    summary: summary || heuristic?.summary || (isHi
      ? 'वर्तमान फसल, एनडीवीआई और मौसम संकेतों के आधार पर खेत की निगरानी जारी रखें।'
      : isMr
      ? 'सध्याच्या पीक, एनडीव्हीआय आणि हवामान संकेतांनुसार शेतावर लक्ष ठेवा.'
      : 'Keep monitoring the field based on crop condition, NDVI trend, and weather signals.'),
    crop_analysis: cropAnalysis || heuristic?.crop_analysis || (isHi
      ? 'फसल प्रकार के अनुसार कमजोर हिस्सों, पत्तियों के रंग और वृद्धि की एकरूपता की जांच करें।'
      : isMr
      ? 'पीक प्रकारानुसार कमकुवत भाग, पानांचा रंग आणि वाढीची एकसारखेपणा तपासा.'
      : 'Review crop-specific weak zones, leaf color, and canopy uniformity across the field.'),
    ndvi_analysis: ndviAnalysis || heuristic?.ndvi_analysis || (isHi
      ? 'एनडीवीआई स्कोर पौधों की हरियाली और कुल जीवंतता दिखाता है; गिरावट का मतलब तनाव हो सकता है।'
      : isMr
      ? 'एनडीव्हीआय गुणांक पिकाची हिरवाई आणि एकूण जोम दाखवतो; घट म्हणजे ताण असू शकतो.'
      : 'The NDVI score reflects canopy vigor and greenness; any decline can indicate developing stress.'),
    weather_analysis: weatherAnalysis || heuristic?.weather_analysis || (isHi
      ? 'तापमान, आर्द्रता और वर्षा की दिशा अगले कुछ दिनों में रिकवरी या जोखिम को प्रभावित करेगी।'
      : isMr
      ? 'तापमान, आर्द्रता आणि पावसाचा कल पुढील काही दिवसांत पुनर्प्राप्ती किंवा जोखीम ठरवेल.'
      : 'Temperature, humidity, and rainfall pattern will shape near-term recovery or stress risk.'),
    irrigation_guidance: irrigationGuidance || heuristic?.irrigation_guidance || (isHi
      ? 'सिंचाई का निर्णय मिट्टी की नमी और संभावित वर्षा को देखकर लें।'
      : isMr
      ? 'सिंचनाचा निर्णय मातीतील ओलावा आणि अपेक्षित पावसावर आधारित घ्या.'
      : 'Plan irrigation based on soil moisture status and expected rainfall.'),
    nutrition_guidance: nutritionGuidance || heuristic?.nutrition_guidance || (isHi
      ? 'मृदा परीक्षण के अनुसार संतुलित पोषण दें और कमी वाले खेत भागों पर ध्यान दें।'
      : isMr
      ? 'माती परीक्षणानुसार संतुलित अन्नद्रव्ये द्या आणि कमकुवत भागांवर लक्ष द्या.'
      : 'Use balanced nutrition according to soil need and focus on weaker field patches.'),
    recommendations,
    watchouts,
    priority_actions: priorityActions,
    tips: recommendations,
    actions: priorityActions,
  };
};

const getCropProfile = (cropType) => {
  const key = String(cropType || '').trim().toLowerCase();
  if (!key) return cropProfiles.default;
  if (key.includes('cotton')) return cropProfiles.cotton;
  if (key.includes('soy') || key.includes('soya')) return cropProfiles.soybean;
  if (key.includes('orange') || key.includes('citrus')) return cropProfiles.orange;
  return cropProfiles.default;
};

const formatForecast = (forecast = []) => {
  if (!Array.isArray(forecast) || forecast.length === 0) return 'Unavailable';
  return forecast
    .slice(0, 3)
    .map((day) => `${day.day || day.date}: ${day.high}C/${day.low}C, rain ${day.rainChance || 0}%, rainfall ${day.rainfall || 0}mm, humidity ${day.humidity || 'NA'}%`)
    .join(' | ');
};


const buildPrompt = ({
  cropType,
  ndvi,
  health,
  status,
  cloudCoverage,
  imageDate,
  trend7d,
  trend7dAbs,
  trend30d,
  trend30dAbs,
  currentWeather,
  weatherForecast,
  language = 'en',
}) => {
  const languageInstructions = {
    mr: 'CRITICAL INSTRUCTION: Write ALL text values in the output JSON strictly in Marathi (मराठी). Use fluent Devanagari script.',
    hi: 'CRITICAL INSTRUCTION: Write ALL text values in the output JSON strictly in Hindi (हिंदी). Use fluent Devanagari script.',
    en: 'CRITICAL INSTRUCTION: Write ALL text values in the output JSON strictly in English.',
  };
  const langInstruction = languageInstructions[language] || languageInstructions.en;

  const cropProfile = getCropProfile(cropType);
  return `
You are an expert agriculture assistant helping a farmer with practical, crop-specific field advice.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2 to 3 sentence field summary",
  "crop_analysis": "Detailed crop-specific interpretation",
  "ndvi_analysis": "Explain what this NDVI means for this crop",
  "weather_analysis": "Explain how current weather and the next 3 days affect this crop",
  "irrigation_guidance": "Watering guidance for the next 3 days",
  "nutrition_guidance": "Nutrition or recovery guidance tailored to this crop",
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "watchouts": ["risk 1", "risk 2", "risk 3"],
  "priority_actions": ["action 1", "action 2", "action 3"]
}

Rules:
- ${langInstruction}
- Be practical, detailed, and farmer-friendly.
- Make the analysis specific to the crop type first, then NDVI, then weather.
- Explain likely agronomic meaning, not just generic advice.
- Do not mention being an AI.
- If weather data is missing, say what to check on the ground instead of inventing.
- Keep each list item under 18 words.

Field context:
- Target Language: ${language}
- Crop type: ${cropType || 'Unknown crop'}
- Crop profile: ${cropProfile.label}
- Crop-specific NDVI interpretation: ${cropProfile.ndviTargets}
- Crop-specific weather sensitivity: ${cropProfile.weatherSignals}
- Crop-specific inspection focus: ${cropProfile.priorityFocus}
- NDVI: ${typeof ndvi === 'number' ? ndvi.toFixed(2) : 'Unknown'}
- Health status: ${health || 'Unknown'}
- NDVI interpretation: ${status || 'Not available'}
- Cloud coverage: ${cloudCoverage != null ? `${cloudCoverage}%` : 'Unknown'}
- Satellite image date: ${imageDate || 'Unknown'}
- 7-day NDVI percent change: ${trend7d != null ? `${trend7d}%` : 'Unknown'}
- 7-day NDVI absolute change: ${trend7dAbs != null ? trend7dAbs : 'Unknown'}
- 30-day NDVI percent change: ${trend30d != null ? `${trend30d}%` : 'Unknown'}
- 30-day NDVI absolute change: ${trend30dAbs != null ? trend30dAbs : 'Unknown'}
- Current weather: ${currentWeather ? `Temp ${currentWeather.temp ?? 'NA'}C, humidity ${currentWeather.humidity ?? 'NA'}%, condition ${currentWeather.description || currentWeather.condition || 'NA'}, wind ${currentWeather.windSpeed ?? 'NA'} km/h, rain ${currentWeather.precipitation ?? 0}mm` : 'Unavailable'}
- 3-day weather outlook: ${formatForecast(weatherForecast)}
`;
};

const generateFieldAdvice = async (context) => {
  if (!GEMINI_API_KEY) {
    console.warn('[Recommendation Service] GEMINI_API_KEY not configured. Using structured fallback.');
    return normalizeAdvice(null, context?.language);
  }

  const langKey = context?.language || 'en';
  const prompt = buildPrompt(context);
  const cacheKey = `field:${langKey}:${context?.cropType || 'crop'}:${context?.ndvi || '0'}:${context?.trend7d || 'na'}:${context?.trend30d || 'na'}:${context?.currentWeather?.temp || 'na'}:${context?.currentWeather?.humidity || 'na'}`;

  // 1. Check result cache (10 min TTL)
  const cached = _getCached(cacheKey);
  if (cached) { console.log(`[Recommendation Service] ✅ Serving field advice from cache (${langKey}).`); return cached; }

  // 2. Deduplicate concurrent requests — if the same call is already in-flight, wait for it
  if (_inflight.has(cacheKey)) {
    console.log('[Recommendation Service] ⏳ Awaiting in-flight field advice request (deduped).');
    return _inflight.get(cacheKey);
  }

  const url = `${GEMINI_API_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const promise = axios.post(
    url,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 1500 } },
    { timeout: 25000, headers: { 'Content-Type': 'application/json' } }
  ).then((response) => {
    const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return normalizeAdvice(null, context?.language, context);
    const parsed = safeParseJSON(text);
    const result = normalizeAdvice(parsed, context?.language, context);
    _setCache(cacheKey, result);
    return result;
  }).catch((error) => {
    if (error?.response?.status === 429) {
      console.warn('[Recommendation Service] ⚠️  Gemini rate limit (429). Quota exhausted for today. Using fallback.');
    } else {
      console.warn('[Recommendation Service] Gemini API error:', error.message);
    }
    return normalizeAdvice(null, context?.language, context);
  }).finally(() => {
    _inflight.delete(cacheKey);
  });

  _inflight.set(cacheKey, promise);
  return promise;
};




/**
 * Builds prompt combining Disease, Satellite NDVI, Weather, and Farm context
 */
const buildCombinedPrompt = ({
  diseaseName,
  severity,
  confidence,
  farmName,
  cropType,
  ndviValue,
  ndviHealth,
  temp,
  humidity,
  weatherDesc,
  language = 'en'
}) => {
  const languageInstructions = {
    mr: 'CRITICAL INSTRUCTION: Write ALL text values in the output JSON strictly in Marathi (मराठी). Use fluent Devanagari script.',
    hi: 'CRITICAL INSTRUCTION: Write ALL text values in the output JSON strictly in Hindi (हिंदी). Use fluent Devanagari script.',
    en: 'CRITICAL INSTRUCTION: Write ALL text values in the output JSON strictly in English.',
  };
  const langInstruction = languageInstructions[language] || languageInstructions.en;

  return `
You are an expert agricultural advisor providing an integrated field action plan for a farmer.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2-sentence overall summary of crop condition",
  "problem_analysis": "Clear explanation of how weather conditions (humidity/temp) and field satellite NDVI correlate with the detected leaf disease.",
  "immediate_actions": ["action 1", "action 2", "action 3"],
  "weather_irrigation_guidance": "Specific advice on watering, spraying, or humidity control for the next 3 days given weather",
  "ndvi_recovery_plan": "Nutrient, fertilizer, or crop vigor recovery steps tailored to the current NDVI status",
  "prevention": ["preventative measure 1", "preventative measure 2"]
}

Rules:
- ${langInstruction}
- Be practical, encouraging, and farmer-friendly.
- Do NOT mention AI, LLM, Gemini, or technology algorithms.
- Keep each list item concise (under 20 words).

Input Data:
- Target Language: ${language}
- Target Farm: ${farmName || 'Selected Field'} (${cropType || 'Crop'})
- Diagnosed Leaf Condition: ${diseaseName || 'Healthy'} (Severity: ${severity || 'Normal'}, Confidence: ${confidence ? `${(confidence * 100).toFixed(0)}%` : 'High'})
- Satellite NDVI Index: ${ndviValue != null ? Number(ndviValue).toFixed(2) : '0.65'} (${ndviHealth || 'Moderate Health'})
- Field Weather: ${temp != null ? `${temp}°C` : '28°C'}, Humidity: ${humidity != null ? `${humidity}%` : '65%'}, Condition: ${weatherDesc || 'Partly Cloudy'}
`;
};

/**
 * Normalizes combined multi-source advisory output with multi-language fallback support
 */
const normalizeCombinedAdvice = (payload, lang = 'en') => {
  const isHi = lang === 'hi';
  const isMr = lang === 'mr';

  const defaultSummary = isHi
    ? 'आपके खेत में फसल की स्थिति और मौसम के आंकड़ों का विश्लेषण पूर्ण हो गया है।'
    : isMr
      ? 'तुमच्या शेतातील पीक स्थिती आणि हवामान डेटाचे विश्लेषण पूर्ण झाले आहे.'
      : 'Comprehensive crop health analysis complete for your field.';

  const defaultAnalysis = isHi
    ? 'वर्तमान तापमान और आर्द्रता रोग के प्रसार को प्रभावित कर सकती है। एनडीवीआई उपग्रह स्कोर फसल के स्वास्थ्य की निगरानी कर रहा है।'
    : isMr
      ? 'सध्याचे तापमान आणि आर्द्रता रोगाच्या प्रसारावर परिणाम करू शकते. एनडीव्हीआय उपग्रह गुणधर्म पिकाच्या आरोग्यावर लक्ष ठेवून आहेत.'
      : 'Current temperature and humidity may influence disease progression. Satellite NDVI continues monitoring overall crop vigor.';

  const defaultActions = isHi
    ? ['प्रभावित पत्तियों को हटाएं', 'अनुशंसित कवकनाशी का छिड़काव करें', 'खेत में अतिरिक्त पानी जमा न होने दें']
    : isMr
      ? ['बाधित पाने काढून टाका', 'शिफारस केलेल्या बुरशीनाशकाची फवारणी करा', 'शेतात जास्त पाणी साचू देऊ नका']
      : ['Remove severely damaged leaves', 'Apply recommended crop protection treatment', 'Ensure good field drainage'];

  const defaultWeather = isHi
    ? 'आर्द्रता अधिक होने पर दोपहर के समय पानी देने से बचें और छिड़काव शुष्क मौसम में करें।'
    : isMr
      ? 'आर्द्रता जास्त असताना दुपारी पाणी देणे टाळा आणि कोरड्या हवामानात फवारणी करा.'
      : 'Avoid overhead watering during humid periods; spray during dry morning hours.';

  const defaultNDVI = isHi
    ? 'फसल की रिकवरी के लिए सूक्ष्म पोषक तत्वों और संतुलित एनपीके खाद का उपयोग करें।'
    : isMr
      ? 'पिकाच्या पुनर्प्राप्तीसाठी सूक्ष्म अन्नद्रव्ये आणि संतुलित एनपीके खताचा वापर करा.'
      : 'Apply balanced NPK nutrients and micronutrients to boost foliage recovery.';

  const defaultPrev = isHi
    ? ['फसल चक्र का पालन करें', 'स्वच्छ बीज का उपयोग करें']
    : isMr
      ? ['पिकांची आलटपालट करा', 'स्वच्छ बियाण्यांचा वापर करा']
      : ['Practice crop rotation', 'Maintain weed-free field boundaries'];

  return {
    summary: String(payload?.summary || defaultSummary).trim(),
    problem_analysis: String(payload?.problem_analysis || defaultAnalysis).trim(),
    immediate_actions: cleanList(payload?.immediate_actions).length > 0 ? cleanList(payload?.immediate_actions) : defaultActions,
    weather_irrigation_guidance: String(payload?.weather_irrigation_guidance || defaultWeather).trim(),
    ndvi_recovery_plan: String(payload?.ndvi_recovery_plan || defaultNDVI).trim(),
    prevention: cleanList(payload?.prevention).length > 0 ? cleanList(payload?.prevention) : defaultPrev
  };
};

/**
 * Generates unified multi-source Smart Field Advisory
 */
const generateCombinedFieldAdvisory = async (context) => {
  const lang = context.language || 'en';

  if (!GEMINI_API_KEY) {
    console.warn('[Recommendation Service] GEMINI_API_KEY not found. Using structured localized fallback.');
    return normalizeCombinedAdvice(null, lang);
  }

  const prompt = buildCombinedPrompt(context);
  const cacheKey = `combined:${lang}:${context.diseaseName || 'healthy'}:${context.farmName || 'farm'}`;

  // 1. Check result cache
  const cached = _getCached(cacheKey);
  if (cached) { console.log(`[Recommendation Service] ✅ Serving combined advisory from cache (${lang}).`); return cached; }

  // 2. Deduplicate concurrent requests
  if (_inflight.has(cacheKey)) {
    console.log('[Recommendation Service] ⏳ Awaiting in-flight combined advisory (deduped).');
    return _inflight.get(cacheKey);
  }

  const url = `${GEMINI_API_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const promise = axios.post(
    url,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 1500 } },
    { timeout: 25000, headers: { 'Content-Type': 'application/json' } }
  ).then((response) => {
    const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return normalizeCombinedAdvice(null, lang);
    const parsed = safeParseJSON(text);
    const result = normalizeCombinedAdvice(parsed, lang);
    _setCache(cacheKey, result);
    return result;
  }).catch((error) => {
    if (error?.response?.status === 429) {
      console.warn('[Recommendation Service] ⚠️  Gemini rate limit (429). Quota exhausted for today. Using fallback.');
    } else {
      console.warn('[Recommendation Service] Gemini request error, returning localized fallback:', error.message);
    }
    return normalizeCombinedAdvice(null, lang);
  }).finally(() => {
    _inflight.delete(cacheKey);
  });

  _inflight.set(cacheKey, promise);
  return promise;
};

module.exports = {
  generateFieldAdvice,
  generateCombinedFieldAdvisory,
  normalizeAdvice,
};
