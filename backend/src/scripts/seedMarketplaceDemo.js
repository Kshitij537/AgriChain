/**
 * ============================================================================
 * DEMO / SEEDED DATA — CLEARLY FICTIONAL BUSINESSES
 * ============================================================================
 * Creates a working marketplace scenario so the feature can be demonstrated
 * before real buyers register.
 *
 * EVERY row written here is marked `is_demo_data = TRUE` and every business name
 * is prefixed `[DEMO]`, so nothing can be mistaken for a real company. Contact
 * details use the reserved `example.test` domain and 5550xxx numbers, which cannot
 * reach a real person. None of these businesses exists; none of these prices is a
 * quote from anybody.
 *
 * WHAT THE SCENARIO PROVES
 * ------------------------
 * Four crop markets, each built to make a different point, all of them ranked by
 * the SAME existing engine (buyerComparisonService -> routingService,
 * transportCostService, spoilageService, netReturnService). Nothing here
 * hard-codes a ranking; the numbers below were chosen so the real engine produces
 * a conclusion worth showing.
 *
 *   SOYBEAN  the nearest buyer ALSO pays the most, so the obvious answer is the
 *            right one — and a ₹47/kg buyer 215 km away loses ~₹9,000 to freight
 *   COTTON   ₹72/kg with the buyer collecting BEATS ₹75/kg with the farmer
 *            delivering. The headline price is not the answer.
 *   ORANGE   the highest advertised price (₹40/kg, Buldhana, ~295 km) finishes
 *            LAST once freight and the spoilage of a perishable crop are counted
 *            — and that buyer is the one unverified business in the set
 *   TOMATO   the original two-buyer scenario, preserved unchanged
 *
 * HOW IT IS BUILT
 * ---------------
 * Through the real services, not raw INSERTs, so the demo exercises the same code
 * paths the product does:
 *
 *   buyerService.createProfile          buyer profile + buyer role, one transaction
 *   buyerService.submitForVerification  the only status change a buyer may cause
 *   buyerService.reviewVerification     verification granted by a DEMO ADMIN account,
 *                                       which is the only path to `verified`
 *   requirementService.create/close     requirement lifecycle
 *   availabilityService.create          the farmer's four quantity buckets
 *   offerService.create/counter         the seeded negotiation
 *
 * The services that predate `is_demo_data` (conversations, messages, offers) are
 * flagged afterwards by `markDemoRows`, scoped to the demo accounts, rather than
 * by editing those services.
 *
 * Usage:
 *   npm run seed:marketplace             seed the demo
 *   npm run seed:marketplace -- --clear  remove it again
 * ============================================================================
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/db');

const buyerService = require('../services/buyerService');
const requirementService = require('../services/requirementService');
const availabilityService = require('../services/availabilityService');
const conversationService = require('../services/conversationService');
const offerService = require('../services/offerService');
const roleService = require('../services/roleService');

/** Prefix on every seeded business name, so demo rows are obvious on screen. */
const DEMO_PREFIX = '[DEMO]';

/** A shared, obviously-fake password. Demo accounts are not for production use. */
const DEMO_PASSWORD = 'demo-only-not-secure';

/**
 * Every demo account lives on this domain. `clearDemoData` keys off it, which is
 * what makes the seed idempotent across renames: an account seeded by an earlier
 * version of this script is still found and removed.
 *
 * example.test is reserved by RFC 6761 and can never be a real domain.
 */
const DEMO_EMAIL_DOMAIN = '@example.test';

/**
 * Approximate coordinates for the Vidarbha towns used below.
 *
 * Town-centre accuracy, which is all the comparison needs — distance decides the
 * freight, and a few hundred metres does not change a 200 km haul. Marked demo
 * data wherever they are stored.
 */
const PLACES = {
  hingna: { label: 'Hingna, Nagpur', district: 'Nagpur', lat: 21.0046, lon: 79.0477, pin: '441110' },
  nagpur: { label: 'Nagpur', district: 'Nagpur', lat: 21.1458, lon: 79.0882, pin: '440001' },
  butibori: { label: 'Butibori MIDC, Nagpur', district: 'Nagpur', lat: 20.9333, lon: 78.9833, pin: '441122' },
  kalmeshwar: { label: 'Kalmeshwar, Nagpur', district: 'Nagpur', lat: 21.2302, lon: 78.9203, pin: '441501' },
  katol: { label: 'Katol, Nagpur', district: 'Nagpur', lat: 21.2716, lon: 78.5859, pin: '441302' },
  wardha: { label: 'Wardha', district: 'Wardha', lat: 20.7453, lon: 78.6022, pin: '442001' },
  amravati: { label: 'Amravati', district: 'Amravati', lat: 20.9320, lon: 77.7520, pin: '444601' },
  akola: { label: 'Akola', district: 'Akola', lat: 20.7002, lon: 77.0082, pin: '444001' },
  yavatmal: { label: 'Yavatmal', district: 'Yavatmal', lat: 20.3888, lon: 78.1204, pin: '445001' },
  buldhana: { label: 'Buldhana', district: 'Buldhana', lat: 20.5292, lon: 76.1842, pin: '443001' }
};

/**
 * Demo accounts.
 *
 * `admin` exists so verification is granted the way the product grants it — an
 * administrator reviewing a submission — instead of the seed writing
 * `verification_status` straight into the column. buyerService.reviewVerification
 * refuses any caller without the admin role, and that check is not bypassed here.
 */
