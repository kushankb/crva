"""
Rama Rao (2020) future-hazard indicators that need daily data, from INDRA-CMIP6
ensemble-mean daily files. Writes absolute window means as NetCDFs alongside the
other ClimateHazards outputs, so hazard_common / 04 / 05 pick them up.

  rr_rainy_days  days with rain >= 2.5 mm per year                      (exact)
  rr_dryspell    Jun–Oct dry-spell score: sum exp(min(L,42)/14 - 1) over
                 spells of >= 14 days with rain < 2.5 mm, per year      (exact)
  rr_p99         mean of annual 99th percentile of daily rain (mm)
  rr_rx1_pct     annual max 1-day rain as % of baseline annual normal
  rr_rx3_pct     annual max 3-day rain as % of baseline annual normal
  rr_hot_days    Mar–May days with Tmax >= normal + 2 SD               (scaled)
  rr_cold_days   Dec–Feb days with Tmin <= normal - 2 SD               (scaled)

The Atlas uses ±4 °C for hot/cold days. Ensemble-mean daily anomalies have an SD
of ~0.6 °C, so ±4 °C never occurs; ±2 SD keeps the same "unusual" intent.
Normal and SD come from the 1985–2014 baseline for every period.

Run:
  conda run -n ml_trade python compute_rr_extremes.py
"""
from pathlib import Path

import netCDF4
import numpy as np
from scipy.ndimage import uniform_filter1d

D = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri")
OUT = Path("/Volumes/Extreme SSD/FAO_India/ClimateHazards/output")
FILES = {
    "pr":     {"historical": D / "pr/pr_ens_historical.nc",       **{s: D / f"pr/pr_ens_{s.lower()}.nc" for s in ["SSP126", "SSP245", "SSP370", "SSP585"]}},
    "tasmax": {"historical": D / "tmax/tasmax_ens_historical.nc", **{s: D / f"tmax/tasmax_ens_{s.lower()}.nc" for s in ["SSP126", "SSP245", "SSP370", "SSP585"]}},
    "tasmin": {"historical": D / "tmin/tasmin_ens_historical.nc", **{s: D / f"tmin/tasmin_ens_{s.lower()}.nc" for s in ["SSP126", "SSP245", "SSP370", "SSP585"]}},
}
BASE = (1985, 2014)
WINDOWS = {"2047": (2033, 2062), "2050": (2036, 2065), "2100": (2071, 2100)}
SSPS = ["SSP126", "SSP245", "SSP370", "SSP585"]
WET = 2.5
SD_K = 2.0

# noleap calendar: day-of-year index → month
MONTH = np.repeat(np.arange(1, 13), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])


def open_var(var, scen):
    ds = netCDF4.Dataset(FILES[var][scen])
    t = ds["time"]
    years = np.array([d.year for d in netCDF4.num2date(t[:], t.units, calendar="noleap")])
    return ds, ds[var], years, ds["lat"][:], ds["lon"][:]


def year_block(v, years, y):
    idx = np.where(years == y)[0]
    a = np.asarray(v[idx[0]:idx[-1] + 1], dtype=np.float32)
    return a if a.shape[0] == 365 else None


def dryspell_score(pr_year):
    d = pr_year[(MONTH >= 6) & (MONTH <= 10)] < WET
    run = np.zeros(d.shape[1:], np.float32)
    score = np.zeros(d.shape[1:], np.float32)
    for t in range(d.shape[0] + 1):
        dry = d[t] if t < d.shape[0] else np.zeros_like(d[0])
        ended = ~dry & (run >= 14)
        score += np.where(ended, np.exp(np.minimum(run, 42) / 14 - 1), 0)
        run = np.where(dry, run + 1, 0)
    return score


def climatology(var, years_rng, smooth=31):
    ds, v, years, _, _ = open_var(var, "historical")
    s = None
    n = 0
    for y in range(years_rng[0], years_rng[1] + 1):
        a = year_block(v, years, y)
        s = a.astype(np.float64) if s is None else s + a
        n += 1
    normal = uniform_filter1d((s / n).astype(np.float32), smooth, axis=0, mode="wrap")
    ss = np.zeros(normal.shape[1:], np.float64)
    cnt = 0
    months = [3, 4, 5] if var == "tasmax" else [12, 1, 2]
    sel = np.isin(MONTH, months)
    for y in range(years_rng[0], years_rng[1] + 1):
        an = year_block(v, years, y)[sel] - normal[sel]
        ss += (an.astype(np.float64) ** 2).sum(0)
        cnt += an.shape[0]
    ds.close()
    return normal, np.sqrt(ss / cnt).astype(np.float32)


