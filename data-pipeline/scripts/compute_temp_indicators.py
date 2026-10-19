"""
Compute 3 remaining Rama Rao (2020) temperature indicators from raw INDRA-CMIP6
daily tasmax / tasmin data.

New indicators:
  - tmax_mean    : annual mean of daily maximum temperature (°C)
  - tmin_mean    : annual mean of daily minimum temperature (°C)
  - summer_tmean : mean temperature Apr–Jun (°C); proxy for warm-season heat

Units: tasmax/tasmin already in °C (confirmed from raw values).

Run:
  conda run -n ml_trade python compute_temp_indicators.py
"""

import warnings
from pathlib import Path

import netCDF4
import numpy as np
from tqdm import tqdm

warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
TMAX_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/tmax")
TMIN_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/tmin")
OUT_ROOT  = Path("/Volumes/Extreme SSD/FAO_India/ClimateHazards/output")

BASELINE_START = 1976
BASELINE_END   = 2005

PERIOD_WINDOWS = {
    "2047": (2032, 2061),
    "2050": (2035, 2064),
    "2100": (2085, 2100),
}

SSPS = ["SSP126", "SSP245", "SSP370", "SSP585"]

SSP_FILES = {
    "SSP126": {
        "tmax": TMAX_DIR / "tasmax_ens_ssp126.nc",
        "tmin": TMIN_DIR / "tasmin_ens_ssp126.nc",
    },
    "SSP245": {
        "tmax": TMAX_DIR / "tasmax_ens_ssp245.nc",
        "tmin": TMIN_DIR / "tasmin_ens_ssp245.nc",
    },
    "SSP370": {
        "tmax": TMAX_DIR / "tasmax_ens_ssp370.nc",
        "tmin": TMIN_DIR / "tasmin_ens_ssp370.nc",
    },
    "SSP585": {
        "tmax": TMAX_DIR / "tasmax_ens_ssp585.nc",
        "tmin": TMIN_DIR / "tasmin_ens_ssp585.nc",
    },
}

