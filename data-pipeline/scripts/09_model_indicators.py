"""
Rama Rao (2020) future-hazard indicators on the 0.1° grid for individual
INDRA-CMIP6 models, with xarray + dask, using xclim where an equivalent exists.

  annual rainfall      xclim prcptot
  June / July rainfall monthly totals (xarray)
  rainy days           xclim wetdays, >= 2.5 mm/day
  Tmax, Tmin           xclim tx_mean, tn_mean
  unusually hot days   Mar–May, Tmax >= normal + 4 °C   (normal: 1985–2014 day-of-year mean, 31-day smoothing)
  unusually cold days  Dec–Feb, Tmin <= normal − 4 °C
  frost days           xclim frost_days (Tmin < 0 °C)
  drought proneness    2 × P(severe) + P(moderate) from annual-rainfall deficit vs the 1985–2014 normal (% of years)
  dry-spell score      Jun–Oct spells >= 14 days below 2.5 mm: sum of exp(min(L, 42)/14 − 1)   (xclim run-length encoding)
  99th-pct daily rain  annual quantile
  events > 100 mm/3 d  distinct runs of 3-day totals above 100 mm
  Rx1 / Rx3 % normal   xclim max_n_day_precipitation_amount ÷ 1985–2014 annual normal

Run in the conda env that has xclim (climate_hazards):
  conda run -n climate_hazards python 09_model_indicators.py [MODEL ...]
Writes data-pipeline/model_indicators/grids/{model}_rr.nc (dims: window, lat, lon).
Then aggregate to districts and states with aggregate_grids.py (ml_trade env).
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import xarray as xr
import xclim.indices as xi
from xclim.indices.run_length import rle

warnings.filterwarnings("ignore")
xr.set_options(keep_attrs=True)

MODELS_DIR = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri/models")
OUT = Path(__file__).parents[1] / "model_indicators" / "grids"
MODELS = ["BCC-CSM2-MR", "GFDL-ESM4", "INM-CM5-0", "MIROC6", "MPI-ESM1-2-LR", "NorESM2-MM"]
WINDOWS = {"base": (1985, 2014), "2047": (2033, 2062), "2050": (2036, 2065), "2100": (2071, 2100)}
WET = "2.5 mm/day"
CHUNKS = {"time": -1, "lat": 25, "lon": -1}


def open_var(model, var):
    files = [MODELS_DIR / model / var / f for f in ("historical_DBCCA.nc", "ssp245_DBCCA.nc")]
    da = xr.open_mfdataset(files, combine="by_coords", chunks=CHUNKS, data_vars="minimal", coords="minimal", compat="override")[var]
    da = da.sel(time=slice("1984-01-01", "2100-12-31"))
    if var == "pr":
        da.attrs["units"] = "mm/day"
    else:
        da.attrs["units"] = "degC" if float(da.isel(time=0, lat=150, lon=150)) < 200 else "K"
    return da


def years(da, a, b):
    return da.sel(time=slice(f"{a}-01-01", f"{b}-12-31"))


def smoothed_normal(da):
    clim = years(da, *WINDOWS["base"]).groupby("time.dayofyear").mean()
    # circular 31-day running mean
    padded = xr.concat([clim.isel(dayofyear=slice(-15, None)), clim, clim.isel(dayofyear=slice(0, 15))], dim="dayofyear")
    return padded.rolling(dayofyear=31, center=True).mean().isel(dayofyear=slice(15, -15))


def dry_spell_score(pr):
    """Jun–Oct runs of >= 14 dry days (< 2.5 mm); runs are cut at the season edges."""
    jjaso = pr.time.dt.month.isin([6, 7, 8, 9, 10])
    dry = (pr < 2.5) & jjaso
    runs = rle(dry, dim="time", index="first")          # run length at each run's first day, NaN elsewhere
    score = xr.where(runs >= 14, np.exp(np.minimum(runs, 42) / 14 - 1), 0.0)
    return score.resample(time="YS").sum()


def distinct_events(pr, thresh=100.0, window=3):
    r = pr.rolling(time=window).sum()                   # total of the 3 days ending on each day
    wet = r > thresh
    starts = wet & ~wet.shift(time=1, fill_value=False)
    return starts.resample(time="YS").sum()


def model_indicators(model):
    pr, tx, tn = open_var(model, "pr"), open_var(model, "tasmax"), open_var(model, "tasmin")
    if tx.attrs["units"] == "K":
        tx, tn = tx - 273.15, tn - 273.15
        tx.attrs["units"] = tn.attrs["units"] = "degC"

    ann = xi.prcptot(pr, freq="YS")
    normal_rain = years(ann, *WINDOWS["base"]).mean("time")
    nx, nn = smoothed_normal(tx), smoothed_normal(tn)
    ax = tx.groupby("time.dayofyear") - nx
    an = tn.groupby("time.dayofyear") - nn
    month = pr.time.dt.month

    yearly = {
        "annual_rain": ann,
        "june_rain": pr.where(month == 6).resample(time="YS").sum(),
        "july_rain": pr.where(month == 7).resample(time="YS").sum(),
        "rainy_days": xi.wetdays(pr, thresh=WET, freq="YS"),
        "tmax": xi.tx_mean(tx, freq="YS"),
        "tmin": xi.tn_mean(tn, freq="YS"),
        "hot_days": ((ax >= 4) & month.isin([3, 4, 5])).resample(time="YS").sum(),
        "cold_days": ((an <= -4) & month.isin([12, 1, 2])).resample(time="YS").sum(),
        "frost": xi.frost_days(tn, thresh="0 degC", freq="YS"),
        "dry_spells": dry_spell_score(pr),
        "p99_rain": pr.resample(time="YS").quantile(0.99, dim="time").drop_vars("quantile", errors="ignore"),
        "events_100mm": distinct_events(pr),
        "rx1_pct": xi.max_n_day_precipitation_amount(pr, window=1, freq="YS") / normal_rain * 100,
        "rx3_pct": xi.max_n_day_precipitation_amount(pr, window=3, freq="YS") / normal_rain * 100,
    }

    out = {}
    for name, da in yearly.items():
        da = da.astype("float32")
        out[name] = xr.concat([years(da, a, b).mean("time") for a, b in WINDOWS.values()], dim="window")
    deficit = 1 - ann / normal_rain
    drought = []
    for a, b in WINDOWS.values():
        d = years(deficit, a, b)
        drought.append(((2 * (d > 0.5).mean("time") + ((d > 0.26) & (d <= 0.5)).mean("time")) * 100).astype("float32"))
    out["drought"] = xr.concat(drought, dim="window")

    ds = xr.Dataset(out).assign_coords(window=list(WINDOWS))
    for v in ds.data_vars:
        ds[v].attrs = {}
    ds.attrs = {"model": model, "scenario": "SSP2-4.5", "source": "INDRA-CMIP6 DBCCA daily, 0.1°",
                "method": "Rama Rao et al. 2020 Atlas definitions; 09_model_indicators.py (xarray, dask, xclim)"}
    return ds


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for m in sys.argv[1:] or MODELS:
        f = OUT / f"{m}_rr.nc"
        if f.exists():
            print(f"skip {m} (done)")
            continue
        print(f"== {m}", flush=True)
        ds = model_indicators(m)
        ds.to_netcdf(f, encoding={v: {"zlib": True, "complevel": 4} for v in ds.data_vars})
        print(f"   wrote {f.name}", flush=True)


if __name__ == "__main__":
    main()
