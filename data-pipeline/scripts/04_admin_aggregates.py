"""
Step 4: Precompute state and district-level aggregates from NetCDF outputs.

Uses regionmask (standard climate-science library) to build pixel-to-polygon
masks directly on the NC lat/lon grid — no spatial join, no point-in-polygon
lookups. The mask is built once per admin level, then reused across all NC files.

This is both faster and more rigorous than the centroid approach:
  - State mask: ~0.09s | District mask: ~0.5s | Per-NC aggregation: ~5ms
  - Full run: < 2 minutes total

Run:
  conda run -n ml_trade python 04_admin_aggregates.py
"""

import json
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import regionmask
import xarray as xr
from tqdm import tqdm

warnings.filterwarnings("ignore")

# ── Paths ────────────────────────────────────────────────────────────────────
NC_ROOT  = Path("/Volumes/Extreme SSD/FAO_India/ClimateHazards/output")
WEB_DATA = Path(__file__).parents[2] / "web" / "public" / "data"

BOUNDARY_DIR = Path(
    "/Users/kushankbajaj/Library/CloudStorage"
    "/OneDriveFileProvider-FoodandAgricultureOrganization"
    "/India_NITIAayog_KB/Data/AgricultureStatistics/MoAFW"
    "/Nupoor/Data4MIRA/State_District_ADMBoundaries"
)
STATES_SHP    = BOUNDARY_DIR / "STATE_BOUNDARY.shp"
DISTRICTS_SHP = BOUNDARY_DIR / "DISTRICT_BOUNDARY.shp"
OUT_JSON      = WEB_DATA / "admin_stats.json"

SSPS    = ["SSP126", "SSP245", "SSP370", "SSP585"]
PERIODS = ["2047", "2050", "2100"]

SPI_INDICATORS     = {"spi3", "spei3"}
SPI_DROUGHT_THRESH = -1.0
KELVIN_INDICATORS  = {"tmean", "rabi_tmax"}

INDICATORS = [
    "heat_stress_35", "heat_stress_40", "tropical_nights", "heatwave_days",
    "wsdi", "heat_fatal_45", "cdd_energy", "tmean", "rabi_tmax",
    "frost_days", "csdi", "hdd",
    "prcptot", "rx1day", "rx5day", "r20mm", "r10mm", "r1mm", "cwd", "kharif_precip",
    "cdd", "spi3", "spei3",
    "gdd_10", "gdd_38", "monsoon_onset", "dtr", "etr",
    # Previously computed but excluded — now included
    "r99ptot", "r95ptot", "tn90p", "tx10p", "gsl",
    # New Rama Rao indicators computed from raw daily pr
    "june_precip", "july_precip", "rx3day", "r100mm3d",
]

# ── Boundary loading ──────────────────────────────────────────────────────────

def load_states():
    gdf = gpd.read_file(str(STATES_SHP)).to_crs("EPSG:4326")
    gdf = gdf.reset_index(drop=True)
    gdf["_id"]   = gdf["OBJECTID"].astype(str)
    gdf["_name"] = gdf["STATE"].str.title()
    return gdf

def load_districts():
    gdf = gpd.read_file(str(DISTRICTS_SHP)).to_crs("EPSG:4326")
    gdf = gdf.reset_index(drop=True)

    def dist_id(row):
        lgd = str(row["DIST_LGD"]).strip()
        return lgd if lgd.upper() not in ("NOT AVAILABLE", "NAN", "") else f"name:{row['DISTRICT']}"

    gdf["_id"]         = gdf.apply(dist_id, axis=1)
    gdf["_name"]       = gdf["DISTRICT"].str.title()
    gdf["_state_name"] = gdf["STATE_UT"].str.title()
    return gdf

# ── NC normalisation ──────────────────────────────────────────────────────────

