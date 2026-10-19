"""
Compute new indicators needed to match Rama Rao et al. (2020) from raw INDRA-CMIP6 daily pr data.

New indicators:
  - june_precip   : total precipitation in June (mm/year average)
  - july_precip   : total precipitation in July (mm/year average)
  - rx3day        : max 3-day accumulated precipitation (mm)
  - r100mm3d      : number of events where 3-day rolling sum > 100 mm

Output NetCDFs written to the same ClimateHazards/output folder structure
so they can be picked up by 04_admin_aggregates.py.

Units: pr in raw files is kg m-2 s-1 → multiply by 86400 to get mm/day.
"""

import warnings
from pathlib import Path

import netCDF4
import numpy as np
from tqdm import tqdm

warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
PR_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/pr")
OUT_ROOT = Path("/Volumes/Extreme SSD/FAO_India/ClimateHazards/output")

# Baseline period for delta computation (match existing pipeline)
BASELINE_START = 1976
BASELINE_END   = 2005

# Future period windows (30-year centred)
PERIOD_WINDOWS = {
    "2047": (2032, 2061),
    "2050": (2035, 2064),
    "2100": (2085, 2100),   # limited by data end
}

SSP_FILES = {
    "SSP126": PR_DIR / "pr_ens_ssp126.nc",
    "SSP245": PR_DIR / "pr_ens_ssp245.nc",
    "SSP370": PR_DIR / "pr_ens_ssp370.nc",
    "SSP585": PR_DIR / "pr_ens_ssp585.nc",
}

HIST_FILE = PR_DIR / "pr_ens_historical.nc"

NEW_INDICATORS = ["june_precip", "july_precip", "rx3day", "r100mm3d"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_dates(nc_path):
    ds = netCDF4.Dataset(nc_path)
    times = netCDF4.num2date(
        ds.variables["time"][:],
        ds.variables["time"].units,
        calendar=getattr(ds.variables["time"], "calendar", "standard"),
    )
    return ds, np.array(times)


def compute_indicators(ds, dates, year_start, year_end):
    """
    For all years in [year_start, year_end], compute annual values of each
    indicator and return the spatial mean across years.

    Returns dict: {indicator_name: 2d array (lat × lon)}
    """
    pr_var = ds.variables["pr"]
    lats   = ds.variables["lat"][:]
    lons   = ds.variables["lon"][:]
    ny, nx = len(lats), len(lons)

    years = sorted(set(
        d.year for d in dates
        if year_start <= d.year <= year_end
    ))
    if not years:
        return None

    # Accumulators: sum over years for final mean
    acc = {k: np.zeros((ny, nx), dtype=np.float64) for k in NEW_INDICATORS}
    counts = {k: 0 for k in NEW_INDICATORS}

    for yr in tqdm(years, desc=f"  years {year_start}-{year_end}", leave=False):
        idx = np.where([d.year == yr for d in dates])[0]
        if len(idx) < 50:  # skip partial years
            continue

        months = np.array([dates[i].month for i in idx])
        pr_year = pr_var[idx[0]:idx[-1]+1, :, :] * 86400.0  # → mm/day

        # June precipitation (month 6)
        jun_mask = months == 6
        if jun_mask.any():
            acc["june_precip"] += pr_year[jun_mask].sum(axis=0)
            counts["june_precip"] += 1

        # July precipitation (month 7)
        jul_mask = months == 7
        if jul_mask.any():
            acc["july_precip"] += pr_year[jul_mask].sum(axis=0)
            counts["july_precip"] += 1

        # 3-day rolling indicators (whole year)
        n_days = pr_year.shape[0]
        if n_days >= 3:
            # Rolling 3-day sum using stride trick
            rx3_year = np.zeros((ny, nx), dtype=np.float64)
            r100_year = np.zeros((ny, nx), dtype=np.float64)
            for d in range(n_days - 2):
                roll3 = pr_year[d:d+3].sum(axis=0)
                rx3_year = np.maximum(rx3_year, roll3)
                r100_year += (roll3 > 100).astype(np.float64)
            acc["rx3day"]   += rx3_year
            acc["r100mm3d"] += r100_year
            counts["rx3day"]   += 1
            counts["r100mm3d"] += 1

    result = {}
    for k in NEW_INDICATORS:
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
    ds_out.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # ── Historical baseline ────────────────────────────────────────────────────
    print(f"\nHistorical ({BASELINE_START}-{BASELINE_END})...")
    ds_hist, dates_hist = load_dates(HIST_FILE)
    hist_res, lats, lons = compute_indicators(ds_hist, dates_hist, BASELINE_START, BASELINE_END)
    ds_hist.close()

    descriptions = {
        "june_precip": "Mean total June precipitation (mm), annual average",
        "july_precip": "Mean total July precipitation (mm), annual average",
        "rx3day":      "Mean annual maximum 3-day accumulated precipitation (mm)",
        "r100mm3d":    "Mean annual count of 3-day events with total > 100 mm",
    }

    for ind in NEW_INDICATORS:
        out_path = OUT_ROOT / "historical" / f"{ind}_historical.nc"
        write_nc(out_path, hist_res[ind], lats, lons, ind, descriptions[ind])
        print(f"  Written: {out_path.name}")

    # ── Future SSPs ────────────────────────────────────────────────────────────
    for ssp, pr_file in SSP_FILES.items():
        print(f"\n{ssp}...")
        ds_ssp, dates_ssp = load_dates(pr_file)

        for period_label, (yr_start, yr_end) in PERIOD_WINDOWS.items():
            print(f"  Period {period_label} ({yr_start}-{yr_end})")
            fut_res, _, _ = compute_indicators(ds_ssp, dates_ssp, yr_start, yr_end)

            for ind in NEW_INDICATORS:
                # Absolute value
                out_abs = OUT_ROOT / ssp / f"{ind}_{ssp}_{period_label}.nc"
                write_nc(out_abs, fut_res[ind], lats, lons, ind,
                         f"{descriptions[ind]} — {ssp} {period_label}")

                # Delta (future - historical)
                delta = fut_res[ind] - hist_res[ind]
                out_delta = OUT_ROOT / ssp / f"{ind}_delta_{ssp}_{period_label}.nc"
                write_nc(out_delta, delta, lats, lons, ind,
                         f"Change in {ind}: {ssp} {period_label} minus historical baseline")

                # Percent change (where historical > 0)
                with np.errstate(divide="ignore", invalid="ignore"):
                    pct = np.where(
                        hist_res[ind] > 0,
                        (delta / hist_res[ind]) * 100.0,
                        np.nan,
                    ).astype(np.float32)
                out_pct = OUT_ROOT / ssp / f"{ind}_pct_change_{ssp}_{period_label}.nc"
                write_nc(out_pct, pct, lats, lons, ind,
                         f"% change in {ind}: {ssp} {period_label} vs historical")

                print(f"    {ind}: abs, delta, pct written")

        ds_ssp.close()

    print("\nDone.")


if __name__ == "__main__":
    main()
