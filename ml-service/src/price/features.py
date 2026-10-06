"""
Feature engineering for market price prediction.

LEAKAGE POLICY
--------------
The single most important property of this module: a row whose target is the
price on date T may only use information available strictly before T.

Concretely, for a series sorted ascending by observation date and a row at
position t whose target is the price at t + horizon:

  * lag_1 is the price AT t (the last price actually known when predicting)
  * lag_k is the price at t - (k - 1)
  * every rolling statistic is computed over a window ENDING at t
  * the target is price at t + horizon and is never used as an input

Every feature is therefore built from the prediction-origin row backwards, and
the target is taken forwards. `assert_no_leakage` re-verifies this on the built
frame rather than trusting the construction code.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import (
    TARGET_DELTA_COLUMN,
    LAG_DAYS,
    ROLLING_WINDOWS,
    SEASON_BY_MONTH,
    FEATURE_COLUMNS,
    TARGET_COLUMN,
    MIN_SERIES_LENGTH,
)

GROUP_KEYS = ["market_id", "crop"]


def next_trading_dates(origin: pd.Series, steps: int) -> pd.Series:
    """
    Projects the calendar date `steps` trading days after each origin date.

    Needed because the calendar features describe the TARGET date, and for the
    most recent observation in a series that date has not been observed yet -
    it is the future date we are forecasting. Shifting the observed dates
    backwards leaves it null, which would drop precisely the row inference
    needs.

    Mandis do not auction on Sundays, so a "trading day" skips them. This is a
    calendar projection only; it invents no price.

    Args:
        origin: datetime series of prediction-origin dates.
        steps: trading days ahead.

    Returns:
        Datetime series of projected target dates.
    """
    projected = origin.copy()
    for _ in range(max(0, steps)):
        projected = projected + pd.Timedelta(days=1)
        # dayofweek: Monday=0 ... Sunday=6
        sundays = projected.dt.dayofweek == 6
        projected = projected.mask(sundays, projected + pd.Timedelta(days=1))
    return projected


def _build_group_features(group: pd.DataFrame, horizon_days: int) -> pd.DataFrame:
    """
    Builds features for one (market, crop) series.

    Args:
        group: rows for a single market/crop, sorted ascending by date.
        horizon_days: how many observations ahead to predict.

    Returns:
        The group with feature and target columns attached.
    """
    group = group.sort_values("observation_date").copy()
    modal = group["modal_price"]

    # lag_1 is the price at the prediction origin; lag_k reaches k-1 further back.
    for lag in LAG_DAYS:
        group[f"lag_{lag}"] = modal.shift(lag - 1)

    # Rolling windows end at the prediction origin, so they never see the target.
    for window in ROLLING_WINDOWS:
        group[f"rolling_mean_{window}"] = modal.rolling(window, min_periods=window).mean()

    group["rolling_std_7"] = modal.rolling(7, min_periods=7).std()

    # Momentum: how the price moved into the prediction origin.
    group["price_change_1"] = modal - modal.shift(1)
    group["price_change_7"] = modal - modal.shift(7)

    # Relative dispersion over the recent past.
    rolling_mean_14 = modal.rolling(14, min_periods=14).mean()
    group["price_volatility_14"] = (
        modal.rolling(14, min_periods=14).std() / rolling_mean_14
    )

    group["arrival_rolling_mean_7"] = (
        group["arrival_quantity"].rolling(7, min_periods=1).mean()
    )

    # Calendar features describe the TARGET date, which is known in advance -
    # we always know what month and weekday tomorrow will be.
    target_dates = group["observation_date"].shift(-horizon_days)

    # The final `horizon_days` rows have no observed target date, because their
    # target lies in the future. For training those rows are dropped anyway (no
    # label), but at inference the last row is exactly the one to predict from,
    # so project its target date forward instead of leaving it null.
    missing = target_dates.isna()
    if missing.any():
        target_dates = target_dates.where(
            ~missing,
            next_trading_dates(group["observation_date"], horizon_days),
        )

    group["target_date"] = target_dates
    group["month"] = target_dates.dt.month
    group["day_of_week"] = target_dates.dt.dayofweek
    group["day_of_year"] = target_dates.dt.dayofyear
    group["season"] = group["month"].map(SEASON_BY_MONTH)

    # The label: the price `horizon_days` observations ahead.
    group[TARGET_COLUMN] = modal.shift(-horizon_days)

    # The model is actually fitted on the CHANGE from the last known price.
    #
    # Daily mandi prices behave close to a random walk, so a model fitted to
    # the price level spends its capacity re-learning the level and then
    # extrapolates trend badly out of sample. Fitting the delta bounds the
    # worst case at persistence: predicting a delta of zero reproduces the
    # naive baseline exactly, so the model can only add information.
    group[TARGET_DELTA_COLUMN] = group[TARGET_COLUMN] - modal

    return group


def build_features(
    frame: pd.DataFrame,
    horizon_days: int = 1,
    *,
    for_training: bool = True,
) -> pd.DataFrame:
    """
    Builds the modelling frame from raw price observations.

    Args:
        frame: columns market_id, crop, observation_date, modal_price,
            arrival_quantity.
        horizon_days: prediction horizon in observations.
        for_training: when True, rows without a target are dropped. When False
            (inference) the final row of each series is kept, since that is
            precisely the row we want to predict from.

    Returns:
        Frame with FEATURE_COLUMNS present, plus target when training.
    """
    if frame.empty:
        return frame.copy()

    data = frame.copy()
    data["observation_date"] = pd.to_datetime(data["observation_date"])
    data["modal_price"] = pd.to_numeric(data["modal_price"], errors="coerce")
    data["arrival_quantity"] = pd.to_numeric(
        data.get("arrival_quantity"), errors="coerce"
    ).fillna(0.0)
    data = data.dropna(subset=["modal_price"])

    # Drop series too short to produce a full-length lag window at all.
    lengths = data.groupby(GROUP_KEYS)["modal_price"].transform("size")
    data = data[lengths >= MIN_SERIES_LENGTH]
    if data.empty:
        return data

    built = [
        _build_group_features(group, horizon_days)
        for _, group in data.groupby(GROUP_KEYS, sort=False)
    ]
    result = pd.concat(built, ignore_index=True)

    # Stable integer codes for the categorical columns. Codes are persisted in
    # the model metadata so inference maps identically.
    result["crop_code"] = result["crop"].astype("category").cat.codes
    result["market_code_id"] = result["market_id"].astype(int)

    if for_training:
        result = result.dropna(subset=[TARGET_COLUMN, TARGET_DELTA_COLUMN])

    result = result.dropna(subset=FEATURE_COLUMNS)
    return result.reset_index(drop=True)


def assert_no_leakage(built: pd.DataFrame, horizon_days: int) -> None:
    """
    Verifies empirically that no feature equals the target.

    Construction bugs (an off-by-one in a shift) are easy to introduce and
    silently produce near-perfect metrics, so this checks the built frame
    directly instead of trusting the code above.

    Raises:
        AssertionError: if any feature column reproduces the target, or if any
            target date is not strictly after its prediction origin.
    """
    if built.empty:
        return

    target = built[TARGET_COLUMN].to_numpy(dtype=float)

    for column in FEATURE_COLUMNS:
        values = built[column].to_numpy(dtype=float)
        if np.allclose(values, target, rtol=1e-9, atol=1e-9):
            raise AssertionError(
                f"Leakage: feature '{column}' is identical to the target."
            )

    if "target_date" in built.columns:
        origin = pd.to_datetime(built["observation_date"])
        target_date = pd.to_datetime(built["target_date"])
        if not (target_date > origin).all():
            raise AssertionError(
                "Leakage: at least one target date is not after its prediction origin."
            )


def chronological_split(
    built: pd.DataFrame, test_fraction: float, validation_fraction: float
):
    """
    Splits strictly by time: train is oldest, then validation, then test.

    A random split would place future observations in the training set and make
    the evaluation meaningless for a forecasting model.

    Args:
        built: feature frame.
        test_fraction: share of the newest rows held out for test.
        validation_fraction: share held out for validation, before test.

    Returns:
        (train, validation, test) frames.
    """
    ordered = built.sort_values("observation_date").reset_index(drop=True)
    total = len(ordered)

    test_size = int(total * test_fraction)
    validation_size = int(total * validation_fraction)
    train_size = total - test_size - validation_size

    train = ordered.iloc[:train_size]
    validation = ordered.iloc[train_size : train_size + validation_size]
    test = ordered.iloc[train_size + validation_size :]

    return train, validation, test
