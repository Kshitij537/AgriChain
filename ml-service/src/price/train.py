"""
Trains the market price prediction model.

Run:
    python -m price.train                 # all crops, next-day horizon
    python -m price.train --horizon 3
    python -m price.train --sources MANDI_API

HONESTY GUARANTEES
------------------
1. The model refuses to train on too little data rather than producing a
   confident-looking model with no predictive value.
2. Evaluation is chronological, never random.
3. Every run is compared against a naive persistence baseline ("tomorrow's
   price equals today's"). A model that cannot beat persistence is reported as
   not beating it - it is not presented as a success.
4. If the training data contains no real provider observations, the saved
   model version is suffixed '-demo' and metadata records it, so no demo-trained
   model can be mistaken for one trained on government data.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import joblib
from xgboost import XGBRegressor

from price.config import (
    DEFAULT_HORIZON_DAYS,
    FEATURE_COLUMNS,
    METADATA_FILE,
    MIN_TRAINING_ROWS,
    MODEL_DIR,
    MODEL_FAMILY,
    MODEL_FILE,
    MODEL_MAJOR_VERSION,
    TARGET_COLUMN,
    TARGET_DELTA_COLUMN,
    TEST_FRACTION,
    VALIDATION_FRACTION,
    XGB_PARAMS,
)
from price.dataset import describe_sources, load_price_observations
from price.features import assert_no_leakage, build_features, chronological_split


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """
    Computes the regression metrics required by the project brief.

    Args:
        y_true: observed prices.
        y_pred: predicted prices.

    Returns:
        dict with mae, rmse, mape.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    errors = y_pred - y_true
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))

    # MAPE is undefined at zero; mandi prices are strictly positive, but guard.
    nonzero = y_true != 0
    mape = float(np.mean(np.abs(errors[nonzero] / y_true[nonzero])) * 100)

    return {"mae": round(mae, 2), "rmse": round(rmse, 2), "mape": round(mape, 3)}


def persistence_baseline(frame: pd.DataFrame) -> np.ndarray:
    """
    Naive forecast: the next price equals the last known price.

    This is the bar any price model must clear to be worth deploying.

    Args:
        frame: evaluation frame containing lag_1.

    Returns:
        Baseline predictions.
    """
    return frame["lag_1"].to_numpy(dtype=float)


