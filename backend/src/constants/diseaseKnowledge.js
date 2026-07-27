/**
 * AgriChain Disease Knowledge Base & Agricultural Extension Metadata
 * 
 * Provides evidence-based, conservative agricultural advice for the 12 supported crop classes.
 * Strictly adheres to safe cultural management practices and official agricultural extension guidance.
 * References ICAR (Indian Council of Agricultural Research) and agricultural extension literature.
 */

const DISEASE_KNOWLEDGE_BASE = {
  // --- COTTON (0..3) ---
  0: {
    class_index: 0,
    crop: "Cotton",
    disease: "Healthy",
    is_healthy: true,
    description: "The cotton leaf image displays normal, healthy foliage without visible signs of the supported disease classes.",
    symptoms: [
      "Foliage displays consistent green coloration",
      "No visible spots, water-soaked lesions, or leaf curling"
    ],
    causes: [
      "Favorable growing conditions and effective crop maintenance"
    ],
    recommendations: [
      "Maintain regular field monitoring and scouting schedules",
      "Ensure balanced N-P-K fertilizer application as per soil test recommendations",
      "Maintain proper field irrigation management to prevent water stress or waterlogging"
    ],
    prevention: [
      "Continue routine crop monitoring every 7 to 10 days",
      "Keep field borders clear of weed hosts",
      "Maintain proper crop spacing for air circulation"
    ],
    severity_level: "Healthy",
    advisory: "No visible signs of the supported disease classes were detected in the submitted image. Continue standard crop care and routine field scouting.",
    sources: [
      {
        name: "ICAR - Central Institute for Cotton Research (CICR)",
        reference: "Cotton Crop Health Management & Integrated Pest Protocols"
      },
      {
        name: "TNAU Agritech Portal",
        reference: "Cotton Crop Protection Guidelines"
      }
    ]
  },

  1: {
    class_index: 1,
    crop: "Cotton",
    disease: "Bacterial Blight",
    is_healthy: false,
    description: "Bacterial Blight (caused by Xanthomonas citri pv. malvacearum) affects cotton leaves, stems, and bolls, forming angular water-soaked lesions.",
    symptoms: [
      "Small, angular, water-soaked lesions on the underside of leaves",
      "Lesions turn dark brown to black over time",
      "Vein browning ('blackarm') on leaf veins and petioles",
      "Premature defoliation in severe infections"
    ],
    causes: [
      "Bacterial pathogen spread by wind-driven rain, splashing water, and contaminated seeds",
      "Warm temperatures (28°C–36°C) combined with high relative humidity (>85%)"
    ],
    recommendations: [
      "Prune and destroy severely infected plant residue post-harvest",
      "Avoid overhead sprinkler irrigation to minimize bacterial splashing across plants",
      "Consult local agricultural extension officers for recommended seed treatments and approved bactericides"
    ],
    prevention: [
      "Use certified disease-free, acid-delinted seeds for planting",
      "Practice crop rotation with non-host crops such as maize or sorghum for at least 2 seasons",
      "Select bacterial blight-resistant or tolerant cotton cultivars"
    ],
    severity_level: "High Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - Central Institute for Cotton Research (CICR)",
        reference: "Bacterial Blight Management in Cotton (Extension Bulletin)"
      },
      {
        name: "Directorate of Cotton Development, Govt. of India",
        reference: "Integrated Disease Management Guidelines for Cotton"
      }
    ]
  },

  2: {
    class_index: 2,
    crop: "Cotton",
    disease: "Alternaria Leaf Spot",
    is_healthy: false,
    description: "Alternaria Leaf Spot (caused by Alternaria macrospora / A. alternata) causes circular brown spots on leaves, leading to leaf drop under nutrient or moisture stress.",
    symptoms: [
      "Circular brown spots with concentric rings on leaves",
      "Purple or dark reddish margins around leaf spots",
      "Crater-like shot-holes as diseased leaf center tissue dies and falls out",
      "Premature leaf senescence and leaf drop"
    ],
    causes: [
      "Fungal spores airborne or soil-borne, spreading rapidly during humid weather",
      "Potassium deficiency or plant stress increases crop susceptibility"
    ],
    recommendations: [
      "Ensure balanced soil potassium and nitrogen nutrition to strengthen foliage",
      "Remove and safely dispose of infected crop debris after harvest",
      "Consult local agricultural extension officers for approved protective fungicide sprays"
    ],
    prevention: [
      "Maintain adequate plant spacing to facilitate sunlight penetration and canopy drying",
      "Avoid waterlogging and maintain optimal field drainage",
      "Adopt crop rotation with non-host crops"
    ],
    severity_level: "Moderate Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - CICR Nagpur",
        reference: "Fungal Diseases of Cotton & Management Strategies"
      },
      {
        name: "PAU Ludhiana Extension Services",
        reference: "Cotton Pathology Advisory"
      }
    ]
  },

  3: {
    class_index: 3,
    crop: "Cotton",
    disease: "Leaf Curl Virus",
    is_healthy: false,
    description: "Cotton Leaf Curl Virus (CLCuV) is a whitefly-transmitted viral disease causing upward/downward leaf curling, vein thickening, and stunted growth.",
    symptoms: [
      "Upward or downward curling of leaf margins",
      "Thickening of leaf veins on the lower leaf surface",
      "Cup-shaped leaf-like enations (outgrowths) on leaf undersides",
      "Stunted plant growth and reduced boll formation"
    ],
    causes: [
      "Begomovirus transmitted exclusively by the insect vector Whitefly (Bemisia tabaci)",
      "Presence of alternate weed hosts around cotton fields"
    ],
    recommendations: [
      "Rogue out and destroy viral-infected young plants early in the season",
      "Control weed hosts (e.g., Abutilon spp.) around field perimeters",
      "Consult local extension officers for integrated vector management practices"
    ],
    prevention: [
      "Plant CLCuV-resistant or tolerant cotton hybrids recommended for your zone",
      "Install yellow sticky traps (15–20 per acre) for whitefly vector monitoring",
      "Avoid sequential planting of susceptible crops in adjacent fields"
    ],
    severity_level: "High Advisory",
    advisory: "Viral diseases cannot be cured once plants are infected. Focus on early vector control and rogueing as advised by local extension experts.",
    sources: [
      {
        name: "ICAR - Central Institute for Cotton Research (CICR)",
        reference: "Cotton Leaf Curl Virus (CLCuD) Management Protocol"
      },
      {
        name: "HAU Hisar Extension Advisory",
        reference: "Whitefly and Leaf Curl Control Guidelines"
      }
    ]
  },

  // --- SOYBEAN (4..7) ---
  4: {
    class_index: 4,
    crop: "Soybean",
    disease: "Healthy",
    is_healthy: true,
    description: "The soybean leaf image displays healthy green foliage without visible symptoms of the supported disease classes.",
    symptoms: [
      "Uniform green leaf blade coloration",
      "Absence of pustules, rust spots, or leaf scorch"
    ],
    causes: [
      "Optimal crop management and nutrient status"
    ],
    recommendations: [
      "Continue regular crop scouting every 7 days",
      "Maintain adequate soil moisture during flowering and pod development stages",
      "Ensure recommended dosage of Rhizobium seed inoculation for nitrogen fixation"
    ],
    prevention: [
      "Maintain field weed control to prevent microclimate humidity buildup",
      "Rotate crops annually with cereals such as wheat, maize, or mustard"
    ],
    severity_level: "Healthy",
    advisory: "No visible signs of the supported disease classes were detected in the submitted image. Continue standard crop care and routine field scouting.",
    sources: [
      {
        name: "ICAR - Indian Institute of Soybean Research (IISR), Indore",
        reference: "Soybean Crop Production and Health Guidelines"
      }
    ]
  },

  5: {
    class_index: 5,
    crop: "Soybean",
    disease: "Rust",
    is_healthy: false,
    description: "Asian Soybean Rust (caused by Phakopsora pachyrhizi) is a aggressive foliar fungal disease causing reddish-brown pustules on leaves.",
    symptoms: [
      "Tiny, raised tan to reddish-brown pustules on the underside of leaves",
      "Yellowing (chlorosis) of leaf tissue surrounding pustule clusters",
      "Rapid premature defoliation starting from the lower canopy upwards"
    ],
    causes: [
      "Airborne fungal urediniospores spread over long distances by wind",
      "Extended leaf wetness (6–12 hours) and temperatures between 15°C–28°C"
    ],
    recommendations: [
      "Monitor lower crop canopy closely during early reproductive stages (R1–R3)",
      "Consult local extension officers immediately for recommended protective or curative fungicides if rust is detected locally",
      "Ensure thorough spray coverage of the lower and middle canopy"
    ],
    prevention: [
      "Plant rust-tolerant or early-maturing soybean varieties",
      "Avoid high sowing densities to ensure adequate canopy air circulation",
      "Follow regional soybean rust advisory forecasts"
    ],
    severity_level: "High Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - IISR Indore",
        reference: "Soybean Rust Identification & Management Protocol"
      },
      {
        name: "JNKVV Jabalpur Pathology Extension",
        reference: "Soybean Disease Advisory Bulletin"
      }
    ]
  },

  6: {
    class_index: 6,
    crop: "Soybean",
    disease: "Bacterial Pustule",
    is_healthy: false,
    description: "Bacterial Pustule (caused by Xanthomonas axonopodis pv. glycines) forms small yellowish spots with raised central pustules on leaves.",
    symptoms: [
      "Small pale green to yellow spots with raised light brown pustules in the center",
      "Pustules predominantly located on the lower leaf surface",
      "Lesions merge into large brown ragged patches that tear under wind",
      "Premature leaf drop in severe cases"
    ],
    causes: [
      "Bacterial pathogen surviving in crop residue and seed coats",
      "Pathogen spread by wind-blown rain, splashing water, and machinery movement through wet fields"
    ],
    recommendations: [
      "Avoid field operations or cultivation when foliage is wet",
      "Deep plow crop residue after harvest to accelerate bacterial breakdown",
      "Consult local agricultural extension officers for seed treatment recommendations"
    ],
    prevention: [
      "Use certified disease-free seeds of resistant soybean cultivars",
      "Practice crop rotation with non-leguminous crops (e.g., maize, sorghum, wheat)",
      "Maintain clean cultivation practices"
    ],
    severity_level: "Moderate Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - IISR Indore",
        reference: "Bacterial Pustule Disease Management in Soybean"
      }
    ]
  },

  7: {
    class_index: 7,
    crop: "Soybean",
    disease: "Brown Spot",
    is_healthy: false,
    description: "Septoria Brown Spot (caused by Septoria glycines) is a common foliar fungal disease causing small dark brown spots on lower leaves early in the season.",
    symptoms: [
      "Irregular, small dark brown spots on both upper and lower leaf surfaces",
      "Affected leaves turn yellow and drop prematurely",
      "Disease progresses from lower canopy leaves to upper foliage"
    ],
    causes: [
      "Fungal pathogen surviving in infected soybean crop residue",
      "Warm, wet weather during early crop development stages"
    ],
    recommendations: [
      "Incorporate crop residue into the soil promptly after harvest",
      "Avoid short rotation intervals between soybean crops",
      "Consult local extension services for economic threshold spray advisories"
    ],
    prevention: [
      "Rotate fields with corn, wheat, or grain sorghum for 1 to 2 years",
      "Select high-quality certified seed",
      "Ensure adequate balanced phosphorus and potassium soil fertility"
    ],
    severity_level: "Moderate Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - Indian Institute of Soybean Research",
        reference: "Septoria Leaf Spot Management in Soybean"
      }
    ]
  },

  // --- ORANGE / CITRUS (8..11) ---
  8: {
    class_index: 8,
    crop: "Orange",
    disease: "Healthy",
    is_healthy: true,
    description: "The citrus leaf image exhibits healthy green foliage without symptoms of citrus canker, black spot, or greening.",
    symptoms: [
      "Deep green, glossy foliage",
      "Absence of corky lesions, chlorotic mottle, or black spots"
    ],
    causes: [
      "Good orchard management and balanced tree nutrition"
    ],
    recommendations: [
      "Maintain micro-irrigation scheduling to avoid canopy water stress",
      "Apply balanced macronutrients (N-P-K) and micronutrients (Zinc, Iron, Manganese) as foliar sprays",
      "Perform periodic orchard sanitation and deadwood pruning"
    ],
    prevention: [
      "Inspect new flush growth regularly for citrus psyllid or leafminer activity",
      "Maintain orchard weed control"
    ],
    severity_level: "Healthy",
    advisory: "No visible signs of the supported disease classes were detected in the submitted image. Continue standard crop care and routine field scouting.",
    sources: [
      {
        name: "ICAR - Central Citrus Research Institute (CCRI), Nagpur",
        reference: "Citrus Health & Orchard Management Protocols"
      }
    ]
  },

  9: {
    class_index: 9,
    crop: "Orange",
    disease: "Citrus Canker",
    is_healthy: false,
    description: "Citrus Canker (caused by Xanthomonas citri subsp. citri) is a severe bacterial disease causing raised, corky lesions surrounded by yellow halos on leaves, fruit, and twigs.",
    symptoms: [
      "Raised, rough, corky, brownish lesions on leaves, twigs, and fruit",
      "Distinct oily or watery margin surrounded by a characteristic yellow halo",
      "Premature leaf drop and fruit drop in heavy infections",
      "Twig dieback"
    ],
    causes: [
      "Bacterial pathogen entering through stomata or mechanical wounds (e.g., leafminer feeding injuries)",
      "Dispersed by wind-driven rain, irrigation spray, and contaminated pruning tools"
    ],
    recommendations: [
      "Prune and burn affected twigs during the dry dormant season",
      "Sterilize pruning equipment with 70% ethanol or 1% sodium hypochlorite solution between trees",
      "Consult local extension officers for approved copper-based bactericidal spray schedules during new flush emergence"
    ],
    prevention: [
      "Control citrus leafminer (Phyllocnistis citrella) larvae to minimize leaf entry wounds",
      "Establish windbreaks around citrus orchards to reduce wind-driven rain spread",
      "Use disease-free nursery rootstocks"
    ],
    severity_level: "High Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - Central Citrus Research Institute (CCRI)",
        reference: "Citrus Canker Identification and Integrated Management"
      },
      {
        name: "Dr. YSR Horticultural University Extension Services",
        reference: "Citrus Crop Protection Manual"
      }
    ]
  },

  10: {
    class_index: 10,
    crop: "Orange",
    disease: "Black Spot",
    is_healthy: false,
    description: "Citrus Black Spot (caused by Phyllosticta citricarpa) causes dark, crater-like spot lesions on citrus foliage and fruit peel.",
    symptoms: [
      "Small, round, sunken black spots with gray centers on fruit and leaves",
      "Reddish-brown margins surrounding leaf lesions",
      "Premature fruit drop under heavy infection loads"
    ],
    causes: [
      "Fungal ascopores airborne from fallen decaying leaf litter on the orchard floor",
      "Frequent rain events during fruit-set and fruit development stages"
    ],
    recommendations: [
      "Rake, compost, or clear fallen leaf litter from orchard floor to remove inoculum",
      "Prune low-hanging branches to improve canopy clearance and ventilation",
      "Consult local extension officers for approved protective fungicide spray timing"
    ],
    prevention: [
      "Apply mulch to fallen leaves to accelerate decomposition",
      "Maintain open canopy pruning to promote rapid leaf drying",
      "Use overhead sprinkler alternatives like drip irrigation"
    ],
    severity_level: "Moderate Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts and official product labels for chemical treatment approval.",
    sources: [
      {
        name: "ICAR - CCRI Nagpur",
        reference: "Fungal Diseases of Citrus & Control Advisories"
      }
    ]
  },

  11: {
    class_index: 11,
    crop: "Orange",
    disease: "Greening",
    is_healthy: false,
    description: "Citrus Greening / Huanglongbing (HLB, caused by Candidatus Liberibacter asiaticus) is a catastrophic systemic bacterial disease causing blotchy mottle on leaves and small bitter fruit.",
    symptoms: [
      "Asymmetrical blotchy mottle chlorosis on leaves (yellowing crosses leaf midrib)",
      "Yellowing of shoots ('yellow dragon')",
      "Small, lopsided, poorly colored fruit with bitter taste and dark aborted seeds",
      "Severe dieback and eventual tree decline"
    ],
    causes: [
      "Systemic vascular bacteria transmitted by the Asian Citrus Psyllid (Diaphorina citri)",
      "Spread through infected budwood or nursery stock"
    ],
    recommendations: [
      "Rogue out and destroy infected trees to eliminate reservoir inoculum in young orchards",
      "Consult local extension services for recommendations on controlling psyllid vector populations",
      "Apply nutrient sprays (Zinc, Iron, Manganese) to support tree vigor as advised by extension"
    ],
    prevention: [
      "Plant certified disease-free, tissue-cultured citrus saplings from accredited nurseries",
      "Monitor Asian citrus psyllids using yellow sticky traps",
      "Coordinate vector management regionally across neighboring orchards"
    ],
    severity_level: "High Advisory",
    advisory: "Citrus Greening is a systemic incurable infection. Focus on aggressive psyllid vector control and removing severely infected trees under expert extension guidance.",
    sources: [
      {
        name: "ICAR - Central Citrus Research Institute (CCRI)",
        reference: "Citrus Greening (HLB) Diagnostic & Containment Strategy"
      },
      {
        name: "National Horticultural Board (NHB), India",
        reference: "Citrus Nursery Certification Guidelines"
      }
    ]
  }
};

