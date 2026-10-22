"""
Rama Rao (2020) future-hazard indicators for individual INDRA-CMIP6 models,
using the Atlas's own definitions (no ensemble workarounds):

  annual/June/July rainfall, rainy days (>= 2.5 mm)   % change
  Tmax, Tmin                                          °C change (annual means)
  unusually hot days   Mar–May, Tmax >= normal + 4 °C (normal = 1985–2014 day-of-year mean)
  unusually cold days  Dec–Feb, Tmin <= normal − 4 °C
  frost days           Tmin < 0 °C
  drought proneness    2 × P(severe) + P(moderate), from annual rainfall deficit vs the
                       1985–2014 normal (moderate 26–50 %, severe > 50 %), as % of years
  dry-spell score      Jun–Oct, spells of >= 14 days < 2.5 mm, sum exp(min(L,42)/14 − 1)
  99th-percentile daily rain, events > 100 mm in 3 days, Rx1/Rx3 as % of annual normal

Windows: historical 1985–2014; SSP2-4.5 ~2047 (2033–2062), ~2050 (2036–2065),
~2100 (2071–2100). District and state means (regionmask, as 04_admin_aggregates.py).

Writes data-pipeline/model_indicators/{model}.csv with one row per
admin unit × indicator: base and future value for each window.

Run (all models found on disk, or the ones named):
  conda run -n ml_trade python 09_model_indicators.py [MODEL ...]
"""
import importlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
agg = importlib.import_module("04_admin_aggregates")
cmp_ = importlib.import_module("compare_single_model")
Reader, MONTH, MAM, DJF, WET = cmp_.Reader, cmp_.MONTH, cmp_.MAM, cmp_.DJF, cmp_.WET
dryspell_score, events_100mm, climatology = cmp_.dryspell_score, cmp_.events_100mm, cmp_.climatology

MODELS_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/models")
OUT_DIR = Path(__file__).parents[1] / "model_indicators"
BASE = (1985, 2014)
WINDOWS = {"2047": (2033, 2062), "2050": (2036, 2065), "2100": (2071, 2100)}
VARS = ("pr", "tasmax", "tasmin")


def yearly(r, y, normals, ann_base):
    p, tx, tn = r["pr"].year(y), r["tasmax"].year(y), r["tasmin"].year(y)
    if p is None or tx is None or tn is None:
        return None
    (nx_, _), (nn_, _) = normals
    ev, rx3 = events_100mm(p)
    return {
        "annual_rain": p.sum(0), "june_rain": p[MONTH == 6].sum(0), "july_rain": p[MONTH == 7].sum(0),
        "rainy_days": (p >= WET).sum(0).astype(np.float32),
        "tmax": tx.mean(0), "tmin": tn.mean(0),
        "hot_days": ((tx[MAM] - nx_[MAM]) >= 4).sum(0).astype(np.float32),
        "cold_days": ((tn[DJF] - nn_[DJF]) <= -4).sum(0).astype(np.float32),
        "frost": (tn < 0).sum(0).astype(np.float32),
        "dry_spells": dryspell_score(p),
        "p99_rain": np.percentile(p, 99, axis=0).astype(np.float32),
        "events_100mm": ev,
        "rx1_pct": p.max(0) / ann_base * 100, "rx3_pct": rx3 / ann_base * 100,
    }


def window_mean(series, years, ann_base):
    keys = series[years[0]].keys()
    out = {k: np.mean([series[y][k] for y in years], 0).astype(np.float32) for k in keys}
    annual = np.stack([series[y]["annual_rain"] for y in years])
    deficit = 1 - annual / ann_base
    sev, mod = (deficit > 0.5).mean(0), ((deficit > 0.26) & (deficit <= 0.5)).mean(0)
    out["drought"] = ((2 * sev + mod) * 100).astype(np.float32)
    return out


def run_model(model, states, districts):
    d = MODELS_DIR / model
    rh = {v: Reader(d / v / "historical_DBCCA.nc", v) for v in VARS}
    rf = {v: Reader(d / v / "ssp245_DBCCA.nc", v) for v in VARS}
    yb = (BASE[0], BASE[1] + 1)
    print(f"== {model}: baseline climatology", flush=True)
    normals = (climatology(rh["tasmax"], yb, MAM), climatology(rh["tasmin"], yb, DJF))
    ann_base = np.mean([rh["pr"].year(y).sum(0) for y in range(*yb)], 0)
    ann_base = np.where(ann_base > 0, ann_base, np.nan).astype(np.float32)

    hist_series = {y: yearly(rh, y, normals, ann_base) for y in range(*yb)}
    fields = {"historical": window_mean(hist_series, list(range(*yb)), ann_base)}
    print(f"   baseline done", flush=True)

    lo, hi = min(a for a, _ in WINDOWS.values()), max(b for _, b in WINDOWS.values())
    fut_series = {}
    for y in range(lo, hi + 1):
        v = yearly(rf, y, normals, ann_base)
        if v is not None:
            fut_series[y] = v
    for label, (a, b) in WINDOWS.items():
        yrs = [y for y in range(a, b + 1) if y in fut_series]
        fields[label] = window_mean(fut_series, yrs, ann_base)
    print(f"   SSP2-4.5 windows done ({len(fut_series)} years)", flush=True)

    lat, lon = rh["pr"].lat, rh["pr"].lon
    rows = []
    for kind, gdf in (("state", states), ("district", districts)):
        mask = agg.build_mask(gdf, lon, lat).values
        for i, row in gdf.iterrows():
            sel = mask == i
            if not sel.any():
                continue
            for ind in fields["historical"]:
                rec = {"model": model, "admin": f"{kind}:{row['_id']}", "name": row["_name"], "indicator": ind,
                       "base": float(np.nanmean(fields["historical"][ind][sel]))}
                for label in WINDOWS:
                    rec[f"ssp245_{label}"] = float(np.nanmean(fields[label][ind][sel]))
                rows.append(rec)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{model}.csv"
    pd.DataFrame(rows).to_csv(out, index=False)
    print(f"   wrote {out.name} ({len(rows)} rows)", flush=True)


def complete(model):
    d = MODELS_DIR / model
    return all((d / v / f).exists() and (d / v / f).stat().st_size > 8e9
               for v in VARS for f in ("historical_DBCCA.nc", "ssp245_DBCCA.nc"))


def main():
    states, districts = agg.load_states(), agg.load_districts()
    models = sys.argv[1:] or sorted(p.name for p in MODELS_DIR.iterdir() if p.is_dir())
    for m in models:
        if (OUT_DIR / f"{m}.csv").exists():
            print(f"skip {m} (done)")
            continue
        if not complete(m):
            print(f"skip {m} (files incomplete)")
            continue
        run_model(m, states, districts)


if __name__ == "__main__":
    main()