const DEMO_USERS = [
  { key: 'farmer', fullName: `${DEMO_PREFIX} Demo Farmer`, email: `demo-farmer${DEMO_EMAIL_DOMAIN}`, phone: '05550000101' },
  { key: 'admin', fullName: `${DEMO_PREFIX} Demo Verification Admin`, email: `demo-admin${DEMO_EMAIL_DOMAIN}`, phone: '05550000100' },

  // --- the original tomato scenario, preserved ---
  { key: 'buyerA', fullName: `${DEMO_PREFIX} Amravati Agro Processing`, email: `demo-buyer-a${DEMO_EMAIL_DOMAIN}`, phone: '05550000102' },
  { key: 'buyerB', fullName: `${DEMO_PREFIX} Nagpur Fresh Traders`, email: `demo-buyer-b${DEMO_EMAIL_DOMAIN}`, phone: '05550000103' },

  // --- soybean / orange / cotton ---
  { key: 'soyProcessor', fullName: `${DEMO_PREFIX} Vidarbha Soy Foods Pvt. Ltd.`, email: `buyer-soy-processor${DEMO_EMAIL_DOMAIN}`, phone: '05550000111' },
  { key: 'soyTrader', fullName: `${DEMO_PREFIX} Maharashtra Soybean Traders`, email: `buyer-soy-trader${DEMO_EMAIL_DOMAIN}`, phone: '05550000112' },
  { key: 'wardhaProcessor', fullName: `${DEMO_PREFIX} Wardha Oilseed & Ginning Works`, email: `buyer-wardha-processor${DEMO_EMAIL_DOMAIN}`, phone: '05550000113' },
  { key: 'orangeProcessor', fullName: `${DEMO_PREFIX} Nagpur Orange Processing Co.`, email: `buyer-orange-processor${DEMO_EMAIL_DOMAIN}`, phone: '05550000114' },
  { key: 'orangeTrader', fullName: `${DEMO_PREFIX} Vidarbha Citrus Traders`, email: `buyer-orange-trader${DEMO_EMAIL_DOMAIN}`, phone: '05550000115' },
  { key: 'cottonGinner', fullName: `${DEMO_PREFIX} Vidarbha Cotton Ginners`, email: `buyer-cotton-ginner${DEMO_EMAIL_DOMAIN}`, phone: '05550000116' },
  { key: 'cottonTrader', fullName: `${DEMO_PREFIX} Maharashtra Cotton Trading House`, email: `buyer-cotton-trader${DEMO_EMAIL_DOMAIN}`, phone: '05550000117' },
  { key: 'buldhanaFruit', fullName: `${DEMO_PREFIX} Buldhana Fresh Fruit Company`, email: `buyer-buldhana-fruit${DEMO_EMAIL_DOMAIN}`, phone: '05550000118' }
];

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Non-routable demo contact details, withheld from farmers by buyerService.toPublic(). */
const DEMO_PHONE = '05550000199';

/**
 * The farmer's fields.
 *
 * `listed: true` gets a seeded availability row, so the marketplace is populated
 * the moment the demo starts. `listed: false` is a SPARE field with no
 * availability, so "Add crop" during the demo has a pre-filled suggestion to pick
 * — the seed must not be the reason a live demo cannot add a crop.
 */
const FARMER_PLOTS = [
  {
    key: 'soy',
    name: `${DEMO_PREFIX} Hingna Soybean Plot`,
    place: PLACES.hingna,
    cropType: 'Soybean',
    areaHectares: 2.0,
    listed: true,
    availability: {
      crop: 'soybean', variety: 'JS-335', qualityGrade: 'A',
      totalHarvestedKg: 1000, availableKg: 1000,
      harvestStatus: 'harvested', storageType: 'warehouse'
    }
  },
  {
    key: 'orange',
    name: `${DEMO_PREFIX} Kalmeshwar Orange Orchard`,
    place: PLACES.kalmeshwar,
    cropType: 'Orange',
    areaHectares: 1.2,
    listed: true,
    availability: {
      crop: 'orange', variety: 'Nagpur Santra', qualityGrade: 'A',
      totalHarvestedKg: 1000, availableKg: 1000,
      harvestStatus: 'harvested', storageType: 'packed'
    }
  },
  {
    key: 'cotton',
    name: `${DEMO_PREFIX} Hingna Cotton Plot`,
    place: { ...PLACES.hingna, lat: 21.0120, lon: 79.0350 },
    cropType: 'Cotton',
    areaHectares: 2.5,
    listed: true,
    availability: {
      crop: 'cotton', variety: 'Bt Cotton', qualityGrade: 'A',
      totalHarvestedKg: 1000, availableKg: 1000,
      harvestStatus: 'harvested', storageType: 'warehouse'
    }
  },
  {
    key: 'tomato',
    name: `${DEMO_PREFIX} Hingna Tomato Plot`,
    place: PLACES.hingna,
    cropType: 'Tomato',
    areaHectares: 1.5,
    listed: true,
    availability: {
      crop: 'tomato', variety: 'Hybrid', qualityGrade: 'A',
      totalHarvestedKg: 500, availableKg: 500,
      harvestStatus: 'harvested', storageType: 'open'
    }
  },

  // --- spare fields, deliberately NOT listed ---
  {
    key: 'soySpare',
    name: `${DEMO_PREFIX} Hingna Soybean Plot 2 — not yet listed`,
    place: { ...PLACES.hingna, lat: 20.9980, lon: 79.0410 },
    cropType: 'Soybean', areaHectares: 1.4, listed: false
  },
  {
    key: 'orangeSpare',
    name: `${DEMO_PREFIX} Katol Orange Orchard — not yet listed`,
    place: PLACES.katol,
    cropType: 'Orange', areaHectares: 1.0, listed: false
  },
  {
    key: 'cottonSpare',
    name: `${DEMO_PREFIX} Hingna Cotton Plot 2 — not yet listed`,
    place: { ...PLACES.hingna, lat: 21.0205, lon: 79.0290 },
    cropType: 'Cotton', areaHectares: 1.8, listed: false
  }
];

/**
 * The buyers and what they want.
 *
 * `verify: true` goes through submit -> admin review. The one buyer left
 * unverified is there so the demo can show that the badge means something, and it
 * is also the buyer advertising the highest orange price — which is the whole
 * point of showing it.
 *
 * `pickup: true` means the buyer collects at their own cost, so the farmer's
 * freight is a real zero rather than an assumed one (see
 * buyerComparisonService.resolveTransportResponsibility). `pickup: false` means
 * the farmer delivers and pays.
 *
 * No requirement sets `variety`: every one of these buyers takes the common
 * local variety, and a stray variety string would exclude a matching farmer for
 * no commercial reason.
 */
