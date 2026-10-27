"""
Future hazard index exactly as in Rama Rao et al. (2020), Atlas §3.3, applied to
each INDRA-CMIP6 model separately, then summarised across models.

Per model and SSP2-4.5 window, over districts:
  1. change from 1985–2014 (% for rainfall and rainy days, absolute otherwise)
  2. truncate at the 1st and 99th percentile
  3. Z = ±X / (Xmax − Xmin) if the range spans 0, else ±X / |X|max  (− for inverse indicators)
  4. index = Σ (Table 5c weight / 100) · Z
  5. category by the SD of the district index around zero (Table 7)
States use the constants of the district distribution.

Across models: median index, number of models whose category is unfavourable
(moderately or more), and the median category (ordinal median, ties rounded
towards no hazard).

Reads model_indicators/model_changes.csv (from 10_multimodel.py --per-model);
writes model_indicators/atlas_index.csv, atlas_index_per_model.csv and atlas_contrib_per_model.csv
(each indicator's contribution to the index, per model; used for the drivers in the app).

Run:
  conda run -n ml_trade python 11_atlas_index.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

IND_DIR = Path(__file__).parents[1] / "model_indicators"
WEIGHTS = {"annual_rain": 10, "june_rain": 5, "july_rain": 15, "rainy_days": 5, "tmax": 6, "tmin": 6,
           "hot_days": 5, "cold_days": 3, "frost": 2, "drought": 12, "dry_spells": 11, "p99_rain": 5,
           "events_100mm": 5, "rx1_pct": 5, "rx3_pct": 5}
SIGN = {k: (-1 if k in ("annual_rain", "june_rain", "july_rain", "rainy_days") else 1) for k in WEIGHTS}
CATS = ["More favourable", "Moderately favourable", "No hazard", "Moderately unfavourable", "More unfavourable"]
EDGES = [-1.5, -0.5, 0.5, 1.5]  # in SD


def category_code(v, sd):
    return int(np.searchsorted(EDGES, v / sd, "right")) - 2  # −2 … +2


def main():
    ch = pd.read_csv(IND_DIR / "model_changes.csv")
    ch = ch[ch["indicator"].isin(WEIGHTS)]
    rows, contrib = [], []
    for (model, window), g in ch.groupby(["model", "window"]):
        wide = g.pivot_table(index="admin", columns="indicator", values="change")
        dist = wide.index.str.startswith("district:")
        index = pd.Series(0.0, index=wide.index)
        for ind, w in WEIGHTS.items():
            x = wide[ind]
            d = x[dist].dropna()
            lo, hi = np.percentile(d, [1, 99])
            xc = x.clip(lo, hi)
            denom = (hi - lo) if lo < 0 < hi else max(abs(lo), abs(hi))
            c = (SIGN[ind] * xc / (denom if denom > 0 else 1)).fillna(0) * w / 100
            index += c
            contrib.append(pd.DataFrame({"model": model, "window": window, "admin": c.index, "indicator": ind, "contrib": c.values}))
        sd = index[dist].std(ddof=0)
        for admin, v in index.items():
            rows.append({"model": model, "window": window, "admin": admin, "index": v, "sd": sd,
                         "code": category_code(v, sd)})
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
