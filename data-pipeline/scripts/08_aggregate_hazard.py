"""
Aggregate future hazard, two complementary views (per district, per SSP × period).

Built on the 15 Rama Rao (2020) indicators, with two adjustments:
  A. Rainfall direction depends on the baseline. For annual, June and July
     rainfall and rainy days, an increase is favourable only where the
     district's 1985–2014 annual rainfall is below 1500 mm (the Atlas's own
     rainfall cap); at or above it an increase is neutral. A decrease is
     adverse everywhere.
  B. Hot days, cold days and drought get weight 0 (not reliable on
     ensemble-mean daily data); their weight is shared out among the other 12
     in proportion to the Atlas Table 5c weights.

Outputs, written to crva_stats.json under climate_hazard.aggregate_hazard:
  absolute  weighted share (%) of indicators at least 10% worse than the
            district's own 1985–2014 mean; districts with a zero baseline for an
            indicator drop that indicator and the weights are rescaled.
            Categories: None (0), Low (<20), Moderate (20–40), High (>40).
  relative  weighted mean of per-indicator percentile ranks of the adverse
            change among districts in the scenario (100 = worst).
            Categories by quintile, and by ±0.5/±1.5 SD around the mean.

Run after 07_future_hazard_index.py:
  conda run -n ml_trade python 08_aggregate_hazard.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.stats import rankdata

ROOT = Path(__file__).parents[2]
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
META = ROOT / "web" / "src" / "data" / "aggregate_hazard_meta.json"
SSPS = ["SSP126", "SSP245", "SSP370", "SSP585"]
PERIODS = ["2047", "2050", "2100"]

WET_MM = 1500
WORSE_PCT = 10
ZEROED = {"hot_days", "cold_days", "drought"}
RAIN = {"annual_rain", "june_rain", "july_rain", "rainy_days"}

# (id, source indicator, Atlas weight %, change type, sign: +1 increase worse / −1 decrease worse)
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
kept = sum(w for cid, _, w, _, _ in COMPONENTS if cid not in ZEROED)
WEIGHT = {cid: (0.0 if cid in ZEROED else w * 100 / kept) for cid, _, w, _, _ in COMPONENTS}

ABS_CLASSES = [(40, "High"), (20, "Moderate"), (0, "Low")]
QUINTILES = ["Very low", "Low", "Medium", "High", "Very high"]
SD_CLASSES = [(1.5, "Very high"), (0.5, "High"), (-0.5, "Medium"), (-1.5, "Low"), (-np.inf, "Very low")]


def adverse(cid, sign, change, wet):
    """Change oriented so that positive = worse, after the rainfall rule."""
    if change is None or np.isnan(change):
        return np.nan
    a = change * sign
    if cid in RAIN and wet:
        a = max(a, 0.0)  # an increase in an already-wet district is neutral
    return a


def abs_class(share):
    if share <= 0:
        return "None"
    return next(label for t, label in ABS_CLASSES if share > t or t == 0)


def main():
    stats = json.loads(STATS.read_text())
    keys = [k for k in stats if stats[k].get("climate_hazard", {}).get("indicators")]
    districts = [k for k in keys if k.startswith("district:")]
    combos = [(s, p) for s in SSPS for p in PERIODS]

    def ind(k, src):
        return stats[k]["climate_hazard"]["indicators"].get(src, {})

    base_rain = {k: ind(k, "prcptot").get("historical", {}).get("mean") for k in keys}
    wet = {k: (v is not None and v >= WET_MM) for k, v in base_rain.items()}

    out = {k: {} for k in keys}
    summary = {}
    for s, p in combos:
        adv, rel = {}, {}
        for cid, src, _, kind, sign in COMPONENTS:
            adv[cid], rel[cid] = {}, {}
            for k in keys:
                h = ind(k, src).get("historical", {}).get("mean")
                f = ind(k, src).get(s, {}).get(p, {}).get("mean")
                if h is None or f is None:
                    adv[cid][k] = rel[cid][k] = np.nan
                    continue
                change = (f - h) / h * 100 if kind == "pct" else f - h
                if kind == "pct" and h <= 0:
                    change = np.nan
                adv[cid][k] = adverse(cid, sign, change, wet[k])
                r = (f - h) / abs(h) * 100 if abs(h) > 1e-9 else np.nan
                rel[cid][k] = adverse(cid, sign, r, wet[k])

        # relative view: percentile rank among districts (states ranked against the district distribution)
        ranks = {}
        for cid, *_ in COMPONENTS:
            if WEIGHT[cid] == 0:
                continue
            dvals = np.array([adv[cid][k] for k in districts])
            ok = ~np.isnan(dvals)
            sorted_d = np.sort(dvals[ok])
            ranks[cid] = {}
            for k in keys:
                v = adv[cid][k]
                if np.isnan(v):
                    ranks[cid][k] = np.nan
                else:
                    lo = np.searchsorted(sorted_d, v, "left")
                    hi = np.searchsorted(sorted_d, v, "right")
                    ranks[cid][k] = (lo + hi) / 2 / len(sorted_d) * 100

        rel_score, abs_share, detail = {}, {}, {}
        for k in keys:
            num = den = 0.0
            worse_w = valid_w = 0.0
            comp = {}
            for cid, *_ in COMPONENTS:
                w = WEIGHT[cid]
                rk = ranks.get(cid, {}).get(k, np.nan)
                rc = rel[cid][k]
                is_worse = (not np.isnan(rc)) and rc >= WORSE_PCT
                comp[cid] = {
                    "change": None if np.isnan(adv[cid][k]) else round(float(adv[cid][k]), 3),
                    "rank": None if np.isnan(rk) else round(float(rk), 1),
                    "worse10": None if np.isnan(rc) else bool(is_worse),
                    "weight": round(w, 2),
                }
                if w == 0:
                    continue
                if not np.isnan(rk):
                    num += w * rk
                    den += w
                if not np.isnan(rc):
                    valid_w += w
                    worse_w += w if is_worse else 0
            rel_score[k] = num / den if den else np.nan
            abs_share[k] = worse_w / valid_w * 100 if valid_w else np.nan
            detail[k] = comp

        dscores = np.array([rel_score[k] for k in districts])
        mu, sd = float(np.nanmean(dscores)), float(np.nanstd(dscores))
        qcuts = np.nanpercentile(dscores, [20, 40, 60, 80])

        for k in keys:
            v, a = rel_score[k], abs_share[k]
            if np.isnan(v):
                continue
            out[k].setdefault(s, {})[p] = {
                "absolute": {"share": round(float(a), 1), "category": abs_class(a)},
                "relative": {
                    "score": round(float(v), 1),
                    "quintile": QUINTILES[int(np.searchsorted(qcuts, v, "right"))],
                    "sd_class": next(label for t, label in SD_CLASSES if (v - mu) / sd > t),
                },
                "wet_baseline": wet[k],
                "components": detail[k],
            }
        summary[f"{s}_{p}"] = {"mean": round(mu, 2), "sd": round(sd, 2), "quintile_cuts": [round(float(x), 1) for x in qcuts]}

    for k in keys:
        stats[k]["climate_hazard"]["aggregate_hazard"] = out[k]
    STATS.write_text(json.dumps(stats, separators=(",", ":")))
    META.write_text(json.dumps({
        "wet_threshold_mm": WET_MM, "worse_threshold_pct": WORSE_PCT,
        "zeroed": sorted(ZEROED),
        "weights": {cid: round(WEIGHT[cid], 2) for cid, *_ in COMPONENTS},
        "atlas_weights": {cid: w for cid, _, w, _, _ in COMPONENTS},
        "scenarios": summary,
    }, indent=1))

    print(f"wet districts (baseline >= {WET_MM} mm): {sum(wet[k] for k in districts)} of {len(districts)}")
    print("weights:", {c: round(w, 1) for c, w in WEIGHT.items() if w})
    for s, p in combos:
        rows = [out[k].get(s, {}).get(p) for k in districts]
        rows = [r for r in rows if r]
        ac = {c: sum(r["absolute"]["category"] == c for r in rows) for c in ["None", "Low", "Moderate", "High"]}
        sc = {c: sum(r["relative"]["sd_class"] == c for r in rows) for _, c in SD_CLASSES}
        med = np.median([r["absolute"]["share"] for r in rows])
        print(f"{s} {p}: absolute {ac} (median share {med:.1f}%) | relative SD {sc}")


if __name__ == "__main__":
    main()
