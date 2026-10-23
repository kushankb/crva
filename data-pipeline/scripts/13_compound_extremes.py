"""
Compound climate extremes from individual INDRA-CMIP6 models (not part of the
aggregate index). Computed year-round, day by day, then counted by crop season.

Thresholds come from each model's own 1985–2014 baseline, per grid cell:
  Tmax / Tmin 90th percentile, by calendar month
  trailing 30-day rainfall 10th percentile, by calendar month
  wet-day (>= 2.5 mm) daily rainfall 95th percentile

Daily flags:
  hot_dry      Tmax > p90 and trailing 30-day rainfall < p10
  hot_night    Tmax > p90 and Tmin > p90 (hot day with a hot night)
  whiplash     heavy-rain day (> wet-day p95) within 5 days after a dry spell
               of >= 14 days below 2.5 mm

Counts (days per year) by season: kharif Jun–Oct, rabi Nov–Mar (calendar year),
summer Apr–May, annual. Windows: 1985–2014, SSP2-4.5 2033–2062 (~2047),
2036–2065 (~2050), 2071–2100 (~2100). District and state means.

Writes data-pipeline/model_indicators/compound/{model}.csv with columns
model, admin, name, indicator (e.g. hot_dry_kharif), base, ssp245_2047, ssp245_2050, ssp245_2100.

Run:
  conda run -n ml_trade python 13_compound_extremes.py [MODEL ...]
"""
import importlib
import sys
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
agg = importlib.import_module("04_admin_aggregates")

MODELS_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/models")
OUT_DIR = Path(__file__).parents[1] / "model_indicators" / "compound"
MODELS = ["BCC-CSM2-MR", "GFDL-ESM4", "INM-CM5-0", "MIROC6", "MPI-ESM1-2-LR", "NorESM2-MM"]
BASE = (1985, 2014)
FUT = (2033, 2100)
WINDOWS = {"2047": (2033, 2062), "2050": (2036, 2065), "2100": (2071, 2100)}
SEASONS = {"kharif": [6, 7, 8, 9, 10], "rabi": [11, 12, 1, 2, 3], "summer": [4, 5], "annual": list(range(1, 13))}
FLAGS = ["hot_dry", "hot_night", "whiplash"]
WET, DRY_SPELL, LAG, ROLL = 2.5, 14, 5, 30
CHUNK = 50


def read_period(path, var, y0, y1, rows):
    """Daily data for years y0..y1 (noleap), lat rows slice -> (array[t, r, lon], years[t], months[t])."""
    ds = netCDF4.Dataset(path)
    t = ds["time"]
    dates = netCDF4.num2date(t[:], t.units, calendar=getattr(t, "calendar", "standard"))
    yrs = np.array([d.year for d in dates])
    mon = np.array([d.month for d in dates])
    day = np.array([d.day for d in dates])
    keep = (yrs >= y0) & (yrs <= y1) & ~((mon == 2) & (day == 29))
    idx = np.where(keep)[0]
    v = ds[var] if var in ds.variables else ds[[k for k in ds.variables if ds[k].ndim == 3][0]]
    v.set_auto_mask(False)
    a = np.asarray(v[idx[0]:idx[-1] + 1, rows, :], dtype=np.float32)
    sel = keep[idx[0]:idx[-1] + 1]
    a = a[sel]
    ds.close()
    return a, yrs[idx], mon[idx]


def trailing_sum(p, n):
    c = np.cumsum(p, axis=0, dtype=np.float64)
    out = np.full(p.shape, np.nan, np.float32)
    out[n - 1:] = c[n - 1:] - np.concatenate([np.zeros((1,) + p.shape[1:]), c[:-n]], axis=0)
    return out


def dry_run_lengths(p):
    dry = p < WET
    run = np.zeros(p.shape, np.int16)
    cur = np.zeros(p.shape[1:], np.int16)
    for t in range(p.shape[0]):
        cur = np.where(dry[t], cur + 1, 0)
        run[t] = cur
    return run


def flags_for(pr, tx, tn, mon, th):
    """Daily boolean flags given thresholds th (dict of per-month / per-cell arrays)."""
    m = mon - 1
    hot = tx > th["tx90"][m]
    hotn = tn > th["tn90"][m]
    p30 = trailing_sum(pr, ROLL)
    dry30 = p30 < th["p30_10"][m]
    run = dry_run_lengths(pr)
    long_dry = run >= DRY_SPELL
    recent = np.zeros_like(long_dry)
    for k in range(1, LAG + 1):
        recent[k:] |= long_dry[:-k]
    heavy = pr > th["p95wet"][None]
    return {"hot_dry": hot & dry30, "hot_night": hot & hotn, "whiplash": heavy & recent}