def nc_to_2d(nc_path: Path, indicator: str):
    """Load NC → 2D numpy array (lat × lon), or None if file missing."""
    if not nc_path.exists():
        return None, None, None

    ds = xr.open_dataset(nc_path, mask_and_scale=True)
    coord_names = {"time", "lat", "lon", "percentiles",
                   "number_of_zeros", "number_of_notnull", "prob_of_zero"}
    candidates = [v for v in ds.data_vars if v not in coord_names]
    var = indicator if indicator in ds.data_vars else (candidates[0] if candidates else None)
    if var is None:
        return None, None, None

    data = ds[var].values.astype(np.float32)
    lats = ds["lat"].values
    lons = ds["lon"].values

    # Normalise to 2D — mirrors 01_nc_to_geojson.py
    if data.ndim == 4:
        data = np.nanmean(data, axis=0)
    if data.ndim == 3:
        if data.shape[0] == len(lats) and data.shape[1] == len(lons):
            # (lat, lon, percentiles) — pick middle slice
            data = data[:, :, data.shape[2] // 2]
        elif indicator in SPI_INDICATORS:
            data = (data < SPI_DROUGHT_THRESH).mean(axis=0) * 100.0
        else:
            data = np.nanmean(data, axis=0)

    if indicator in KELVIN_INDICATORS:
        data = data - 273.15

    return data.astype(np.float32), lats, lons

# ── Aggregation ───────────────────────────────────────────────────────────────

def build_mask(gdf, lons, lats):
    """Build regionmask 2D integer mask (row index = gdf.iloc index)."""
    return regionmask.mask_geopandas(gdf, lons, lats)

def agg_region(data, mask_vals, region_idx):
    """Extract pixels for region_idx and return {mean, p10, p90}."""
    vals = data[mask_vals == region_idx]
    vals = vals[np.isfinite(vals)]
    if len(vals) == 0:
        return {"mean": None, "p10": None, "p90": None}
    return {
        "mean": round(float(vals.mean()), 3),
        "p10":  round(float(np.percentile(vals, 10)), 3),
        "p90":  round(float(np.percentile(vals, 90)), 3),
    }

def fill_all_regions(out, gdf, admin_type, id_col, mask, data, indicator, scenario, period):
    mask_vals = mask.values
    for i, row in gdf.iterrows():
        key = f"{admin_type}:{row[id_col]}"
        if key not in out:
            continue
        out[key].setdefault(indicator, {})
        sd = agg_region(data, mask_vals, i)
        if scenario == "historical":
            out[key][indicator]["historical"] = sd
        else:
            out[key][indicator].setdefault(scenario, {})
            out[key][indicator][scenario][period] = sd

# ── Skeleton builders ─────────────────────────────────────────────────────────

def build_state_skeleton(gdf):
    return {
        f"state:{row['_id']}": {"name": row["_name"], "type": "state"}
        for _, row in gdf.iterrows()
    }

def build_district_skeleton(gdf):
    return {
        f"district:{row['_id']}": {
            "name": row["_name"],
            "type": "district",
            "state_name": row["_state_name"],
        }
        for _, row in gdf.iterrows()
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Load boundaries
    print("Loading boundaries...")
    states    = load_states()
    districts = load_districts()
    print(f"  States: {len(states)}  Districts: {len(districts)}")

    # Get lat/lon grid from reference NC
    ref_nc = NC_ROOT / "historical" / "heat_stress_35_historical.nc"
    ds_ref = xr.open_dataset(ref_nc, mask_and_scale=True)
    lons = ds_ref["lon"].values
    lats = ds_ref["lat"].values

    # Build masks once
    print("Building regionmask masks...")
    state_mask    = build_mask(states,    lons, lats)
    district_mask = build_mask(districts, lons, lats)
    print(f"  State mask: {state_mask.shape}  District mask: {district_mask.shape}")

    # Admin output skeletons
    state_out    = build_state_skeleton(states)
    district_out = build_district_skeleton(districts)

    missing = []

    print("\nProcessing indicators...")
    for ind in tqdm(INDICATORS, desc="Indicators"):
        # Historical
        hist_path = NC_ROOT / "historical" / f"{ind}_historical.nc"
        data, lats_nc, lons_nc = nc_to_2d(hist_path, ind)
        if data is not None:
            fill_all_regions(state_out,    states,    "state",    "_id", state_mask,    data, ind, "historical", None)
            fill_all_regions(district_out, districts, "district", "_id", district_mask, data, ind, "historical", None)
        else:
            missing.append(str(hist_path))

        # Future
        for ssp in SSPS:
            for period in PERIODS:
                nc_path = NC_ROOT / ssp / f"{ind}_{ssp}_{period}.nc"
                data, _, _ = nc_to_2d(nc_path, ind)
                if data is not None:
                    fill_all_regions(state_out,    states,    "state",    "_id", state_mask,    data, ind, ssp, period)
                    fill_all_regions(district_out, districts, "district", "_id", district_mask, data, ind, ssp, period)
                else:
                    missing.append(str(nc_path))

    merged = {**state_out, **district_out}

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(merged, f, allow_nan=False, separators=(",", ":"),
                  default=lambda x: None)

    size_mb = OUT_JSON.stat().st_size / 1e6
    print(f"\nWrote {len(merged)} admin units → {OUT_JSON} ({size_mb:.1f} MB)")
    print(f"  States: {len(state_out)}  Districts: {len(district_out)}")

    if missing:
        print(f"\n{len(missing)} missing NC files (first 10):")
        for p in missing[:10]:
            print(" ", p)
        if len(missing) > 10:
            print(f"  … and {len(missing) - 10} more")


if __name__ == "__main__":
    main()