const BUYERS = [
  // =======================================================================
  // SOYBEAN
  // =======================================================================
  {
    key: 'soyProcessor',
    businessName: `${DEMO_PREFIX} Vidarbha Soy Foods Pvt. Ltd.`,
    buyerType: 'processor',
    place: PLACES.butibori,
    cropsPurchased: ['soybean'],
    typicalPurchaseQuantityKg: 20000,
    serviceAreaKm: 150,
    verify: true,
    requirements: [
      {
        code: 'SOY-1',
        crop: 'soybean',
        minimumQualityGrade: 'B',
        quantityRequiredKg: 2000,
        offeredPricePerKg: 50.00,
        pickup: false,
        deliveryPlace: PLACES.butibori,
        deliveryLocation: 'Soybean crushing unit, Butibori MIDC, Nagpur (demo address)',
        requiredIn: 10,
        expiresIn: 24,
        description:
          'Crushing-grade soybean for our Butibori unit. Moisture under 12% preferred. ' +
          'Farmer delivers to the unit gate.'
      }
    ]
  },
  {
    key: 'soyTrader',
    businessName: `${DEMO_PREFIX} Maharashtra Soybean Traders`,
    buyerType: 'wholesaler',
    place: PLACES.akola,
    cropsPurchased: ['soybean', 'cotton'],
    typicalPurchaseQuantityKg: 50000,
    serviceAreaKm: 300,
    verify: true,
    requirements: [
      {
        code: 'SOY-2',
        crop: 'soybean',
        quantityRequiredKg: 5000,
        offeredPricePerKg: 47.00,
        pickup: false,
        deliveryPlace: PLACES.akola,
        deliveryLocation: 'Grain godown, Akola APMC yard road (demo address)',
        requiredIn: 14,
        expiresIn: 28,
        description:
          'Bulk soybean for onward trade. We take any lot size. Delivery to our Akola ' +
          'godown — the farmer arranges and pays for transport.'
      }
    ]
  },
  {
    key: 'wardhaProcessor',
    businessName: `${DEMO_PREFIX} Wardha Oilseed & Ginning Works`,
    buyerType: 'processor',
    place: PLACES.wardha,
    cropsPurchased: ['soybean', 'cotton'],
    typicalPurchaseQuantityKg: 30000,
    serviceAreaKm: 150,
    verify: true,
    requirements: [
      {
        code: 'SOY-3',
        crop: 'soybean',
        quantityRequiredKg: 1000,
        offeredPricePerKg: 48.50,
        // The decisive difference on this one: we send our own vehicle.
        pickup: true,
        deliveryPlace: PLACES.wardha,
        deliveryLocation: 'Oilseed unit, Wardha (we collect from the farm)',
        requiredIn: 7,
        expiresIn: 21,
        description:
          'Small soybean lots welcome. OUR VEHICLE COLLECTS FROM YOUR FARM at our ' +
          'cost — you pay no transport.'
      },
      // =================================================================
      // COTTON (same buyer, second requirement — gins as well as crushes)
      // =================================================================
      {
        code: 'COT-3',
        crop: 'cotton',
        quantityRequiredKg: 10000,
        offeredPricePerKg: 70.00,
        pickup: false,
        deliveryPlace: PLACES.wardha,
        deliveryLocation: 'Ginning factory, Wardha (demo address)',
        requiredIn: 18,
        expiresIn: 32,
        description:
          'Seed cotton (kapas) for the ginning line. Large volume, steady offtake. ' +
          'Farmer delivers to the factory.'
      }
    ]
  },

  // =======================================================================
  // ORANGE
  // =======================================================================
  {
    key: 'orangeProcessor',
    businessName: `${DEMO_PREFIX} Nagpur Orange Processing Co.`,
    buyerType: 'processor',
    place: PLACES.nagpur,
    cropsPurchased: ['orange'],
    typicalPurchaseQuantityKg: 15000,
    serviceAreaKm: 150,
    verify: true,
    requirements: [
      {
        code: 'ORG-1',
        crop: 'orange',
        quantityRequiredKg: 3000,
        offeredPricePerKg: 35.00,
        // Farm-gate price: lower per kg, but we collect.
        pickup: true,
        deliveryPlace: PLACES.nagpur,
        deliveryLocation: 'Juice and pulp unit, Nagpur (we collect from the orchard)',
        requiredIn: 6,
        expiresIn: 16,
        description:
          'Santra for juicing. FARM-GATE PRICE — our vehicle collects from your ' +
          'orchard, so you pay no transport and the fruit travels less.'
      },
      {
        code: 'ORG-3',
        crop: 'orange',
        quantityRequiredKg: 1500,
        offeredPricePerKg: 38.00,
        // Same buyer, delivered price: higher per kg, farmer pays the freight.
        pickup: false,
        deliveryPlace: PLACES.nagpur,
        deliveryLocation: 'Juice and pulp unit, Nagpur — delivered at gate (demo address)',
        requiredIn: 6,
        expiresIn: 16,
        description:
          'DELIVERED PRICE for the same fruit as our farm-gate offer. Higher per kg, ' +
          'but you arrange and pay for the trip. Compare the two.'
      }
    ]
  },
  {
    key: 'orangeTrader',
    businessName: `${DEMO_PREFIX} Vidarbha Citrus Traders`,
    buyerType: 'wholesaler',
    place: PLACES.amravati,
    cropsPurchased: ['orange'],
    typicalPurchaseQuantityKg: 40000,
    serviceAreaKm: 250,
    verify: true,
    requirements: [
      {
        code: 'ORG-2',
        crop: 'orange',
        quantityRequiredKg: 5000,
        offeredPricePerKg: 32.00,
        pickup: false,
        deliveryPlace: PLACES.amravati,
        deliveryLocation: 'Fruit market, Amravati (demo address)',
        requiredIn: 9,
        expiresIn: 20,
        description:
          'Table-grade santra for the Amravati fruit market. Farmer delivers.'
      }
    ]
  },
  {
    key: 'buldhanaFruit',
    businessName: `${DEMO_PREFIX} Buldhana Fresh Fruit Company`,
    buyerType: 'wholesaler',
    place: PLACES.buldhana,
    cropsPurchased: ['orange'],
    typicalPurchaseQuantityKg: 25000,
    // Wide, because they buy right across Vidarbha — which is exactly why the
    // freight on a load from Nagpur is ruinous for the farmer.
    serviceAreaKm: 350,
    // THE ONE UNVERIFIED BUYER. Left as buyerService.createProfile leaves every
    // new account: 'unverified'. Nothing here grants it a badge.
    verify: false,
    requirements: [
      {
        code: 'ORG-4',
        crop: 'orange',
        quantityRequiredKg: 1500,
        // The highest advertised orange price in the whole marketplace.
        offeredPricePerKg: 40.00,
        pickup: false,
        deliveryPlace: PLACES.buldhana,
        deliveryLocation: 'Cold store, Buldhana (demo address)',
        requiredIn: 12,
        expiresIn: 26,
        description:
          'Top rate paid for good santra, delivered to Buldhana. Farmer arranges ' +
          'transport. (Demo business — deliberately left unverified.)'
      }
    ]
  },

  // =======================================================================
  // COTTON
  // =======================================================================
  {
    key: 'cottonGinner',
    businessName: `${DEMO_PREFIX} Vidarbha Cotton Ginners`,
    buyerType: 'processor',
    place: PLACES.yavatmal,
    cropsPurchased: ['cotton'],
    typicalPurchaseQuantityKg: 60000,
    serviceAreaKm: 250,
    verify: true,
    requirements: [
      {
        code: 'COT-1',
        crop: 'cotton',
        minimumQualityGrade: 'B',
        quantityRequiredKg: 5000,
        // The highest advertised cotton price.
        offeredPricePerKg: 75.00,
        pickup: false,
        deliveryPlace: PLACES.yavatmal,
        deliveryLocation: 'Ginning and pressing unit, Yavatmal (demo address)',
        requiredIn: 15,
        expiresIn: 30,
        description:
          'Clean seed cotton, trash under 5%. Best rate in the district, but ' +
          'delivery to Yavatmal is the farmer\'s arrangement.'
      }
    ]
  },
  {
    key: 'cottonTrader',
    businessName: `${DEMO_PREFIX} Maharashtra Cotton Trading House`,
    buyerType: 'wholesaler',
    place: PLACES.akola,
    cropsPurchased: ['cotton'],
    typicalPurchaseQuantityKg: 45000,
    serviceAreaKm: 300,
    verify: true,
    requirements: [
      {
        code: 'COT-2',
        crop: 'cotton',
        quantityRequiredKg: 3000,
        offeredPricePerKg: 72.00,
        // ₹3/kg less than Yavatmal, but we send the truck.
        pickup: true,
        deliveryPlace: PLACES.akola,
        deliveryLocation: 'Cotton yard, Akola (we collect from the farm)',
        requiredIn: 12,
        expiresIn: 26,
        description:
          'We buy at the farm. OUR TRUCK COLLECTS at our cost — ₹3/kg less on paper ' +
          'than a delivered sale, and usually more money in your hand.'
      }
    ]
  },

  // =======================================================================
  // TOMATO — the original scenario, preserved exactly
  // =======================================================================
  {
    key: 'buyerA',
    businessName: `${DEMO_PREFIX} Amravati Agro Processing`,
    buyerType: 'processor',
    place: PLACES.amravati,
    cropsPurchased: ['tomato', 'onion'],
    typicalPurchaseQuantityKg: 2000,
    serviceAreaKm: 300,
    verify: true,
    requirements: [
      {
        code: 'TOM-1',
        crop: 'tomato',
        minimumQualityGrade: 'B',
        quantityRequiredKg: 1000,
        offeredPricePerKg: 31.00,
        pickup: false,
        deliveryPlace: PLACES.amravati,
        deliveryLocation: 'Amravati Agro Processing Unit, MIDC Amravati (demo address)',
        requiredIn: 7,
        expiresIn: 12,
        description: 'Farmer delivers to our unit.'
      }
    ]
  },
  {
    key: 'buyerB',
    businessName: `${DEMO_PREFIX} Nagpur Fresh Traders`,
    buyerType: 'wholesaler',
    place: PLACES.nagpur,
    cropsPurchased: ['tomato', 'onion'],
    typicalPurchaseQuantityKg: 2000,
    serviceAreaKm: 300,
    verify: false,
    requirements: [
      {
        code: 'TOM-2',
        crop: 'tomato',
        quantityRequiredKg: 500,
        offeredPricePerKg: 28.00,
        pickup: true,
        deliveryPlace: PLACES.nagpur,
        deliveryLocation: 'Kalamna Market Yard, Nagpur (we collect from the farm)',
        requiredIn: 5,
        expiresIn: 9,
        description: 'We collect from the farm at our own cost.'
      }
    ]
  }
];