/**
 * Retrieves disease knowledge metadata for a given class index (0..11).
 * Returns a safe fallback object if classIndex is unmapped.
 * 
 * @param {number} classIndex 
 * @returns {Object}
 */
const getDiseaseKnowledge = (classIndex) => {
  const idx = parseInt(classIndex, 10);
  if (DISEASE_KNOWLEDGE_BASE[idx]) {
    return DISEASE_KNOWLEDGE_BASE[idx];
  }

  // Safe fallback if class_index is unmapped or unknown
  return {
    class_index: idx,
    crop: "Crop Leaf",
    disease: "Condition Unmapped",
    is_healthy: false,
    description: "Detailed agricultural extension knowledge for this classification is currently unavailable.",
    symptoms: ["Visual symptoms unavailable for unmapped class"],
    causes: ["Environmental or biological cause unmapped"],
    recommendations: [
      "Consult a local agricultural extension officer for expert visual diagnosis",
      "Maintain general field sanitation and clean cultivation practices"
    ],
    prevention: [
      "Follow standard regional crop protection guidelines"
    ],
    severity_level: "Moderate Advisory",
    advisory: "Information provided is for decision support only. Consult local extension experts for chemical treatment approval.",
    sources: [
      {
        name: "AgriChain Extension Advisory",
        reference: "General Agricultural Decision Support Protocol"
      }
    ]
  };
};

