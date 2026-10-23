"""
Summarise compound extremes (13_compound_extremes.py) across models for the web.

Per admin unit, indicator (flag × season) and SSP2-4.5 window:
  change per model (days per year), median, min/max, number of models with an increase

Writes:
  web/public/data/compound.json   districts, for the map
      admins, sources, windows, seasons, flags,
      ind[key][source] = {"base": [...], "2047": [...], ...}   days per year
      chg[key][source][window] = [...]                         change in days per year
      agree[key][window] = [n_increase, ...]
      rng[key][window]   = [[min, max], ...]
      scale[key] = {vmin, vmax, amax}
  crva_stats.json  climate_hazard.multimodel.compound[key] = {base, window: {med, min, max, n_up}}

Run after 13_compound_extremes.py has written all models:
  conda run -n ml_trade python 14_compound_web.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parents[2]
IN_DIR = Path(__file__).parents[1] / "model_indicators" / "compound"
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
OUT = ROOT / "web" / "public" / "data" / "compound.json"
WINDOWS = ["2047", "2050", "2100"]
SEASONS = ["kharif", "rabi", "summer", "annual"]
FLAGS = ["hot_dry", "hot_night", "whiplash"]


def r(v, n=3):
    if v is None or not np.isfinite(v):
        return None
    return 0.0 if v == 0 else float(f"{float(v):.{n}g}")


def main():
    df = pd.concat([pd.read_csv(f) for f in sorted(IN_DIR.glob("*.csv"))])
    models = sorted(df["model"].unique())
    print("models:", models)
    for w in WINDOWS:
        df[f"chg_{w}"] = df[f"ssp245_{w}"] - df["base"]

    summ = df.groupby(["admin", "indicator"]).agg(
        base=("base", "median"),
        **{f"{k}_{w}": (f"chg_{w}", f) for w in WINDOWS for k, f in (("med", "median"), ("min", "min"), ("max", "max"))},
        **{f"up_{w}": (f"chg_{w}", lambda s: int((s > 0).sum())) for w in WINDOWS},
    ).reset_index()

    stats = json.loads(STATS.read_text())
    for row in summ.itertuples():
        feat = stats.get(row.admin)
        if not feat or "multimodel" not in feat.get("climate_hazard", {}):
            continue
        e = {"base": r(row.base)}
        for w in WINDOWS:
            e[w] = {"med": r(getattr(row, f"med_{w}")), "min": r(getattr(row, f"min_{w}")),
                    "max": r(getattr(row, f"max_{w}")), "n_up": int(getattr(row, f"up_{w}"))}
        feat["climate_hazard"]["multimodel"].setdefault("compound", {})[row.indicator] = e
    STATS.write_text(json.dumps(stats, separators=(",", ":")))

    dist = df[df["admin"].str.startswith("district:")]
    admins = sorted(dist["admin"].unique())
    pos = {a: i for i, a in enumerate(admins)}
    N = len(admins)
    keys = [f"{f}_{s}" for f in FLAGS for s in SEASONS]
    sources = ["median"] + models
    blank = lambda: [None] * N
    ind = {k: {s: {w: blank() for w in ["base"] + WINDOWS} for s in sources} for k in keys}
    chg = {k: {s: {w: blank() for w in WINDOWS} for s in sources} for k in keys}
    agree = {k: {w: blank() for w in WINDOWS} for k in keys}
    rng = {k: {w: blank() for w in WINDOWS} for k in keys}
    for row in dist.itertuples():
        i = pos[row.admin]
        ind[row.indicator][row.model]["base"][i] = r(row.base)
        for w in WINDOWS:
            ind[row.indicator][row.model][w][i] = r(getattr(row, f"ssp245_{w}"))
            chg[row.indicator][row.model][w][i] = r(getattr(row, f"chg_{w}"))
    med = dist.groupby(["admin", "indicator"])[["base"] + [f"ssp245_{w}" for w in WINDOWS]].median().reset_index()
    for row in med.itertuples():
        i = pos[row.admin]
        ind[row.indicator]["median"]["base"][i] = r(row.base)
        for w in WINDOWS:
            ind[row.indicator]["median"][w][i] = r(getattr(row, f"ssp245_{w}"))
    for row in summ[summ["admin"].isin(pos)].itertuples():
        i = pos[row.admin]
        for w in WINDOWS:
            chg[row.indicator]["median"][w][i] = r(getattr(row, f"med_{w}"))
            agree[row.indicator][w][i] = int(getattr(row, f"up_{w}"))
            rng[row.indicator][w][i] = [r(getattr(row, f"min_{w}")), r(getattr(row, f"max_{w}"))]

    scale = {}
    for k in keys:
        v = np.array([x for s in sources for w in ["base"] + WINDOWS for x in ind[k][s][w] if x is not None], float)
        c = np.array([x for s in sources for w in WINDOWS for x in chg[k][s][w] if x is not None], float)
        scale[k] = {"vmin": 0, "vmax": r(max(np.percentile(v, 98), 0.1)), "amax": r(max(np.percentile(np.abs(c), 98), 0.05))}

    OUT.write_text(json.dumps({"admins": [a.split(":", 1)[1] for a in admins], "sources": sources, "windows": WINDOWS,
                               "seasons": SEASONS, "flags": FLAGS, "ind": ind, "chg": chg, "agree": agree, "rng": rng,
                               "scale": scale}, separators=(",", ":")))
    print(f"wrote {OUT.name}: {N} districts, {OUT.stat().st_size / 1e6:.1f} MB")

    d = summ[summ["admin"].str.startswith("district:")]
    print("\nDistrict medians (days/yr): baseline -> change ~2050 / ~2100 | districts where >= 4 of 6 models increase (~2050)")
    for k in keys:
        x = d[d["indicator"] == k]
        print(f"  {k:18} {x['base'].median():6.2f} -> {x['med_2050'].median():+6.2f} / {x['med_2100'].median():+6.2f} | {(x['up_2050'] >= 4).sum()}")


if __name__ == "__main__":
    main()