/**
 * Requirements that must NOT appear to a farmer, seeded on purpose.
 *
 * The brief asks for proof that closed and expired requirements are filtered out.
 * Asserting it on data that does not exist proves nothing, so these two exist and
 * the seed's own verification step checks they are absent from the matches.
 *
 * `expiredSoybean` is dated in the past; requirementService.expireStale() flips it
 * to 'expired' on the next read, which is the product's real mechanism.
 */
const NEGATIVE_CONTROLS = [
  {
    code: 'SOY-EXPIRED',
    buyerKey: 'soyTrader',
    crop: 'soybean',
    quantityRequiredKg: 4000,
    offeredPricePerKg: 55.00,
    pickup: true,
    deliveryPlace: PLACES.akola,
    deliveryLocation: 'Akola godown (demo address) — EXPIRED requirement',
    requiredIn: -10,
    expiresIn: -3,
    finalStatus: 'expired',
    description:
      'DEMO NEGATIVE CONTROL — this requirement has passed its date. It advertises ' +
      'the highest soybean price in the seed and must never appear in a match.'
  },
  {
    code: 'COT-CLOSED',
    buyerKey: 'cottonGinner',
    crop: 'cotton',
    quantityRequiredKg: 8000,
    offeredPricePerKg: 82.00,
    pickup: true,
    deliveryPlace: PLACES.yavatmal,
    deliveryLocation: 'Yavatmal gin (demo address) — CLOSED requirement',
    requiredIn: 20,
    expiresIn: 40,
    finalStatus: 'closed',
    description:
      'DEMO NEGATIVE CONTROL — the buyer closed this requirement. It advertises the ' +
      'highest cotton price in the seed and must never appear in a match.'
  }
];

