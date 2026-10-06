"""
Market price prediction endpoints.

Mounted alongside the existing disease detection endpoints in api/app.py. The
price model is imported lazily inside the handlers so that this router never
slows or breaks disease inference startup, and so that a missing price artifact
degrades to a clear 503 rather than preventing the service from booting.
"""

import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

SRC_DIR = Path(__file__).resolve().parent.parent.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

router = APIRouter(tags=["market-price"])


class PricePredictionRequest(BaseModel):
    """Request body for POST /predict/price."""

    crop: str = Field(..., min_length=1, description="Crop key, e.g. 'tomato'")
    market_id: int = Field(..., gt=0, description="markets.id of the mandi")
    prediction_days: int = Field(
        1, ge=1, le=3, description="Forecast horizon in days (1 or 3)"
    )


class PricePredictionResponse(BaseModel):
    """Point forecast plus full provenance. No invented confidence intervals."""

    crop: str
    market_id: int
    current_price: float
    predicted_price: float
    predicted_change: float
    prediction_horizon_days: int
    last_observation_date: str
    price_unit: str
    model_version: str
    confidence: str
    confidence_basis: str
    provides_prediction_intervals: bool
    beats_persistence_baseline: bool
    trained_on_demo_data: bool
    test_mae: float | None = None
    test_mape: float | None = None
    input_data_source: str | None = None


@router.post(
    "/predict/price",
    response_model=PricePredictionResponse,
    summary="Predict the future modal price for a crop at a mandi",
)
async def predict_price_endpoint(request: PricePredictionRequest):
    """
    Returns a point price forecast for one crop at one market.

    Raises 503 when no model has been trained, and 422 when the market/crop has
    too little price history to build features. Both are recoverable states the
    caller is expected to handle by falling back to the current price.
    """
    from price.inference import (  # noqa: PLC0415 - deliberate lazy import
        InsufficientHistory,
        ModelUnavailable,
        predict_price,
    )

    try:
        return predict_price(
            crop=request.crop.strip().lower(),
            market_id=request.market_id,
            horizon_days=request.prediction_days,
        )
    except ModelUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except InsufficientHistory as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except Exception as exc:  # pragma: no cover - unexpected inference failure
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Price inference failed: {exc}",
        ) from exc


@router.get(
    "/price-model/info",
    summary="Training metadata for the price model",
)
async def price_model_info(
    horizon_days: int = Query(1, ge=1, le=3, description="Horizon to describe")
):
    """
    Exposes model version, training data provenance and held-out metrics.

    This is how a reviewer confirms whether the deployed model was trained on
    real provider observations or on demo data, and whether it actually beats
    the naive baseline.
    """
    from price.inference import model_info  # noqa: PLC0415

    return model_info(horizon_days)
