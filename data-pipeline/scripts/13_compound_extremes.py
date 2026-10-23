"""
Compound climate extremes on the 0.1° grid for individual INDRA-CMIP6 models,
with xarray + dask (not part of the aggregate index).

Thresholds from each model's own 1985–2014 baseline, per grid cell:
  Tmax / Tmin 90th percentile, by calendar month
  trailing 30-day rainfall 10th percentile, by calendar month
  wet-day (>= 2.5 mm) daily rainfall 95th percentile

Daily flags, year-round:
  hot_dry    Tmax > p90 and trailing 30-day rainfall < p10
  hot_night  Tmax > p90 and Tmin > p90
  whiplash   rain > wet-day p95 within 5 days after a run of >= 14 days below 2.5 mm

Counted per season (kharif Jun–Oct, rabi Nov–Mar of the calendar year, summer
Apr–May, annual) as days per year, averaged over 1985–2014, 2033–2062 (~2047),
2036–2065 (~2050) and 2071–2100 (~2100).

Run in the conda env that has xclim/xarray/dask (climate_hazards):
  conda run -n climate_hazards python 13_compound_extremes.py [MODEL ...]
Writes data-pipeline/model_indicators/grids/{model}_compound.nc; aggregate with aggregate_grids.py.
"""
import sys
import warnings
from pathlib import Path

import xarray as xr

warnings.filterwarnings("ignore")

MODELS_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/models")
OUT = Path(__file__).parents[1] / "model_indicators" / "grids"
MODELS = ["BCC-CSM2-MR", "GFDL-ESM4", "INM-CM5-0", "MIROC6", "MPI-ESM1-2-LR", "NorESM2-MM"]
WINDOWS = {"base": (1985, 2014), "2047": (2033, 2062), "2050": (2036, 2065), "2100": (2071, 2100)}
SEASONS = {"kharif": [6, 7, 8, 9, 10], "rabi": [11, 12, 1, 2, 3], "summer": [4, 5], "annual": list(range(1, 13))}
WET, DRY_SPELL, LAG, ROLL = 2.5, 14, 5, 30
CHUNKS = {"time": -1, "lat": 25, "lon": -1}


def open_var(model, var):
    files = [MODELS_DIR / model / var / f for f in ("historical_DBCCA.nc", "ssp245_DBCCA.nc")]
    da = xr.open_mfdataset(files, combine="by_coords", chunks=CHUNKS, data_vars="minimal", coords="minimal", compat="override")[var]
    da = da.sel(time=slice("1984-01-01", "2100-12-31"))
    if var != "pr" and float(da.isel(time=0, lat=150, lon=150)) > 200:
        da = da - 273.15
    return da


def base(da):
    a, b = WINDOWS["base"]
    return da.sel(time=slice(f"{a}-01-01", f"{b}-12-31"))


def monthly_threshold(da, q):
    return base(da).groupby("time.month").quantile(q, dim="time").drop_vars("quantile")


def compound(model):
    pr, tx, tn = open_var(model, "pr"), open_var(model, "tasmax"), open_var(model, "tasmin")

    tx90, tn90 = monthly_threshold(tx, 0.9), monthly_threshold(tn, 0.9)
    # Round to 0.01 mm: float32 rolling sums leave tiny negative residues in rainless months,
    # which would otherwise read as "below a 0 mm percentile".
    p30 = pr.rolling(time=ROLL).sum().round(2)
    p30_10 = monthly_threshold(p30, 0.1)
    p95wet = base(pr).where(base(pr) >= WET).quantile(0.95, dim="time").drop_vars("quantile")

    hot = tx.groupby("time.month") > tx90
    hot_night = tn.groupby("time.month") > tn90
    dry30 = p30.groupby("time.month") < p30_10
    long_dry = (pr < WET).rolling(time=DRY_SPELL).sum() >= DRY_SPELL          # 14 dry days ending on that day
    recent = long_dry.rolling(time=LAG).max().shift(time=1).fillna(0).astype(bool)  # ended in the previous 5 days
    flags = {"hot_dry": hot & dry30, "hot_night": hot & hot_night, "whiplash": (pr > p95wet) & recent}

    month = pr.time.dt.month
    out = {}
    for f, flag in flags.items():
        for s, months in SEASONS.items():
            yearly = (flag & month.isin(months)).resample(time="YS").sum().astype("float32")
            out[f"{f}_{s}"] = xr.concat([yearly.sel(time=slice(f"{a}-01-01", f"{b}-12-31")).mean("time") for a, b in WINDOWS.values()], dim="window")
    ds = xr.Dataset(out).assign_coords(window=list(WINDOWS))
    for v in ds.data_vars:
        ds[v].attrs = {"units": "days per year"}
    ds.attrs = {"model": model, "scenario": "SSP2-4.5", "method": "13_compound_extremes.py (xarray, dask); 1985–2014 percentile thresholds"}
    return ds


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for m in sys.argv[1:] or MODELS:
        f = OUT / f"{m}_compound.nc"
        if f.exists():
            print(f"skip {m} (done)")
            continue
        print(f"== {m}", flush=True)
        ds = compound(m)
        ds.to_netcdf(f, encoding={v: {"zlib": True, "complevel": 4} for v in ds.data_vars})
        print(f"   wrote {f.name}", flush=True)


if __name__ == "__main__":
    main()