/**
 * Derives confidence assessment level and user-facing message based on prediction confidence score.
 * 
 * Confidence thresholds:
 * - >= 0.80 (80%): high
 * - >= 0.50 and < 0.80 (50%-79%): moderate
 * - < 0.50 (< 50%): low
 * 
 * @param {number} confidence - Float score (0.0 .. 1.0)
 * @returns {Object} { level: "high"|"moderate"|"low", message: string }
 */
const getConfidenceAssessment = (confidence) => {
  const score = parseFloat(confidence) || 0.0;
  // Normalize if confidence is passed as 0..100 percentage
  const normScore = score > 1.0 ? score / 100.0 : score;

  if (normScore >= 0.80) {
    return {
      level: "high",
      message: "Prediction confidence is high (>= 80%). Management guidance aligns strongly with identified visual symptoms."
    };
  }

  if (normScore >= 0.50) {
    return {
      level: "moderate",
      message: "Prediction confidence is moderate (50%-79%). Verify visual symptoms against the description before applying management practices."
    };
  }

  return {
    level: "low",
    message: "Prediction confidence is limited (< 50%). Capture another well-lit, focused leaf image or consult a local agricultural extension specialist before acting."
  };
};

module.exports = {
  DISEASE_KNOWLEDGE_BASE,
  getDiseaseKnowledge,
  getConfidenceAssessment
};
