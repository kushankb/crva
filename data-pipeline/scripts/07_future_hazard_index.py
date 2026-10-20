"""
Aggregate future hazard index following Rama Rao et al. (2020), Atlas §3.3 and Table 5c.

Per district and scenario/period:
  1. change from the 1985–2014 baseline (% for rainfall and rainy days, absolute otherwise)
  2. no truncation: extremes are kept (the Atlas clips at the 1st/99th percentile)
  3. sign-preserving normalisation:
       Z = ±X / (Xmax − Xmin)   if the range spans 0
       Z = ±X / |X|max          otherwise            (− for inversely related indicators)
  4. index = Σ (weight/100) · Z
  5. category from ±0.5 SD / ±1.5 SD (Atlas Table 7), using the SD of the
     district index within each SSP × period, as the Atlas does for its scenario

Normalisers and SD are computed from the districts within
each SSP × period, as the Atlas does for its single scenario, so index values
rank districts within a scenario but are not comparable across scenarios.
States use the constants of their scenario. Reads/writes web/public/data/crva_stats.json.

Run after 04_admin_aggregates.py and build_crva_stats.py:
  conda run -n ml_trade python 07_future_hazard_index.py
"""
import json
from pathlib import Path

import numpy as np

STATS = Path(__file__).parents[2] / "web" / "public" / "data" / "crva_stats.json"
META = Path(__file__).parents[2] / "web" / "src" / "data" / "future_hazard_meta.json"
SSPS = ["SSP126", "SSP245", "SSP370", "SSP585"]
PERIODS = ["2047", "2050", "2100"]

# (id, source indicator, weight %, change type, sign: +1 direct / −1 inverse)
COMPONENTS = [
    ("annual_rain",  "prcptot",       10, "pct", -1),
    ("june_rain",    "june_precip",    5, "pct", -1),
    ("july_rain",    "july_precip",   15, "pct", -1),
    ("rainy_days",   "rr_rainy_days",  5, "pct", -1),
    ("tmax",         "tmax_mean",      6, "abs", +1),
    ("tmin",         "tmin_mean",      6, "abs", +1),
    ("hot_days",     "rr_hot_days",    5, "abs", +1),
    ("cold_days",    "rr_cold_days",   3, "abs", +1),
    ("frost",        "frost_days",     2, "abs", +1),
    ("drought",      "spi3",          12, "abs", +1),
    ("dry_spells",   "rr_dryspell",   11, "abs", +1),
    ("p99_rain",     "rr_p99",         5, "abs", +1),
    ("events_100mm", "r100mm3d",       5, "abs", +1),
    ("rx1_pct",      "rr_rx1_pct",     5, "abs", +1),
    ("rx3_pct",      "rr_rx3_pct",     5, "abs", +1),
]
assert sum(c[2] for c in COMPONENTS) == 100

CATEGORIES = [  # (lower bound in SD, label)
    (1.5, "More unfavourable"),
    (0.5, "Moderately unfavourable"),
    (-0.5, "No hazard"),
    (-1.5, "Moderately favourable"),
    (-np.inf, "More favourable"),
]


def change(ind, ssp, per, kind):
    h = ind.get("historical", {}).get("mean")
    f = ind.get(ssp, {}).get(per, {}).get("mean")
    if h is None or f is None:
        return np.nan
    if kind == "pct":
        return (f - h) / h * 100 if h > 0 else np.nan
    return f - h


def main():
    stats = json.loads(STATS.read_text())
    keys = list(stats)
    districts = [k for k in keys if k.startswith("district:")]
    combos = [(s, p) for s in SSPS for p in PERIODS]

    raw = {}  # comp -> key -> combo -> value
    for cid, src, _, kind, _ in COMPONENTS:
        raw[cid] = {k: {c: change(stats[k]["climate_hazard"]["indicators"].get(src, {}), *c, kind) for c in combos} for k in keys}

    norm = {}
    for cid, _, _, _, sign in COMPONENTS:
        for c in combos:
            pool = np.array([raw[cid][k][c] for k in districts])
            lo, hi = np.nanmin(pool), np.nanmax(pool)
            denom = (hi - lo) if lo < 0 < hi else np.nanmax(np.abs(pool))
            norm[(cid, c)] = (lo, hi, denom if denom > 0 else 1.0, sign)

    def z(cid, c, x):
        lo, hi, denom, sign = norm[(cid, c)]
        return np.nan if np.isnan(x) else sign * float(x) / denom

    index = {k: {} for k in keys}
    for k in keys:
        for c in combos:
            parts = {cid: z(cid, c, raw[cid][k][c]) * w / 100 for cid, _, w, _, _ in COMPONENTS}
            vals = [v for v in parts.values() if not np.isnan(v)]
            index[k][c] = (sum(vals) if len(vals) == len(parts) else np.nan, parts)

    sd = {c: float(np.nanstd([index[k][c][0] for k in districts])) for c in combos}

    def category(v, c):
        return next(label for t, label in CATEGORIES if v / sd[c] > t)

    for k in keys:
        out = {}
        for (s, p), (v, parts) in index[k].items():
            if np.isnan(v):
                continue
            out.setdefault(s, {})[p] = {
                "value": round(v, 4),
                "category": category(v, (s, p)),
                "components": {cid: round(x, 4) for cid, x in parts.items()},
                "changes": {cid: round(raw[cid][k][(s, p)], 3) for cid, *_ in COMPONENTS},
            }
        stats[k]["climate_hazard"]["future_hazard_index"] = out

    META.write_text(json.dumps({
        "method": "Rama Rao et al. 2020 Atlas, Table 5c weights, sign-preserving normalisation",
        "sd": {f"{s}_{p}": round(v, 4) for (s, p), v in sd.items()},
        "components": [{"id": c[0], "source": c[1], "weight": c[2], "change": c[3], "sign": c[4]} for c in COMPONENTS],
    }, indent=1))
    STATS.write_text(json.dumps(stats, separators=(",", ":")))

    for c in combos:
        v = np.array([index[k][c][0] for k in districts])
        cats = [category(x, c) for x in v if not np.isnan(x)]
        print(f"{c[0]} {c[1]}: median {np.nanmedian(v):+.3f} SD {sd[c]:.3f}  "
              + "  ".join(f"{lab.split()[0][:4]}{lab.split()[-1][:5]}={cats.count(lab)}" for _, lab in CATEGORIES))


if __name__ == "__main__":
    main()
