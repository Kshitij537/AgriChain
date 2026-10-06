"""
Loads market price observations from PostgreSQL for training and inference.

The ML service reads the price tables directly rather than having every
prediction ship 30+ rows of history over HTTP from Node. Training needs
database access regardless, so this keeps one data path instead of two.

Connection settings are read from the same environment variables the Node
backend uses, so a single .env configures both.
"""

from __future__ import annotations

import os
from typing import Optional, Sequence

import pandas as pd
import psycopg2


def get_connection():
    """
    Opens a PostgreSQL connection using the project's standard DB_* variables.

    Returns:
        psycopg2 connection.
    """
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        dbname=os.getenv("DB_NAME", "agrichain_db"),
    )


def load_price_observations(
    crops: Optional[Sequence[str]] = None,
    sources: Optional[Sequence[str]] = None,
) -> pd.DataFrame:
    """
    Loads price observations for model training.

    Args:
        crops: restrict to these crop keys; None loads all.
        sources: restrict to these provenance values (e.g. ['MANDI_API']).
            None loads all, which during development means demo data too.

    Returns:
        DataFrame with market_id, market_code, crop, observation_date,
        modal_price, arrival_quantity, source.
    """
    clauses = ["m.active = TRUE"]
    params: list = []

    if crops:
        params.append(list(crops))
        clauses.append(f"mp.crop = ANY(%s)")
    if sources:
        params.append(list(sources))
        clauses.append(f"mp.source = ANY(%s)")

    sql = f"""
        SELECT mp.market_id,
               m.market_code,
               mp.crop,
               mp.observation_date,
               mp.modal_price,
               mp.arrival_quantity,
               mp.source
        FROM market_prices mp
        JOIN markets m ON m.id = mp.market_id
        WHERE {' AND '.join(clauses)}
        ORDER BY mp.market_id, mp.crop, mp.observation_date
    """

    with get_connection() as conn:
        frame = pd.read_sql_query(sql, conn, params=params or None)

    return frame


def load_recent_history(
    crop: str, market_id: int, limit: int = 90
) -> pd.DataFrame:
    """
    Loads the most recent observations for one market/crop, for inference.

    Args:
        crop: crop key.
        market_id: markets.id.
        limit: how many recent observations to fetch.

    Returns:
        DataFrame sorted ascending by observation_date (oldest first).
    """
    sql = """
        SELECT mp.market_id,
               m.market_code,
               mp.crop,
               mp.observation_date,
               mp.modal_price,
               mp.arrival_quantity,
               mp.source
        FROM market_prices mp
        JOIN markets m ON m.id = mp.market_id
        WHERE mp.crop = %s AND mp.market_id = %s
        ORDER BY mp.observation_date DESC
        LIMIT %s
    """
    with get_connection() as conn:
        frame = pd.read_sql_query(sql, conn, params=(crop, market_id, limit))

    return frame.sort_values("observation_date").reset_index(drop=True)


def describe_sources(frame: pd.DataFrame) -> dict:
    """
    Summarises provenance of a loaded frame.

    Used to decide whether a trained model may be called a real-data model or
    must be versioned as demo-trained.

    Args:
        frame: loaded observations.

    Returns:
        dict with counts per source and an `is_demo_only` flag.
    """
    if frame.empty or "source" not in frame:
        return {"counts": {}, "is_demo_only": True, "has_real_data": False}

    counts = frame["source"].value_counts().to_dict()
    # Any provider-sourced observation counts as real. MANDI_API is the current
    # provider; AGMARKNET is the retired data.gov.in integration, whose historical
    # rows keep their original label.
    REAL_SOURCES = ("MANDI_API", "AGMARKNET")
    has_real = any(counts.get(src, 0) > 0 for src in REAL_SOURCES)
    return {
        "counts": counts,
        "has_real_data": has_real,
        "is_demo_only": not has_real,
    }