// ===========================================================================
// Cleanup
// ===========================================================================

/**
 * Removes every demo row.
 *
 * ORDERING IS NOT ARBITRARY. marketplace_deals.accepted_offer_id and
 * .requirement_id are ON DELETE RESTRICT, so deals must go before offers and
 * offers before requirements. Deleting the users first would fail on those
 * constraints, which is why the users table is last.
 *
 * Scoped to accounts on the reserved demo domain, then followed by a sweep of
 * anything flagged `is_demo_data` whoever owns it. Real, non-demo rows are never
 * touched by either pass.
 *
 * @returns {Promise<void>}
 */
const clearDemoData = async () => {
  const users = await query(
    'SELECT id FROM users WHERE email LIKE $1',
    [`%${DEMO_EMAIL_DOMAIN}`]
  );
  const ids = users.rows.map((r) => r.id);

  if (ids.length) {
    await query('DELETE FROM marketplace_deals WHERE farmer_user_id = ANY($1::int[]) OR buyer_user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM marketplace_offers WHERE sender_id = ANY($1::int[]) OR recipient_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM marketplace_messages WHERE sender_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM marketplace_conversations WHERE farmer_user_id = ANY($1::int[]) OR buyer_user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM marketplace_notifications WHERE recipient_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM marketplace_reports WHERE reporter_id = ANY($1::int[]) OR reported_user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM buyer_requirements WHERE buyer_id IN (SELECT id FROM buyer_profiles WHERE user_id = ANY($1::int[]))', [ids]);
    await query('DELETE FROM farmer_crop_availability WHERE user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM buyer_profiles WHERE user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM farms WHERE user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM user_roles WHERE user_id = ANY($1::int[])', [ids]);
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  }

  // Belt and braces: anything flagged as demo, whoever owns it. Same dependency
  // order, for the same reason.
  await query('DELETE FROM marketplace_deals WHERE is_demo_data = TRUE');
  await query('DELETE FROM marketplace_offers WHERE is_demo_data = TRUE');
  await query('DELETE FROM marketplace_messages WHERE is_demo_data = TRUE');
  await query('DELETE FROM marketplace_conversations WHERE is_demo_data = TRUE');
  await query('DELETE FROM marketplace_notifications WHERE is_demo_data = TRUE');
  await query('DELETE FROM buyer_requirements WHERE is_demo_data = TRUE');
  await query('DELETE FROM farmer_crop_availability WHERE is_demo_data = TRUE');
  await query('DELETE FROM buyer_profiles WHERE is_demo_data = TRUE');

  console.log(`[Demo Seed] Removed demo data for ${ids.length} demo account(s).`);
};

/**
 * Flags the rows written by services that predate `is_demo_data`.
 *
 * conversationService, offerService and (on the offer path) notificationService
 * do not set the column. Changing them to take a demo flag would put a seeding
 * concern into production code for no benefit, so the seed labels its own rows
 * afterwards instead — scoped to the demo accounts, so nothing else is relabelled.
 *
 * @param {Array<number>} demoUserIds
 * @returns {Promise<object>} rows flagged per table
 */
const markDemoRows = async (demoUserIds) => {
  const counts = {};
  const flag = async (table, whereSql) => {
    const result = await query(
      `UPDATE ${table} SET is_demo_data = TRUE WHERE is_demo_data = FALSE AND (${whereSql})`,
      [demoUserIds]
    );
    counts[table] = result.rowCount;
  };

  await flag('marketplace_conversations', 'farmer_user_id = ANY($1::int[]) OR buyer_user_id = ANY($1::int[])');
  await flag('marketplace_messages',
    'sender_id = ANY($1::int[]) OR conversation_id IN (SELECT id FROM marketplace_conversations WHERE is_demo_data = TRUE)');
  await flag('marketplace_offers', 'sender_id = ANY($1::int[]) OR recipient_id = ANY($1::int[])');
  await flag('marketplace_notifications', 'recipient_id = ANY($1::int[])');

  return counts;
};

// ===========================================================================
// Seeding
// ===========================================================================

/**
 * Creates (or refreshes) the demo accounts.
 * @returns {Promise<object>} key -> users.id
 */
const seedAccounts = async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds = {};

  for (const user of DEMO_USERS) {
    const result = await query(
      `INSERT INTO users (full_name, email, phone_number, password_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [user.fullName, user.email, user.phone, passwordHash]
    );
    userIds[user.key] = result.rows[0].id;
  }

  // The admin role is the only way to reach `verified`; granted here explicitly
  // and only to the demo admin account.
  await roleService.grantRole(userIds.admin, roleService.ROLE.ADMIN);

  return userIds;
};

/**
 * Creates the farmer's fields and the availability rows for the listed ones.
 * @param {number} farmerUserId
 * @returns {Promise<object>} { farmIds, availability }
 */
const seedFarmerSide = async (farmerUserId) => {
  const farmIds = {};
  const availability = {};

  for (const plot of FARMER_PLOTS) {
    const farm = await query(
      `INSERT INTO farms (user_id, name, location, latitude, longitude, area_hectares, crop_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        farmerUserId, plot.name, plot.place.label,
        plot.place.lat, plot.place.lon, plot.areaHectares, plot.cropType
      ]
    );
    farmIds[plot.key] = farm.rows[0].id;

    if (!plot.listed) continue;

    // Through the real service, so the four quantity buckets are initialised the
    // way the product initialises them: nothing reserved, nothing sold.
    availability[plot.key] = await availabilityService.create(farmerUserId, {
      farmId: farm.rows[0].id,
      ...plot.availability,
      harvestDate: daysFromNow(0),
      isDemoData: true
    });
  }

  return { farmIds, availability };
};

