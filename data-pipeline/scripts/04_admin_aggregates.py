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
from tqdm import tqdm

warnings.filterwarnings("ignore")

from hazard_common import INDICATORS, PERIODS, SSPS, load_2d

# ── Paths ────────────────────────────────────────────────────────────────────
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
    _, lats, lons = load_2d("heat_stress_35", "historical")

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
        data, _, _ = load_2d(ind, "historical")
        if data is not None:
            fill_all_regions(state_out,    states,    "state",    "_id", state_mask,    data, ind, "historical", None)
            fill_all_regions(district_out, districts, "district", "_id", district_mask, data, ind, "historical", None)
        else:
            missing.append(f"{ind} historical")

        # Future
        for ssp in SSPS:
            for period in PERIODS:
                data, _, _ = load_2d(ind, ssp, period)
                if data is not None:
                    fill_all_regions(state_out,    states,    "state",    "_id", state_mask,    data, ind, ssp, period)
                    fill_all_regions(district_out, districts, "district", "_id", district_mask, data, ind, ssp, period)
                else:
                    missing.append(f"{ind} {ssp} {period}")

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