HIST_FILES = {
    "tmax": TMAX_DIR / "tasmax_ens_historical.nc",
    "tmin": TMIN_DIR / "tasmin_ens_historical.nc",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_dates(nc_path):
    ds = netCDF4.Dataset(nc_path)
    times = netCDF4.num2date(
        ds.variables["time"][:],
        ds.variables["time"].units,
        calendar=getattr(ds.variables["time"], "calendar", "standard"),
    )
    return ds, np.array(times)


def compute_temp_indicators(ds_tmax, dates_tmax, ds_tmin, dates_tmin, year_start, year_end):
    """
    Returns dict: {indicator_name: 2d array (lat × lon)}
    """
    tmax_var = ds_tmax.variables["tasmax"]
    tmin_var = ds_tmin.variables["tasmin"]
    lats = ds_tmax.variables["lat"][:]
    lons = ds_tmax.variables["lon"][:]
    ny, nx = len(lats), len(lons)

    years = sorted(set(
        d.year for d in dates_tmax
        if year_start <= d.year <= year_end
    ))
    if not years:
        return None

    acc = {
        "tmax_mean":    np.zeros((ny, nx), dtype=np.float64),
        "tmin_mean":    np.zeros((ny, nx), dtype=np.float64),
        "summer_tmean": np.zeros((ny, nx), dtype=np.float64),
    }
    counts = {k: 0 for k in acc}

    for yr in tqdm(years, desc=f"  years {year_start}-{year_end}", leave=False):
        # tmax
        idx_mx = np.where([d.year == yr for d in dates_tmax])[0]
        if len(idx_mx) < 50:
            continue
        tmax_yr = tmax_var[idx_mx[0]:idx_mx[-1]+1, :, :]

        # tmin (same calendar, same years)
        idx_mn = np.where([d.year == yr for d in dates_tmin])[0]
        if len(idx_mn) < 50:
            continue
        tmin_yr = tmin_var[idx_mn[0]:idx_mn[-1]+1, :, :]

        months_mx = np.array([dates_tmax[i].month for i in idx_mx])
        months_mn = np.array([dates_tmin[i].month for i in idx_mn])

        # Annual mean Tmax
        acc["tmax_mean"] += tmax_yr.mean(axis=0)
        counts["tmax_mean"] += 1

        # Annual mean Tmin
        acc["tmin_mean"] += tmin_yr.mean(axis=0)
        counts["tmin_mean"] += 1

        # Summer (Apr–Jun) mean temperature: (Tmax + Tmin) / 2, months 4-6
        summer_mx = tmax_yr[np.isin(months_mx, [4, 5, 6])]
        summer_mn = tmin_yr[np.isin(months_mn, [4, 5, 6])]
        if len(summer_mx) > 0 and len(summer_mn) > 0:
            n = min(len(summer_mx), len(summer_mn))
            tmean_summer = (summer_mx[:n] + summer_mn[:n]) / 2.0
            acc["summer_tmean"] += tmean_summer.mean(axis=0)
            counts["summer_tmean"] += 1

    result = {}
    for k in acc:
        if counts[k] > 0:
            result[k] = (acc[k] / counts[k]).astype(np.float32)
        else:
            result[k] = np.full((ny, nx), np.nan, dtype=np.float32)

    return result, lats, lons


def write_nc(out_path, data, lats, lons, indicator, description):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ds_out = netCDF4.Dataset(out_path, "w")
    ds_out.createDimension("lat", len(lats))
    ds_out.createDimension("lon", len(lons))
    lat_v = ds_out.createVariable("lat", "f4", ("lat",))
    lon_v = ds_out.createVariable("lon", "f4", ("lon",))
    lat_v[:] = lats
    lon_v[:] = lons
    v = ds_out.createVariable(indicator, "f4", ("lat", "lon"),
                               fill_value=np.nan, zlib=True, complevel=4)
    v[:] = data
    v.description = description
    v.units = "degC"
    ds_out.close()


# ── Main ──────────────────────────────────────────────────────────────────────

DESCRIPTIONS = {
    "tmax_mean":    "Annual mean of daily maximum temperature (°C)",
    "tmin_mean":    "Annual mean of daily minimum temperature (°C)",
    "summer_tmean": "Mean temperature Apr–Jun (°C); (Tmax+Tmin)/2",
}

NEW_INDICATORS = ["tmax_mean", "tmin_mean", "summer_tmean"]


def main():
    # ── Historical baseline ────────────────────────────────────────────────────
    print(f"\nHistorical ({BASELINE_START}-{BASELINE_END})...")
    ds_tmax_h, dates_tmax_h = load_dates(HIST_FILES["tmax"])
    ds_tmin_h, dates_tmin_h = load_dates(HIST_FILES["tmin"])
    hist_res, lats, lons = compute_temp_indicators(
        ds_tmax_h, dates_tmax_h, ds_tmin_h, dates_tmin_h,
        BASELINE_START, BASELINE_END
    )
    ds_tmax_h.close()
    ds_tmin_h.close()

    for ind in NEW_INDICATORS:
        out_path = OUT_ROOT / "historical" / f"{ind}_historical.nc"
        write_nc(out_path, hist_res[ind], lats, lons, ind, DESCRIPTIONS[ind])
        print(f"  Written: {out_path.name}")

    # ── Future SSPs ────────────────────────────────────────────────────────────
    for ssp in SSPS:
        print(f"\n{ssp}...")
        ds_tmax_s, dates_tmax_s = load_dates(SSP_FILES[ssp]["tmax"])
        ds_tmin_s, dates_tmin_s = load_dates(SSP_FILES[ssp]["tmin"])

        for period_label, (yr_start, yr_end) in PERIOD_WINDOWS.items():
            print(f"  Period {period_label} ({yr_start}-{yr_end})")
            fut_res, _, _ = compute_temp_indicators(
                ds_tmax_s, dates_tmax_s, ds_tmin_s, dates_tmin_s,
                yr_start, yr_end
            )

            for ind in NEW_INDICATORS:
                # Absolute
                out_abs = OUT_ROOT / ssp / f"{ind}_{ssp}_{period_label}.nc"
                write_nc(out_abs, fut_res[ind], lats, lons, ind,
                         f"{DESCRIPTIONS[ind]} — {ssp} {period_label}")

                # Delta (°C change — meaningful for temperature)
                delta = fut_res[ind] - hist_res[ind]
                out_delta = OUT_ROOT / ssp / f"{ind}_delta_{ssp}_{period_label}.nc"
                write_nc(out_delta, delta, lats, lons, ind,
                         f"Change in {ind}: {ssp} {period_label} minus historical")

                # Pct change (less meaningful for temperature but kept for consistency)
                with np.errstate(divide="ignore", invalid="ignore"):
                    pct = np.where(
                        np.abs(hist_res[ind]) > 0.1,
                        (delta / hist_res[ind]) * 100.0,
                        np.nan,
                    ).astype(np.float32)
                out_pct = OUT_ROOT / ssp / f"{ind}_pct_change_{ssp}_{period_label}.nc"
                write_nc(out_pct, pct, lats, lons, ind,
                         f"% change in {ind}: {ssp} {period_label} vs historical")

                print(f"    {ind}: abs, delta, pct written")

        ds_tmax_s.close()
        ds_tmin_s.close()

    print("\nDone.")


if __name__ == "__main__":
    main()
