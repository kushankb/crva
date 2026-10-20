"""Shared loader for ClimateHazards indicator NetCDFs (absolute-value files only).

Changes are always computed downstream as future − historical from the outputs
of this loader, never read from the *_delta_* files: those carry the Kelvin
offset (tmean, rabi_tmax) and, for SPI/SPEI, a monthly index anomaly rather
than a change in drought frequency.
"""
from pathlib import Path

import numpy as np
import xarray as xr

NC_ROOT = Path("/Volumes/Extreme SSD/FAO_India/ClimateHazards/output")
SSPS    = ["SSP126", "SSP245", "SSP370", "SSP585"]
PERIODS = ["2047", "2050", "2100"]

INDICATORS = [
    "heat_stress_35", "heat_stress_40", "tropical_nights", "heatwave_days",
    "wsdi", "heat_fatal_45", "cdd_energy", "tmean", "rabi_tmax",
    "frost_days", "csdi", "hdd",
    "prcptot", "rx1day", "rx5day", "r20mm", "r10mm", "r1mm", "cwd", "kharif_precip",
    "cdd", "spi3", "spei3",
    "gdd_10", "gdd_38", "monsoon_onset", "dtr", "etr",
    "r99ptot", "r95ptot", "tn90p", "tx10p", "gsl",
    "june_precip", "july_precip", "rx3day", "r100mm3d",
    "tmax_mean", "tmin_mean", "summer_tmean",
    "rr_rainy_days", "rr_dryspell", "rr_p99", "rr_rx1_pct", "rr_rx3_pct", "rr_hot_days", "rr_cold_days",
]

KELVIN = {"tmean", "rabi_tmax"}
SPI = {"spi3", "spei3"}
SPI_DROUGHT_THRESH = -1.0
# Percentile-based indices carry a `percentiles` dim (10, 90, 95, 99); each uses one threshold.
PERCENTILE_SLICE = {"wsdi": 90, "tn90p": 90, "csdi": 10, "tx10p": 10, "r95ptot": 95, "r99ptot": 99}
# Multiplicative unit fixes applied after time-averaging.
SCALE = {
    "rx1day": 86400.0,   # kg m-2 s-1 → mm
    "r95ptot": 100.0,    # fraction of annual total → %
    "r99ptot": 100.0,
}


def nc_path(indicator, scenario, period=None):
    if scenario == "historical":
        return NC_ROOT / "historical" / f"{indicator}_historical.nc"
    return NC_ROOT / scenario / f"{indicator}_{scenario}_{period}.nc"


def load_2d(indicator, scenario, period=None):
    """Return (data[lat, lon] float32 in display units, lats, lons) or (None, None, None)."""
    path = nc_path(indicator, scenario, period)
    if not path.exists():
        return None, None, None
    ds = xr.open_dataset(path, mask_and_scale=True)
    da = ds[indicator] if indicator in ds.data_vars else ds[list(ds.data_vars)[0]]

    if "percentiles" in da.dims:
        da = da.sel(percentiles=PERCENTILE_SLICE[indicator])

    if indicator in SPI:
        data = (da < SPI_DROUGHT_THRESH).where(da.notnull()).mean("time") * 100.0
    elif "time" in da.dims:
        data = da.mean("time")
    else:
        data = da

    data = data.transpose("lat", "lon").values.astype(np.float32)
    if indicator in KELVIN:
        data = data - 273.15
    if indicator in SCALE:
        data = data * SCALE[indicator]
    return data, ds["lat"].values, ds["lon"].values
