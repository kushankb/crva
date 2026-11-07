"""Shared index arithmetic for every CRVA dimension and for risk (Rama Rao et al. 2020, Section 3.3).

reweighted_index() is the one place where indicator scores are combined with weights. In each district the weights
are re-scaled over the indicators that have data, so a missing indicator's weight is shared pro rata among the
others; nothing is filled with 0. A district needs at least `min_share` of the full weight to get an index.

Used by:
  Outputs/CRVA_exposure/scripts/03_exposure_index.py           exposure (Table 5a)
  Outputs/CRVA_historical_hazard/scripts/03_hazard_index.py    historical hazard (Table 5b)
  Outputs/CRVA_vulnerability/scripts/03_vulnerability_index.py vulnerability (Table 5d)
  CRVATool/data-pipeline/scripts/11_atlas_index.py             future hazard (Table 5c), per model
  CRVATool/data-pipeline/scripts/16_drivers_web.py             risk (Table 6)
"""
import numpy as np
import pandas as pd

MIN_SHARE = 0.5   # at least half of the full weight must have data


def zscore(x: pd.Series) -> pd.Series:
    """Standard score across the districts given (NaN stays NaN)."""
    return (x - x.mean()) / x.std()


def reweighted_index(scores: pd.DataFrame, weights: dict, min_share: float = MIN_SHARE):
    """Weighted index with weights re-scaled over the indicators each district has.

    scores   one column per indicator, already normalised and signed (higher = more hazard / exposure / vulnerability)
    weights  {indicator: weight}, any scale (Atlas percentages)

    Returns
      index    sum of contributions; NaN where less than `min_share` of the weight has data
      contrib  weight / (sum of weights with data) x score; NaN for a missing indicator; rows add up to the index
      share    share of the full weight with data (1 = complete)
      missing  comma-separated names of the missing indicators, or None
    """
    s = scores[list(weights)].astype(float)
    w = pd.DataFrame({c: np.where(s[c].notna(), float(weights[c]), 0.0) for c in weights}, index=s.index)
    have = w.sum(axis=1)
    share = have / float(sum(weights.values()))
    ok = share >= min_share
    contrib = (s * w).div(have.where(have > 0), axis=0)
    contrib = contrib.where(s.notna()).where(ok, axis=0)
    index = contrib.sum(axis=1, min_count=1).where(ok)
    missing = s.isna().apply(lambda r: ",".join(r.index[r]) or None, axis=1)
    return index, contrib, share, missing
