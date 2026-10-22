"""
Compare the 15 Rama Rao (2020) future-hazard indicators computed from
(a) the INDRA-CMIP6 14-model ensemble-mean daily data and
(b) one member, MPI-ESM1-2-HR,
on an identical footing: SSP2-4.5, 2036–2065 vs 1985–2014, district means.

Both Atlas-exact definitions (hot/cold days at ±4 °C, drought from annual
rainfall deficit with severe:moderate = 2:1) and the scaled variants used in the
tools (±2 SD) are computed, plus variability diagnostics, to separate the effect
of ensemble averaging from other structural issues.

Writes compare_single_model.csv (district × indicator × dataset) and prints a
summary table.

Run:
  conda run -n ml_trade python compare_single_model.py
"""
import importlib
import sys
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd
from scipy.ndimage import uniform_filter1d

sys.path.insert(0, str(Path(__file__).parent))
agg = importlib.import_module("04_admin_aggregates")

BASE = (1985, 2014)
FUT = (2036, 2065)
WET = 2.5
MONTH = np.repeat(np.arange(1, 13), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MAM, DJF, JUNOCT, JJAS = np.isin(MONTH, [3, 4, 5]), np.isin(MONTH, [12, 1, 2]), (MONTH >= 6) & (MONTH <= 10), (MONTH >= 6) & (MONTH <= 9)

C = Path("/Volumes/Extreme SSD/FAO_India/Data/CMIP6_Indri")
M = C / "models" / "MPI-ESM1-2-HR"
DATASETS = {
    "ensemble": {
        "pr":     {"hist": C / "pr/pr_ens_historical.nc",       "fut": C / "pr/pr_ens_ssp245.nc"},
        "tasmax": {"hist": C / "tmax/tasmax_ens_historical.nc", "fut": C / "tmax/tasmax_ens_ssp245.nc"},
        "tasmin": {"hist": C / "tmin/tasmin_ens_historical.nc", "fut": C / "tmin/tasmin_ens_ssp245.nc"},
    },
    "MPI-ESM1-2-HR": {v: {"hist": M / v / "historical_DBCCA.nc", "fut": M / v / "ssp245_DBCCA.nc"} for v in ("pr", "tasmax", "tasmin")},
}
OUT = Path(__file__).parents[1] / "compare_single_model.csv"


class Reader:
    """Year-by-year access to a daily (time, lat, lon) file, in mm/day or °C."""

    def __init__(self, path, var):
        self.ds = netCDF4.Dataset(path)
        name = var if var in self.ds.variables else [k for k in self.ds.variables if self.ds[k].ndim == 3][0]
        self.v = self.ds[name]
        self.v.set_auto_mask(False)
        t = self.ds["time"]
        cal = getattr(t, "calendar", "standard")
        dates = netCDF4.num2date(t[:], t.units, calendar=cal)
        self.years = np.array([d.year for d in dates])
        self.doy_month = np.array([d.month for d in dates])
        self.day = np.array([d.day for d in dates])
        units = getattr(self.v, "units", "")
        self.scale, self.offset = 1.0, 0.0
        if var == "pr" and "s-1" in units:
            self.scale = 86400.0
        if var != "pr" and units in ("K", "kelvin"):
            self.offset = -273.15
        self.lat = self.ds["lat"][:]
        self.lon = self.ds["lon"][:]

    def year(self, y):
        idx = np.where(self.years == y)[0]
        if len(idx) == 0:
            return None
        sel = idx[~((self.doy_month[idx] == 2) & (self.day[idx] == 29))]  # drop leap days -> 365
        a = np.asarray(self.v[sel[0]:sel[-1] + 1], dtype=np.float32)
        keep = ~((self.doy_month[sel[0]:sel[-1] + 1] == 2) & (self.day[sel[0]:sel[-1] + 1] == 29))
        a = a[keep]
        if a.shape[0] != 365:
            return None
        fill = getattr(self.v, "_FillValue", None)
        if fill is not None:
            a = np.where(a == fill, np.nan, a)
        return a * self.scale + self.offset


def dryspell_score(pr):
    d = pr[JUNOCT] < WET
    run = np.zeros(d.shape[1:], np.float32)
    score = np.zeros(d.shape[1:], np.float32)
    for t in range(d.shape[0] + 1):
        dry = d[t] if t < d.shape[0] else np.zeros_like(d[0])
        ended = ~dry & (run >= 14)
        score += np.where(ended, np.exp(np.minimum(run, 42) / 14 - 1), 0)
        run = np.where(dry, run + 1, 0)
    return score


def events_100mm(pr):
    r3 = pr[:-2] + pr[1:-1] + pr[2:]
    wet = r3 > 100
    starts = wet[0] + (wet[1:] & ~wet[:-1]).sum(0)
    return starts.astype(np.float32), r3.max(0)


def climatology(rd, years, months):
    s, n = None, 0
    for y in range(*years):
        a = rd.year(y)
        s = a.astype(np.float64) if s is None else s + a
        n += 1
    normal = uniform_filter1d((s / n).astype(np.float32), 31, axis=0, mode="wrap")
    ss, cnt = 0.0, 0
    for y in range(*years):
        an = rd.year(y)[months] - normal[months]
        ss = ss + (an.astype(np.float64) ** 2).sum(0)
        cnt += an.shape[0]
    return normal, np.sqrt(ss / cnt).astype(np.float32)


def run_dataset(name, files):
    print(f"\n== {name}", flush=True)
    rh = {v: Reader(files[v]["hist"], v) for v in files}
    rf = {v: Reader(files[v]["fut"], v) for v in files}
    yb, yf = (BASE[0], BASE[1] + 1), (FUT[0], FUT[1] + 1)

    nx_, sdx = climatology(rh["tasmax"], yb, MAM)
    nn_, sdn = climatology(rh["tasmin"], yb, DJF)
    ann_base = np.mean([rh["pr"].year(y).sum(0) for y in range(*yb)], 0)

    def window(r, yrs):
        acc = {}
        annual = []
        for y in range(*yrs):
            p, tx, tn = r["pr"].year(y), r["tasmax"].year(y), r["tasmin"].year(y)
            if p is None or tx is None or tn is None:
                continue
            ev, rx3 = events_100mm(p)
            vals = {
                "annual_rain": p.sum(0), "june_rain": p[MONTH == 6].sum(0), "july_rain": p[MONTH == 7].sum(0),
                "rainy_days": (p >= WET).sum(0).astype(np.float32),
                "tmax": tx.mean(0), "tmin": tn.mean(0),
                "hot_days_4C": ((tx[MAM] - nx_[MAM]) >= 4).sum(0).astype(np.float32),
                "hot_days_2SD": ((tx[MAM] - nx_[MAM]) >= 2 * sdx).sum(0).astype(np.float32),
                "cold_days_4C": ((tn[DJF] - nn_[DJF]) <= -4).sum(0).astype(np.float32),
                "cold_days_2SD": ((tn[DJF] - nn_[DJF]) <= -2 * sdn).sum(0).astype(np.float32),
                "frost": (tn < 0).sum(0).astype(np.float32),
                "dry_spells": dryspell_score(p),
                "p99_rain": np.percentile(p, 99, axis=0).astype(np.float32),
                "events_100mm": ev,
                "rx1_pct": p.max(0) / ann_base * 100, "rx3_pct": rx3 / ann_base * 100,
                "dry_days_jjas": (p[JJAS] < WET).mean(0) * 100,
                "tmax_daily_sd": (tx[MAM] - nx_[MAM]).std(0),
            }
            for k, v in vals.items():
                acc[k] = acc.get(k, 0) + v.astype(np.float64)
            annual.append(p.sum(0))
        n = len(annual)
        out = {k: (v / n).astype(np.float32) for k, v in acc.items()}
        annual = np.stack(annual)
        out["rain_cv"] = (annual.std(0) / annual.mean(0) * 100).astype(np.float32)
        deficit = 1 - annual / ann_base
        sev, mod = (deficit > 0.5).mean(0), ((deficit > 0.26) & (deficit <= 0.5)).mean(0)
        out["drought_atlas"] = ((2 * sev + mod) * 100).astype(np.float32)
        print(f"   {yrs[0]}-{yrs[1]-1}: {n} years", flush=True)
        return out

    hist, fut = window(rh, yb), window(rf, yf)
    return hist, fut, rh["pr"].lat, rh["pr"].lon


def main():
    districts = agg.load_districts()
    rows = []
    for name, files in DATASETS.items():
        hist, fut, lat, lon = run_dataset(name, files)
        mask = agg.build_mask(districts, lon, lat).values
        for i, d in districts.iterrows():
            sel = mask == i
            if not sel.any():
                continue
            for k in hist:
                h, f = float(np.nanmean(hist[k][sel])), float(np.nanmean(fut[k][sel]))
                rows.append({"dataset": name, "district": d["_id"], "state": d["_state_name"], "indicator": k, "base": h, "future": f})
    df = pd.DataFrame(rows)
    df["change"] = df["future"] - df["base"]
    pct = df["indicator"].isin(["annual_rain", "june_rain", "july_rain", "rainy_days"])
    df.loc[pct, "change"] = df.loc[pct, "change"] / df.loc[pct, "base"] * 100
    df.to_csv(OUT, index=False)

    sign = {"annual_rain": -1, "june_rain": -1, "july_rain": -1, "rainy_days": -1}
    print(f"\nDistrict medians, SSP2-4.5 2036–2065 vs 1985–2014  (written {OUT.name})")
    print(f"{'indicator':15}{'ens base':>10}{'MPI base':>10}{'ens chg':>10}{'MPI chg':>10}{'ens adv%':>10}{'MPI adv%':>10}")
    for k in df["indicator"].unique():
        e = df[(df["dataset"] == "ensemble") & (df["indicator"] == k)]
        m = df[(df["dataset"] == "MPI-ESM1-2-HR") & (df["indicator"] == k)]
        s = sign.get(k, 1)
        adv = lambda x: (x["change"] * s > 0).mean() * 100
        print(f"{k:15}{e['base'].median():10.2f}{m['base'].median():10.2f}{e['change'].median():10.2f}{m['change'].median():10.2f}{adv(e):10.0f}{adv(m):10.0f}")


if __name__ == "__main__":
    main()
