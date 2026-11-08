"""
Future hazard index, Rama Rao et al. (2020) indicators and weights (Atlas Table 5c), normalised as z-scores like
the other CRVA dimensions (user decision, 2026-11-08), for each INDRA-CMIP6 model separately, then summarised.

Per model and SSP2-4.5 window, over districts:
  1. change from 1985–2014 (% for rainfall and rainy days, absolute otherwise)
  2. truncate at the 1st and 99th percentile (as in the Atlas)
  3. z-score of the change across districts, signed (− for inverse indicators: more rain = less hazard)
  4. index = weighted sum of the z-scores; a missing indicator's weight is shared among the district's others
     (crva_weights.reweighted_index, used for every CRVA dimension)
  5. classes at ±0.5 / ±1.5 SD around the mean (Table 7): Very low … Very high, relative to other districts
Each model and window is normalised on its own (no pooling), so the index says where change is worse than
elsewhere, not how much worse than today; the absolute view is 'Is climate getting worse here?' (10_multimodel.py).
Until 2026-11-08 the Atlas Z (±X / range) was used; its spread was ~10x smaller than the other risk parts.
States use the constants of the district distribution.

Across models: median index, number of models in High or Very high (n_unfav) and in Low or Very low (n_fav),
and the median class (ordinal median, ties rounded towards Medium).

Reads model_indicators/model_changes.csv (from 10_multimodel.py --per-model);
writes model_indicators/atlas_index.csv, atlas_index_per_model.csv and atlas_contrib_per_model.csv
(each indicator's contribution to the index, per model; used for the drivers in the app).

Run:
  conda run -n ml_trade python 11_atlas_index.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

from crva_weights import reweighted_index

IND_DIR = Path(__file__).parents[1] / "model_indicators"
WEIGHTS = {"annual_rain": 10, "june_rain": 5, "july_rain": 15, "rainy_days": 5, "tmax": 6, "tmin": 6,
           "hot_days": 5, "cold_days": 3, "frost": 2, "drought": 12, "dry_spells": 11, "p99_rain": 5,
           "events_100mm": 5, "rx1_pct": 5, "rx3_pct": 5}
SIGN = {k: (-1 if k in ("annual_rain", "june_rain", "july_rain", "rainy_days") else 1) for k in WEIGHTS}
CATS = ["Very low", "Low", "Medium", "High", "Very high"]
EDGES = [-1.5, -0.5, 0.5, 1.5]  # in SD


def category_code(v, sd):
    return int(np.searchsorted(EDGES, v / sd, "right")) - 2  # −2 … +2


def main():
    ch = pd.read_csv(IND_DIR / "model_changes.csv")
    ch = ch[ch["indicator"].isin(WEIGHTS)]
    rows, contrib, scores = [], [], []
    for (model, window), g in ch.groupby(["model", "window"]):
        wide = g.pivot_table(index="admin", columns="indicator", values="change")
        dist = wide.index.str.startswith("district:")
        z = pd.DataFrame(index=wide.index)
        for ind in WEIGHTS:
            x = wide[ind]
            d = x[dist].dropna()
            lo, hi = np.percentile(d, [1, 99])
            xc = x.clip(lo, hi)
            mu, sd = xc[dist].mean(), xc[dist].std()
            z[ind] = SIGN[ind] * (xc - mu) / (sd if sd > 0 else 1)
        index, c, share, _ = reweighted_index(z, WEIGHTS)
        cl = c.stack(future_stack=True).rename("contrib").reset_index()
        cl.columns = ["admin", "indicator", "contrib"]
        contrib.append(cl.assign(model=model, window=window)[["model", "window", "admin", "indicator", "contrib"]])
        # values and normalised scores, for the distribution plots (Outputs/CRVA_indicator_distributions)
        scores.append(pd.concat([wide[list(WEIGHTS)].add_suffix("_change"), z.add_suffix("_score")], axis=1)
                      .assign(model=model, window=window).reset_index())
        sd, mu = index[dist].std(ddof=0), index[dist].mean()
        for admin, v in index.items():
            rows.append({"model": model, "window": window, "admin": admin, "index": v, "sd": sd,
                         "code": category_code(v - mu, sd)})
    per = pd.DataFrame(rows)

    summ = per.groupby(["admin", "window"]).agg(
        index_med=("index", "median"), index_min=("index", "min"), index_max=("index", "max"),
        code_med=("code", lambda c: int(np.trunc(np.median(c)))),
        n_unfav=("code", lambda c: int((c >= 1).sum())), n_fav=("code", lambda c: int((c <= -1).sum())),
        n=("code", "count")).reset_index()
    summ["category"] = summ["code_med"].map(lambda c: CATS[c + 2])
    per.to_csv(IND_DIR / "atlas_index_per_model.csv", index=False)
    # each indicator's weighted, normalised contribution to the index (sums to the index), per model
    pd.concat(contrib).to_csv(IND_DIR / "atlas_contrib_per_model.csv", index=False)
    summ.to_csv(IND_DIR / "atlas_index.csv", index=False)
    pd.concat(scores).to_csv(IND_DIR / "atlas_scores_per_model.csv", index=False)

    d = summ[summ["admin"].str.startswith("district:")]
    for w in sorted(d["window"].unique()):
        x = d[d["window"] == w]
        counts = {c: int((x["category"] == c).sum()) for c in CATS}
        print(f"~{w}: {counts}  | >=4 of 6 models unfavourable: {(x['n_unfav'] >= 4).sum()}, favourable: {(x['n_fav'] >= 4).sum()}")
    pm = per[per["admin"].str.startswith("district:") & (per["window"] == 2050)]
    print("\n~2050 per model (districts):")
    print(pm.assign(cat=pm["code"].map(lambda c: CATS[c + 2])).pivot_table(index="cat", columns="model", values="admin", aggfunc="count", fill_value=0).reindex(CATS).fillna(0).astype(int).to_string())


if __name__ == "__main__":
    main()