def annual_series(scen, yr0, yr1, normals, annual_normal):
    """Return {indicator: {year: 2d}} for years in [yr0, yr1]."""
    out = {k: {} for k in ["rr_rainy_days", "rr_dryspell", "rr_p99", "rr_rx1_pct", "rr_rx3_pct", "rr_hot_days", "rr_cold_days"]}
    dsp, vp, yp, lat, lon = open_var("pr", scen)
    dsx, vx, yx, _, _ = open_var("tasmax", scen)
    dsn, vn, yn, _, _ = open_var("tasmin", scen)
    (nx, sdx), (nn, sdn) = normals["tasmax"], normals["tasmin"]
    mam, djf = np.isin(MONTH, [3, 4, 5]), np.isin(MONTH, [12, 1, 2])
    for y in range(yr0, yr1 + 1):
        p = year_block(vp, yp, y)
        if p is None:
            continue
        out["rr_rainy_days"][y] = (p >= WET).sum(0).astype(np.float32)
        out["rr_dryspell"][y] = dryspell_score(p)
        out["rr_p99"][y] = np.percentile(p, 99, axis=0).astype(np.float32)
        out["rr_rx1_pct"][y] = p.max(0) / annual_normal * 100
        r3 = p[:-2] + p[1:-1] + p[2:]
        out["rr_rx3_pct"][y] = r3.max(0) / annual_normal * 100
        tx = year_block(vx, yx, y)
        out["rr_hot_days"][y] = ((tx[mam] - nx[mam]) >= SD_K * sdx).sum(0).astype(np.float32)
        tn = year_block(vn, yn, y)
        out["rr_cold_days"][y] = ((tn[djf] - nn[djf]) <= -SD_K * sdn).sum(0).astype(np.float32)
        print(f"    {scen} {y}", flush=True)
    for ds in (dsp, dsx, dsn):
        ds.close()
    return out, lat, lon


def write(path, data, lat, lon, name):
    path.parent.mkdir(parents=True, exist_ok=True)
    ds = netCDF4.Dataset(path, "w")
    ds.createDimension("lat", len(lat))
    ds.createDimension("lon", len(lon))
    ds.createVariable("lat", "f4", ("lat",))[:] = lat
    ds.createVariable("lon", "f4", ("lon",))[:] = lon
    v = ds.createVariable(name, "f4", ("lat", "lon"), fill_value=np.nan, zlib=True, complevel=4)
    v[:] = data
    ds.close()


def window_means(series, lat, lon, scen, windows):
    with np.errstate(invalid="ignore", divide="ignore"):
        for name, by_year in series.items():
            for label, (a, b) in windows.items():
                arr = np.nanmean(np.stack([by_year[y] for y in range(a, b + 1) if y in by_year]), 0)
                if label == "historical":
                    write(OUT / "historical" / f"{name}_historical.nc", arr, lat, lon, name)
                else:
                    write(OUT / scen / f"{name}_{scen}_{label}.nc", arr, lat, lon, name)


def main():
    print("Baseline climatology...", flush=True)
    normals = {v: climatology(v, BASE) for v in ("tasmax", "tasmin")}
    ds, v, years, _, _ = open_var("pr", "historical")
    annual_normal = np.mean([year_block(v, years, y).sum(0) for y in range(BASE[0], BASE[1] + 1)], 0)
    annual_normal = np.where(annual_normal > 0, annual_normal, np.nan).astype(np.float32)
    ds.close()

    print("Historical...", flush=True)
    s, lat, lon = annual_series("historical", *BASE, normals, annual_normal)
    window_means(s, lat, lon, "historical", {"historical": BASE})

    for scen in SSPS:
        print(f"{scen}...", flush=True)
        s, lat, lon = annual_series(scen, 2033, 2100, normals, annual_normal)
        window_means(s, lat, lon, scen, WINDOWS)
    print("Done.")


if __name__ == "__main__":
    main()