def train(horizon_days: int = DEFAULT_HORIZON_DAYS, sources=None, crops=None) -> dict:
    """
    Loads data, builds features, trains, evaluates and saves artifacts.

    Args:
        horizon_days: prediction horizon.
        sources: restrict training data provenance.
        crops: restrict crops.

    Returns:
        Training report dict.

    Raises:
        SystemExit: when there is not enough data to train honestly.
    """
    print("=" * 72)
    print(f"AgriChain price model training - horizon {horizon_days} day(s)")
    print("=" * 72)

    raw = load_price_observations(crops=crops, sources=sources)
    provenance = describe_sources(raw)
    print(f"Loaded {len(raw):,} observations. Sources: {provenance['counts']}")

    if raw.empty:
        raise SystemExit(
            "No price observations found. Run the price ingestion job (npm run ingest:prices) or "
            "`npm run seed:demo-prices` first."
        )

    built = build_features(raw, horizon_days=horizon_days, for_training=True)
    print(f"Built {len(built):,} training rows with {len(FEATURE_COLUMNS)} features.")

    assert_no_leakage(built, horizon_days)
    print("Leakage checks: PASSED")

    if len(built) < MIN_TRAINING_ROWS:
        raise SystemExit(
            f"\nREFUSING TO TRAIN: only {len(built)} usable rows, minimum is "
            f"{MIN_TRAINING_ROWS}.\n"
            "A gradient-boosted model fitted to this little history would look "
            "confident and predict nothing. Accumulate more daily observations "
            "first - the recommendation engine runs correctly without a price "
            "model and reports pricePredictionAvailable: false."
        )

    train_df, val_df, test_df = chronological_split(
        built, TEST_FRACTION, VALIDATION_FRACTION
    )
    print(
        f"Chronological split - train {len(train_df):,} "
        f"({train_df.observation_date.min().date()} to {train_df.observation_date.max().date()}), "
        f"val {len(val_df):,}, test {len(test_df):,} "
        f"({test_df.observation_date.min().date()} to {test_df.observation_date.max().date()})"
    )

    x_train = train_df[FEATURE_COLUMNS]
    x_val = val_df[FEATURE_COLUMNS]
    x_test = test_df[FEATURE_COLUMNS]

    # Fitted on the delta; see features.py. Metrics below are always reported
    # on reconstructed PRICE LEVELS so they stay comparable with the baseline
    # and are meaningful in rupees to a farmer.
    y_train = train_df[TARGET_DELTA_COLUMN]
    y_val = val_df[TARGET_DELTA_COLUMN]

    model = XGBRegressor(**XGB_PARAMS, early_stopping_rounds=40)
    model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)

    def to_price(frame, predicted_delta):
        """Reconstructs a price level from the last known price plus the delta."""
        return frame["lag_1"].to_numpy(dtype=float) + np.asarray(predicted_delta, dtype=float)

    y_val_price = val_df[TARGET_COLUMN]
    y_test = test_df[TARGET_COLUMN]

    val_metrics = evaluate(y_val_price, to_price(val_df, model.predict(x_val)))
    test_metrics = evaluate(y_test, to_price(test_df, model.predict(x_test)))
    baseline_metrics = evaluate(y_test, persistence_baseline(test_df))

    beats_baseline = test_metrics["mae"] < baseline_metrics["mae"]
    improvement = (
        (baseline_metrics["mae"] - test_metrics["mae"]) / baseline_metrics["mae"] * 100
        if baseline_metrics["mae"]
        else 0.0
    )

    print("\nValidation :", val_metrics)
    print("Test       :", test_metrics)
    print("Persistence:", baseline_metrics, "(naive baseline)")
    if beats_baseline:
        print(f"VERDICT    : model beats persistence by {improvement:.1f}% MAE")
    else:
        print(
            f"VERDICT    : model DOES NOT beat persistence "
            f"({improvement:.1f}% MAE). Treat its output as no better than "
            "using today's price."
        )

    # Demo-trained models are versioned so they can never be mistaken for
    # models fitted to real government observations.
    suffix = "-demo" if provenance["is_demo_only"] else ""
    model_version = f"{MODEL_FAMILY}_{MODEL_MAJOR_VERSION}_h{horizon_days}{suffix}"

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / f"price_model_h{horizon_days}.joblib"
    joblib.dump(
        {
            "model": model,
            "feature_columns": FEATURE_COLUMNS,
            "horizon_days": horizon_days,
            "model_version": model_version,
        },
        model_path,
    )

    importances = sorted(
        zip(FEATURE_COLUMNS, model.feature_importances_.tolist()),
        key=lambda pair: pair[1],
        reverse=True,
    )[:10]

    metadata = {
        "model_version": model_version,
        "model_family": MODEL_FAMILY,
        "algorithm": "XGBoost regression (XGBRegressor)",
        "target": (
            "price change from last known price; predictions are reconstructed "
            "as lag_1 + predicted_delta. Metrics are reported on price levels."
        ),
        "horizon_days": horizon_days,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "artifact": model_path.name,
        "training_data": {
            "observations_loaded": int(len(raw)),
            "training_rows": int(len(built)),
            "sources": provenance["counts"],
            "trained_on_real_data": provenance["has_real_data"],
            "is_demo_trained": provenance["is_demo_only"],
            "date_range": {
                "from": str(built.observation_date.min().date()),
                "to": str(built.observation_date.max().date()),
            },
            "crops": sorted(built["crop"].unique().tolist()),
            "markets": int(built["market_id"].nunique()),
        },
        "split": {
            "strategy": "chronological",
            "train_rows": int(len(train_df)),
            "validation_rows": int(len(val_df)),
            "test_rows": int(len(test_df)),
        },
        "metrics": {
            "validation": val_metrics,
            "test": test_metrics,
            "persistence_baseline_test": baseline_metrics,
            "beats_persistence_baseline": bool(beats_baseline),
            "mae_improvement_over_baseline_pct": round(improvement, 2),
        },
        "features": FEATURE_COLUMNS,
        "top_feature_importances": [
            {"feature": name, "importance": round(value, 5)} for name, value in importances
        ],
        "hyperparameters": XGB_PARAMS,
        "provides_prediction_intervals": False,
        "notes": (
            "Lags are positional (trading days), not calendar days, because "
            "mandis do not trade every day. No prediction intervals are "
            "produced; any confidence reported by the API is a qualitative "
            "band derived from test error, not a statistical interval."
        ),
    }

    metadata_path = MODEL_DIR / f"price_model_h{horizon_days}_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2))

    # Default-horizon artifacts also get the stable unsuffixed names the
    # inference layer looks for first.
    if horizon_days == DEFAULT_HORIZON_DAYS:
        joblib.dump(
            {
                "model": model,
                "feature_columns": FEATURE_COLUMNS,
                "horizon_days": horizon_days,
                "model_version": model_version,
            },
            MODEL_FILE,
        )
        METADATA_FILE.write_text(json.dumps(metadata, indent=2))

    print(f"\nSaved model    : {model_path}")
    print(f"Saved metadata : {metadata_path}")
    print(f"Model version  : {model_version}")

    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train the AgriChain price model")
    parser.add_argument("--horizon", type=int, default=DEFAULT_HORIZON_DAYS)
    parser.add_argument("--sources", nargs="*", default=None,
                        help="e.g. MANDI_API to train only on real observations")
    parser.add_argument("--crops", nargs="*", default=None)
    args = parser.parse_args()

    train(horizon_days=args.horizon, sources=args.sources, crops=args.crops)


if __name__ == "__main__":
    main()