def season_counts(flags, yrs, mon, y0, y1):
    """Mean days per year for each flag and season over y0..y1 -> {f_season: [r, lon]}."""
    sel = (yrs >= y0) & (yrs <= y1)
    n_years = y1 - y0 + 1
    out = {}
    for f, a in flags.items():
        for s, months in SEASONS.items():
            ms = sel & np.isin(mon, months)
            out[f"{f}_{s}"] = a[ms].sum(0) / n_years
    return out


def run_model(model, states, districts):
    d = MODELS_DIR / model
    files = {v: (d / v / "historical_DBCCA.nc", d / v / "ssp245_DBCCA.nc") for v in ("pr", "tasmax", "tasmin")}
    ds = netCDF4.Dataset(files["pr"][0])
    lat, lon = ds["lat"][:], ds["lon"][:]
    ds.close()
    labels = [f"{f}_{s}" for f in FLAGS for s in SEASONS]
    fields = {w: {k: np.full((len(lat), len(lon)), np.nan, np.float32) for k in labels} for w in ["base"] + list(WINDOWS)}

    for r0 in range(0, len(lat), CHUNK):
        rows = slice(r0, min(r0 + CHUNK, len(lat)))
        # baseline incl. one prior year for the 30-day trailing sum and dry runs
        hp, hy, hm = read_period(files["pr"][0], "pr", BASE[0] - 1, BASE[1], rows)
        hx, _, _ = read_period(files["tasmax"][0], "tasmax", BASE[0] - 1, BASE[1], rows)
        hn, _, _ = read_period(files["tasmin"][0], "tasmin", BASE[0] - 1, BASE[1], rows)
        if np.nanmean(hx) > 200:
            hx, hn = hx - 273.15, hn - 273.15
        inb = hy >= BASE[0]
        th = {"tx90": np.stack([np.nanpercentile(hx[inb & (hm == m)], 90, axis=0) for m in range(1, 13)]),
              "tn90": np.stack([np.nanpercentile(hn[inb & (hm == m)], 90, axis=0) for m in range(1, 13)])}
        hp30 = trailing_sum(hp, ROLL)
        th["p30_10"] = np.stack([np.nanpercentile(hp30[inb & (hm == m)], 10, axis=0) for m in range(1, 13)])
        wet = np.where(hp[inb] >= WET, hp[inb], np.nan)
        th["p95wet"] = np.nanpercentile(wet, 95, axis=0)
        fl = flags_for(hp, hx, hn, hm, th)
        for k, v in season_counts(fl, hy, hm, *BASE).items():
            fields["base"][k][rows] = v
        del hp, hx, hn, fl, hp30, wet

        fp, fy, fm = read_period(files["pr"][1], "pr", FUT[0] - 1, FUT[1], rows)
        fx, _, _ = read_period(files["tasmax"][1], "tasmax", FUT[0] - 1, FUT[1], rows)
        fn, _, _ = read_period(files["tasmin"][1], "tasmin", FUT[0] - 1, FUT[1], rows)
        if np.nanmean(fx) > 200:
            fx, fn = fx - 273.15, fn - 273.15
        fl = flags_for(fp, fx, fn, fm, th)
        for w, (a, b) in WINDOWS.items():
            for k, v in season_counts(fl, fy, fm, a, b).items():
                fields[w][k][rows] = v
        del fp, fx, fn, fl
        print(f"   rows {r0}–{rows.stop}", flush=True)

    out = []
    for kind, gdf in (("state", states), ("district", districts)):
        mask = agg.build_mask(gdf, lon, lat).values
        for i, row in gdf.iterrows():
            sel = mask == i
            if not sel.any():
                continue
            for k in labels:
                rec = {"model": model, "admin": f"{kind}:{row['_id']}", "name": row["_name"], "indicator": k,
                       "base": float(np.nanmean(fields["base"][k][sel]))}
                for w in WINDOWS:
                    rec[f"ssp245_{w}"] = float(np.nanmean(fields[w][k][sel]))
                out.append(rec)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(out).to_csv(OUT_DIR / f"{model}.csv", index=False)
    print(f"   wrote {model}.csv", flush=True)


def main():
    states, districts = agg.load_states(), agg.load_districts()
    for m in sys.argv[1:] or MODELS:
        if (OUT_DIR / f"{m}.csv").exists():
            print(f"skip {m} (done)")
            continue
        print(f"== {m}", flush=True)
        run_model(m, states, districts)


if __name__ == "__main__":
    main()