/**
 * Creates a buyer profile and, when asked, takes it through verification.
 *
 * Verification goes submit -> admin review, which is the product's only path to
 * `verified`. The seed does not write `verification_status` itself and could not
 * reach `verified` without the admin account.
 *
 * @param {object} input - { buyer, userId, adminUserId }
 * @returns {Promise<object>} owner projection of the profile
 */
const seedBuyerProfile = async ({ buyer, userId, adminUserId }) => {
  const profile = await buyerService.createProfile(userId, {
    businessName: buyer.businessName,
    buyerType: buyer.buyerType,
    contactPerson: `${DEMO_PREFIX} Purchase Manager`,
    businessPhone: DEMO_PHONE,
    businessEmail: DEMO_USERS.find((u) => u.key === buyer.key).email,
    address: `${buyer.place.label}, Maharashtra (demo address — not a real premises)`,
    villageCity: buyer.place.label.split(',')[0].trim(),
    district: buyer.place.district,
    state: 'Maharashtra',
    pinCode: buyer.place.pin,
    latitude: buyer.place.lat,
    longitude: buyer.place.lon,
    cropsPurchased: buyer.cropsPurchased,
    typicalPurchaseQuantityKg: buyer.typicalPurchaseQuantityKg,
    serviceAreaKm: buyer.serviceAreaKm,
    isDemoData: true
  });

  if (!buyer.verify) return profile;

  await buyerService.submitForVerification(userId, {
    documentPath: null
  });
  await buyerService.reviewVerification({
    buyerId: profile.id,
    decision: buyerService.VERIFICATION.VERIFIED,
    adminUserId,
    notes:
      'DEMO DATA — approved by the seed script through the normal admin review ' +
      'path. This is not a real business and not a real verification.'
  });

  // Re-read so the caller sees the reviewed status rather than the submitted one.
  return buyerService.toOwner(await buyerService.getRawById(profile.id));
};

/**
 * Creates one requirement through requirementService.
 * @param {object} input - { buyerProfileId, requirement }
 * @returns {Promise<object>} decorated requirement
 */
const seedRequirement = async ({ buyerProfileId, requirement }) => requirementService.create(
  buyerProfileId,
  {
    crop: requirement.crop,
    minimumQualityGrade: requirement.minimumQualityGrade || null,
    quantityRequiredKg: requirement.quantityRequiredKg,
    offeredPricePerKg: requirement.offeredPricePerKg,
    priceNegotiable: true,
    partialFulfillmentAllowed: true,
    // Exactly one of these is true, which is what tells the comparison engine
    // whether the farmer pays freight.
    pickupAvailable: Boolean(requirement.pickup),
    deliveryRequired: !requirement.pickup,
    deliveryLocation: requirement.deliveryLocation,
    deliveryDistrict: requirement.deliveryPlace.district,
    latitude: requirement.deliveryPlace.lat,
    longitude: requirement.deliveryPlace.lon,
    requiredBy: daysFromNow(requirement.requiredIn),
    expiresAt: daysFromNow(requirement.expiresIn),
    description: `DEMO requirement — not a real business and not a real purchase order. ${requirement.description}`,
    isDemoData: true
  },
  { publish: true }
);

/**
 * Seeds the two requirements that must stay invisible to farmers.
 * @param {object} profilesByKey
 * @returns {Promise<Array>}
 */
const seedNegativeControls = async (profilesByKey) => {
  const seeded = [];

  for (const control of NEGATIVE_CONTROLS) {
    const profile = profilesByKey[control.buyerKey];
    const requirement = await seedRequirement({
      buyerProfileId: profile.id,
      requirement: control
    });

    if (control.finalStatus === 'closed') {
      // Through the service, so the transition is the one a buyer would cause.
      await requirementService.close({
        requirementId: requirement.id,
        buyerId: profile.id,
        status: requirementService.STATUS.CLOSED
      });
    }
    // 'expired' needs no action: the dates are already in the past and
    // requirementService.expireStale() marks it on the next read.

    seeded.push({ ...control, id: requirement.id });
  }

  // Apply the lazy expiry now, so the seed's own verification sees the real state.
  await requirementService.expireStale();
  return seeded;
};

/**
 * Seeds one negotiation the demo can carry forward live.
 *
 * Farmer offers 1,000 kg at ₹50/kg on the Wardha farm-gate requirement; the buyer
 * counters at ₹49/kg. The counter is left PENDING and addressed to the FARMER, so
 * the demo can accept, counter again or reject it on screen.
 *
 * NOTHING IS ACCEPTED HERE. An accepted offer would create a deal and reserve the
 * whole soybean lot, which would empty the very listing the demo is about.
 * Every requirement stays open and all 1,000 kg stays available.
 *
 * @param {object} input - { farmerUserId, buyerUserId, requirementId, availabilityId }
 * @returns {Promise<object>} { conversationId, farmerOfferId, counterOfferId }
 */
