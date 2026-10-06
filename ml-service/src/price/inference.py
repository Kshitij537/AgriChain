"""
Production inference for the market price model.

Loads the trained artifact once per process and serves predictions. Training
code is never imported here - this module only consumes saved artifacts.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from .config import DEFAULT_HORIZON_DAYS, MODEL_DIR, SUPPORTED_HORIZONS
from .dataset import load_recent_history
from .features import build_features


class ModelUnavailable(Exception):
    """Raised when no trained artifact exists for the requested horizon."""


class InsufficientHistory(Exception):
    """Raised when a market/crop lacks enough observations to build features."""


def _artifact_paths(horizon_days: int):
    return (
        MODEL_DIR / f"price_model_h{horizon_days}.joblib",
        MODEL_DIR / f"price_model_h{horizon_days}_metadata.json",
    )


@lru_cache(maxsize=4)
def load_model(horizon_days: int = DEFAULT_HORIZON_DAYS):
    """
    Loads and caches the trained bundle for a horizon.

    Args:
        horizon_days: prediction horizon.

    Returns:
        (bundle dict, metadata dict)

    Raises:
        ModelUnavailable: if the artifact has not been trained yet.
    """
    model_path, metadata_path = _artifact_paths(horizon_days)

    if not model_path.exists():
        raise ModelUnavailable(
            f"No trained price model for horizon {horizon_days}. "
            f"Train one with: python -m price.train --horizon {horizon_days}"
        )

    bundle = joblib.load(model_path)
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    return bundle, metadata


def is_available(horizon_days: int = DEFAULT_HORIZON_DAYS) -> bool:
    """Reports whether a trained artifact exists, without raising."""
    return _artifact_paths(horizon_days)[0].exists()


def _confidence_band(metadata: dict) -> dict:
    """
    Derives a QUALITATIVE confidence label from measured test error.

    This is explicitly NOT a statistical prediction interval. The model produces
    a point estimate only; presenting an invented interval would misrepresent
    what it knows. The band is a plain-language summary of how far the model was
    typically wrong on held-out data, plus whether it actually beat the naive
    baseline.

    Args:
        metadata: saved training metadata.

    Returns:
        dict with confidence, basis and the supporting numbers.
    """
    metrics = metadata.get("metrics", {})
    test = metrics.get("test", {})
    mape = test.get("mape")
    beats_baseline = metrics.get("beats_persistence_baseline", False)

    if mape is None:
        level = "unknown"
    elif not beats_baseline:
        # A model that cannot beat "tomorrow equals today" earns no confidence.
        level = "low"
    elif mape < 3:
        level = "medium"
    elif mape < 8:
        level = "low"
    else:
        level = "low"

    return {
        "confidence": level,
        "confidence_basis": (
            "qualitative band derived from held-out test MAPE and whether the "
            "model beat a naive persistence baseline; NOT a statistical "
            "prediction interval"
        ),
        "test_mape": mape,
        "test_mae": test.get("mae"),
        "beats_persistence_baseline": beats_baseline,
        "provides_prediction_intervals": False,
    }


def predict_price(
    crop: str,
    market_id: int,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    history: Optional[pd.DataFrame] = None,
) -> dict:
    """
    Predicts the modal price for one crop at one market.

    Args:
        crop: crop key, e.g. "tomato".
        market_id: markets.id.
        horizon_days: 1 or 3.
        history: optional pre-loaded history (used by tests).

    Returns:
        dict with current_price, predicted_price, model_version and confidence.

    Raises:
        ModelUnavailable, InsufficientHistory, ValueError
    """
    if horizon_days not in SUPPORTED_HORIZONS:
        raise ValueError(
            f"Unsupported horizon {horizon_days}; supported: {list(SUPPORTED_HORIZONS)}"
        )

    bundle, metadata = load_model(horizon_days)

    if history is None:
        history = load_recent_history(crop, market_id, limit=90)

    if history.empty:
        raise InsufficientHistory(
            f"No price history for crop='{crop}' at market_id={market_id}."
        )

    # for_training=False keeps the final row, which is the one we predict from.
    built = build_features(history, horizon_days=horizon_days, for_training=False)
    if built.empty:
        raise InsufficientHistory(
            f"Not enough observations for crop='{crop}' at market_id={market_id} "
            "to build lag and rolling features."
        )

    origin = built.iloc[[-1]]
    features = origin[bundle["feature_columns"]]

    predicted_delta = float(bundle["model"].predict(features)[0])
    last_known_price = float(origin["lag_1"].iloc[0])
    predicted_price = last_known_price + predicted_delta

    observation_date = pd.to_datetime(origin["observation_date"].iloc[0])
    source = history["source"].iloc[-1] if "source" in history else None

    confidence = _confidence_band(metadata)

    return {
        "crop": crop,
        "market_id": int(market_id),
        "current_price": round(last_known_price, 2),
        "predicted_price": round(predicted_price, 2),
        "predicted_change": round(predicted_delta, 2),
        "prediction_horizon_days": horizon_days,
        "last_observation_date": observation_date.date().isoformat(),
        "price_unit": "INR_PER_QUINTAL",
        "model_version": bundle.get("model_version", "unknown"),
        "trained_on_demo_data": metadata.get("training_data", {}).get("is_demo_trained", True),
        "input_data_source": source,
        **confidence,
    }


def model_info(horizon_days: int = DEFAULT_HORIZON_DAYS) -> dict:
    """
    Returns metadata for the loaded model, for /model-info style endpoints.
    """
    if not is_available(horizon_days):
        return {
            "available": False,
            "horizon_days": horizon_days,
            "message": "No trained price model artifact found.",
        }
    _, metadata = load_model(horizon_days)
    return {"available": True, **metadata}
