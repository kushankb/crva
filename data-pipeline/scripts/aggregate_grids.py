"""
Average gridded model indicators (09_model_indicators.py, 13_compound_extremes.py)
over districts and states, writing the CSV tables the rest of the pipeline reads.

  grids/{model}_rr.nc        -> model_indicators/{model}.csv
  grids/{model}_compound.nc  -> model_indicators/compound/{model}.csv
Columns: model, admin, name, indicator, base, ssp245_2047, ssp245_2050, ssp245_2100

Run in the env with geopandas and regionmask (ml_trade):
  conda run -n ml_trade python aggregate_grids.py [--out-suffix _xr] [MODEL ...]
"""
import importlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

sys.path.insert(0, str(Path(__file__).parent))
agg = importlib.import_module("04_admin_aggregates")

MI = Path(__file__).parents[1] / "model_indicators"
GRIDS = MI / "grids"
WINDOWS = ["base", "2047", "2050", "2100"]


def aggregate(nc, states, districts):
    ds = xr.open_dataset(nc)
    lat, lon = ds["lat"].values, ds["lon"].values
    rows = []
    for kind, gdf in (("state", states), ("district", districts)):
        mask = agg.build_mask(gdf, lon, lat).values
        for i, row in gdf.iterrows():
            sel = mask == i
            if not sel.any():
                continue
            for v in ds.data_vars:
                vals = ds[v].values
                rec = {"model": ds.attrs["model"], "admin": f"{kind}:{row['_id']}", "name": row["_name"], "indicator": v}
                for j, w in enumerate(WINDOWS):
                    rec["base" if w == "base" else f"ssp245_{w}"] = float(np.nanmean(vals[j][sel]))
                rows.append(rec)
    return pd.DataFrame(rows)


def main():
    args = sys.argv[1:]
    suffix = ""
    if "--out-suffix" in args:
        k = args.index("--out-suffix")
        suffix = args[k + 1]
        args = args[:k] + args[k + 2:]
    states, districts = agg.load_states(), agg.load_districts()
    for nc in sorted(GRIDS.glob("*.nc")):
        model, kind = nc.stem.rsplit("_", 1)
        if args and model not in args:
            continue
        out_dir = (MI if kind == "rr" else MI / "compound").with_name(((MI if kind == "rr" else MI / "compound").name) + suffix)
        out_dir.mkdir(parents=True, exist_ok=True)
        df = aggregate(nc, states, districts)
        df.to_csv(out_dir / f"{model}.csv", index=False)
        print(f"{nc.name} -> {out_dir.name}/{model}.csv ({len(df)} rows)", flush=True)


if __name__ == "__main__":
    main()