const seedNegotiation = async ({ farmerUserId, buyerUserId, requirementId, availabilityId }) => {
  const conversation = await conversationService.findOrCreate({
    requirementId,
    userId: farmerUserId,
    availabilityId
  });

  await conversationService.sendMessage({
    conversationId: conversation.id,
    userId: farmerUserId,
    content: 'Namaste. I have 1000 kg soybean, JS-335, Grade A, in the godown at Hingna.'
  });
  await conversationService.sendMessage({
    conversationId: conversation.id,
    userId: buyerUserId,
    content: 'Good. We can send our vehicle to collect on Thursday. Our rate is ₹48.50/kg.'
  });

  // Farmer asks for more than the advertised rate — price_negotiable is TRUE.
  const farmerOffer = await offerService.create({
    requirementId,
    senderId: farmerUserId,
    availabilityId,
    quantityKg: 1000,
    pricePerKg: 50.00,
    deliveryTerms: 'buyer_pickup',
    proposedFulfillmentDate: daysFromNow(4),
    message: 'Grade A, dry and cleaned. ₹50/kg if you collect from the farm.'
  });

  // Buyer counters. offerService.counter supersedes the original and leaves this
  // one pending with the farmer.
  const counterOffer = await offerService.counter({
    offerId: farmerOffer.id,
    userId: buyerUserId,
    quantityKg: 1000,
    pricePerKg: 49.00,
    deliveryTerms: 'buyer_pickup',
    message: '₹49/kg is our best for this lot, collected from your farm. Payment in 2 days.'
  });

  return {
    conversationId: conversation.id,
    farmerOfferId: farmerOffer.id,
    counterOfferId: counterOffer.id
  };
};

/**
 * Seeds the original tomato conversation and pending buyer offer, unchanged.
 * @param {object} input - { farmerUserId, buyerUserId, requirementId, availabilityId }
 * @returns {Promise<object>}
 */
const seedTomatoThread = async ({ farmerUserId, buyerUserId, requirementId, availabilityId }) => {
  const conversation = await conversationService.findOrCreate({
    requirementId,
    userId: farmerUserId,
    availabilityId
  });

  await conversationService.sendMessage({
    conversationId: conversation.id,
    userId: farmerUserId,
    content: 'Namaste. I have 500 kg Grade A tomato, picked this morning.'
  });
  await conversationService.sendMessage({
    conversationId: conversation.id,
    userId: buyerUserId,
    content: 'Good. We can collect from your farm tomorrow. Is ₹28/kg acceptable?'
  });

  const offer = await offerService.create({
    requirementId,
    senderId: buyerUserId,
    availabilityId,
    quantityKg: 500,
    pricePerKg: 28.00,
    deliveryTerms: 'buyer_pickup',
    proposedFulfillmentDate: daysFromNow(2)
  });

  return { conversationId: conversation.id, offerId: offer.id };
};

// ===========================================================================
// Verification of what was seeded
// ===========================================================================

/**
 * Re-reads the seeded data through the real matching and comparison engines and
 * prints what a farmer would actually see.
 *
 * This is the part worth reading before a demo. It calls the same services the
 * API calls, so if the ordering printed here is wrong, the screen will be wrong
 * too — and it asserts the two negative controls are absent.
 *
 * Network-dependent (road routing, ambient weather), so a failure here is
 * reported and does not fail the seed; the data is already committed.
 *
 * @param {object} input - { farmerUserId, availability, negativeControls }
 * @returns {Promise<void>}
 */
const verifySeed = async ({ farmerUserId, availability, negativeControls }) => {
  const matchingService = require('../services/matchingService');
  const buyerComparisonService = require('../services/buyerComparisonService');

  const hiddenIds = new Set(negativeControls.map((c) => c.id));

  for (const key of ['soy', 'orange', 'cotton']) {
    const listing = availability[key];
    if (!listing) continue;

    console.log('');
    console.log(`  ${listing.cropLabel.toUpperCase()} — ${listing.availableKg} kg available, ${listing.farmName}`);
    console.log('  ' + '-'.repeat(86));

    // 1. matching: does crop filtering hold?
    const { matches } = await matchingService.findMatchesForFarmer({
      userId: farmerUserId,
      availabilityId: listing.id
    });

    const wrongCrop = matches.filter((m) => m.requirement.crop !== listing.crop);
    const leaked = matches.filter((m) => hiddenIds.has(m.requirement.id));

    // 2. comparison: the money-in-hand ranking the UI shows.
    const { buyers } = await buyerComparisonService.getTopBuyers({
      userId: farmerUserId,
      availabilityId: listing.id,
      limit: 10
    });

    console.log(
      '  ' + '#'.padEnd(3) + 'BUYER'.padEnd(38) + 'PRICE'.padStart(9) +
      'FREIGHT'.padStart(10) + 'MONEY YOU KEEP'.padStart(16) + '  FLAGS'
    );
    for (const option of buyers) {
      const flags = [];
      if (option.recommended) flags.push('BEST');
      if (option.isHighestPriceButNotBest) flags.push('higher price, less money');
      if (!option.isVerifiedBuyer) flags.push('unverified');
      if (option.whoPaysTransport === 'buyer') flags.push('buyer collects');
      if (!option.isComplete) flags.push('incomplete');

      console.log(
        '  ' + String(option.rank).padEnd(3) +
        String(option.buyerName).replace(DEMO_PREFIX, '').trim().slice(0, 37).padEnd(38) +
        `₹${option.offeredPricePerKg}/kg`.padStart(9) +
        (option.transportCost === null ? '—' : `₹${option.transportCost}`).padStart(10) +
        (option.expectedMoney === null ? '—' : `₹${option.expectedMoney.toLocaleString('en-IN')}`).padStart(16) +
        '  ' + flags.join(', ')
      );
    }

    console.log(
      `       crop filter: ${wrongCrop.length === 0 ? 'OK — only ' + listing.crop + ' buyers' : 'FAILED — ' + wrongCrop.length + ' wrong-crop match(es)'}` +
      ` · closed/expired hidden: ${leaked.length === 0 ? 'OK' : 'FAILED (' + leaked.length + ' leaked)'}`
    );
  }
};

// ===========================================================================
// Entry point
// ===========================================================================

