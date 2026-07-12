# Recommendations lookup mapping scaffolding
# Purpose: Maps predicted disease to treatments, medicines, prevention, and notes

DISEASE_RECOMMENDATIONS = {
    # Example:
    # "Tomato Early Blight": {
    #     "treatment": "Remove infected leaves.",
    #     "medicine": "Fungicide",
    #     "prevention": "Crop rotation",
    #     "notes": "Ensure proper spacing."
    # }
}

def get_recommendations(disease_name: str) -> dict:
    # TODO: Return recommendations dict for given disease
    return DISEASE_RECOMMENDATIONS.get(disease_name, {})
