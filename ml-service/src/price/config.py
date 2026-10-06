"""
Configuration for the market price prediction model.

Feature definitions live here rather than in the training script so that
training and inference provably build the same columns in the same order.
"""

from pathlib import Path

# --- Paths -------------------------------------------------------------------

PRICE_DIR = Path(__file__).resolve().parent
ML_SERVICE_ROOT = PRICE_DIR.parent.parent
MODEL_DIR = ML_SERVICE_ROOT / "models" / "price"

MODEL_FILE = MODEL_DIR / "price_model.joblib"
METADATA_FILE = MODEL_DIR / "price_model_metadata.json"

# --- Model identity ----------------------------------------------------------

MODEL_FAMILY = "price_xgb"
MODEL_MAJOR_VERSION = "v1"

# --- Horizon -----------------------------------------------------------------

# Days ahead the model predicts. The project brief prefers next-day to start.
DEFAULT_HORIZON_DAYS = 1
SUPPORTED_HORIZONS = (1, 3)

# --- Features ----------------------------------------------------------------

# Lags are expressed in TRADING DAYS (observations), not calendar days. Mandis
# are shut on Sundays and holidays, so consecutive observations are not always
# consecutive dates. Positional lags are the standard treatment for commodity
# series and avoid inventing prices for days with no auction.
LAG_DAYS = (1, 3, 7, 14, 30)
ROLLING_WINDOWS = (3, 7, 14, 30)

# Minimum observations a (market, crop) series needs before it can contribute
# training rows: the longest lag plus a margin for the target.
MIN_SERIES_LENGTH = max(LAG_DAYS) + max(ROLLING_WINDOWS) + 5

# Refuse to train on less than this many usable rows. Fitting a 30-lag
# gradient-boosted model to a handful of rows produces a confident-looking
# model with no predictive value, which is worse than having no model.
MIN_TRAINING_ROWS = 500

NUMERIC_FEATURES = (
    [f"lag_{d}" for d in LAG_DAYS]
    + [f"rolling_mean_{w}" for w in ROLLING_WINDOWS]
    + [
        "rolling_std_7",
        "price_change_1",
        "price_change_7",
        "price_volatility_14",
        "arrival_quantity",
        "arrival_rolling_mean_7",
        "month",
        "day_of_week",
        "day_of_year",
        "season",
    ]
)

CATEGORICAL_FEATURES = ["crop_code", "market_code_id"]

FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES

TARGET_COLUMN = "target_modal_price"

# What the regressor is actually fitted on. See features.py for why this is the
# change rather than the level.
TARGET_DELTA_COLUMN = "target_price_delta"

# --- Splits ------------------------------------------------------------------

# Chronological, never random: a random split would let the model learn from
# future prices to predict the past.
TEST_FRACTION = 0.15
VALIDATION_FRACTION = 0.15

# --- Seasons (Indian agricultural calendar) ----------------------------------
# 0 = Rabi/winter, 1 = summer, 2 = Kharif/monsoon, 3 = post-monsoon
SEASON_BY_MONTH = {
    1: 0, 2: 0, 3: 1, 4: 1, 5: 1,
    6: 2, 7: 2, 8: 2, 9: 2,
    10: 3, 11: 3, 12: 0,
}

XGB_PARAMS = {
    "n_estimators": 600,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.85,
    "colsample_bytree": 0.85,
    "min_child_weight": 3,
    "reg_lambda": 1.5,
    "objective": "reg:squarederror",
    "random_state": 42,
    "n_jobs": 4,
}