const run = async () => {
  console.log('='.repeat(90));
  console.log('MARKETPLACE DEMO SEED — fictional businesses, NOT real companies');
  console.log('='.repeat(90));

  await clearDemoData();

  const userIds = await seedAccounts();
  console.log(`[Demo Seed] ✅ ${DEMO_USERS.length} demo accounts (password: "${DEMO_PASSWORD}")`);

  const { availability } = await seedFarmerSide(userIds.farmer);
  const listed = Object.values(availability);
  console.log(
    `[Demo Seed] ✅ farmer: ${FARMER_PLOTS.length} fields, ${listed.length} listed ` +
    `(${listed.map((a) => `${a.availableKg} kg ${a.cropLabel}`).join(', ')}), ` +
    `${FARMER_PLOTS.filter((p) => !p.listed).length} spare fields left unlisted for a live "Add crop"`
  );

  // --- buyers, profiles, verification, requirements ---
  const profilesByKey = {};
  const requirementsByCode = {};
  let verifiedCount = 0;

  for (const buyer of BUYERS) {
    const profile = await seedBuyerProfile({
      buyer,
      userId: userIds[buyer.key],
      adminUserId: userIds.admin
    });
    profilesByKey[buyer.key] = profile;
    if (profile.isVerified) verifiedCount += 1;

    for (const requirement of buyer.requirements) {
      requirementsByCode[requirement.code] = await seedRequirement({
        buyerProfileId: profile.id,
        requirement
      });
    }

    console.log(
      `[Demo Seed] ✅ ${buyer.businessName.replace(DEMO_PREFIX, '').trim()} ` +
      `(${buyer.buyerType}, ${buyer.place.district}, ${profile.verificationStatus}) — ` +
      buyer.requirements
        .map((r) => `${r.quantityRequiredKg} kg ${r.crop} @ ₹${r.offeredPricePerKg}/kg ${r.pickup ? '[collects]' : '[farmer delivers]'}`)
        .join('; ')
    );
  }

  const negativeControls = await seedNegativeControls(profilesByKey);
  console.log(
    `[Demo Seed] ✅ ${negativeControls.length} negative-control requirements ` +
    `(${negativeControls.map((c) => `${c.code}=${c.finalStatus}`).join(', ')}) — these must NOT appear in matches`
  );

  // --- one negotiation to carry into the demo, nothing accepted ---
  const negotiation = await seedNegotiation({
    farmerUserId: userIds.farmer,
    buyerUserId: userIds.wardhaProcessor,
    requirementId: requirementsByCode['SOY-3'].id,
    availabilityId: availability.soy.id
  });
  console.log(
    '[Demo Seed] ✅ soybean negotiation: farmer offered 1000 kg @ ₹50/kg, buyer countered @ ₹49/kg ' +
    `(counter #${negotiation.counterOfferId} is PENDING with the farmer — nothing accepted, no crop reserved)`
  );

  const tomato = await seedTomatoThread({
    farmerUserId: userIds.farmer,
    buyerUserId: userIds.buyerB,
    requirementId: requirementsByCode['TOM-2'].id,
    availabilityId: availability.tomato.id
  });
  console.log(`[Demo Seed] ✅ original tomato thread preserved: pending buyer offer #${tomato.offerId}`);

  // --- flag the rows the older services do not flag ---
  const flagged = await markDemoRows(Object.values(userIds));
  console.log(
    '[Demo Seed] ✅ is_demo_data set on ' +
    Object.entries(flagged).map(([t, n]) => `${n} ${t.replace('marketplace_', '')}`).join(', ')
  );

  // --- what the farmer will actually see ---
  const totalRequirements = Object.keys(requirementsByCode).length;
  console.log('');
  console.log('='.repeat(90));
  console.log(`WHAT THE FARMER SEES — ${BUYERS.length} buyers (${verifiedCount} verified), ${totalRequirements} open requirements`);
  console.log('Ranked by the existing engine (road distance -> freight -> expected spoilage -> net return).');
  console.log('='.repeat(90));

  try {
    await verifySeed({
      farmerUserId: userIds.farmer,
      availability,
      negativeControls
    });
  } catch (error) {
    console.warn('');
    console.warn(`  ⚠️  Could not print the live ranking (${error.code || error.message}).`);
    console.warn('     The data IS seeded. This step needs road routing and weather, so it');
    console.warn('     fails offline. Check the Buyer Marketplace page in the app instead.');
  }

  // --- credentials ---
  console.log('');
  console.log('='.repeat(90));
  console.log(`SIGN IN — password for every account below: ${DEMO_PASSWORD}`);
  console.log('='.repeat(90));
  for (const user of DEMO_USERS) {
    const buyer = BUYERS.find((b) => b.key === user.key);
    const role = user.key === 'farmer' ? 'farmer — soybean, orange, cotton, tomato'
      : user.key === 'admin' ? 'admin — grants buyer verification'
        : buyer ? `${buyer.buyerType}, ${buyer.place.district} — ${profilesByKey[user.key].verificationStatus}`
          : 'buyer';
    console.log(`  ${user.email.padEnd(38)} ${role}`);
  }
  console.log('');
  console.log('  Re-run any time:  npm run seed:marketplace        (idempotent — clears, then recreates)');
  console.log('  Remove entirely:  npm run seed:marketplace -- --clear');
  console.log('');
  console.log('  NOTE: re-running DELETES the demo conversations, offers and deals, including any');
  console.log('        made live during a demo. Do not re-run mid-demonstration.');
  console.log('');
};

if (require.main === module) {
  const clearOnly = process.argv.includes('--clear');
  (clearOnly ? clearDemoData() : run())
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Demo Seed] ❌ Failed:', error.message);
      if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = {
  run,
  clearDemoData,
  markDemoRows,
  DEMO_PREFIX,
  DEMO_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  DEMO_USERS,
  BUYERS,
  FARMER_PLOTS,
  NEGATIVE_CONTROLS,
  PLACES
};
