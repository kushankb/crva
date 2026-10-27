"""
Crop yield sensitivity for the detail drawer (districts and states), from the crop-impact synthesis in
Outputs/2_impacts (Sections 3.1-3.3 of the impacts report).

Soora et al. (TNC/InfoCrop, with CO2) is the main estimate; next to it a pooled estimate:
  district  median of the three large-scale sources, each averaged over its variants as in the report's headline
            configuration: TNC/InfoCrop; GGCMI (mean of with/without CO2 for C3 crops, without CO2 for maize and
            sorghum); Hultgren (mean of with/without adaptation). Also min and max of the three.
            (data/processed/district_values.csv). Only crops with district production > 0
            (district_production_weights.csv) are shown.
  state     the headline state median across all study points (corpus studies + large-scale datasets), with its
            interquartile range and number of study points. (data/processed/headline/state_medians.csv);
            Soora's state value from six_source_state_values.csv.
Horizons: mid = 2031-2065, end = 2071-2100 (report Section 3.1).

Writes a `crop_sensitivity` block into web/public/data/crva_stats.json.
  conda run -n ml_trade python 17_crop_sensitivity_web.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
IMP = ROOT.parent / "Outputs" / "2_impacts" / "data" / "processed"
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
C4 = {"Maize", "Sorghum"}
r1 = lambda v: None if v is None or pd.isna(v) else round(float(v), 1)


def num(x):
    s = str(x).strip()
    return str(int(float(s))) if s.replace(".", "", 1).isdigit() else s


def key(s):
    return "".join(ch for ch in str(s).lower() if ch.isalpha()).replace("and", "")


def main():
    stats = json.loads(STATS.read_text())
    for v in stats.values():
        v.pop("crop_sensitivity", None)
    dist_keys = {num(k.split(":", 1)[1]): k for k in stats if k.startswith("district:")}
    state_keys = {key(v.get("name")): k for k, v in stats.items() if k.startswith("state:")}

    # districts
    d = pd.read_csv(IMP / "district_values.csv", dtype={"DIST_LGD": str})
    w = d.pivot_table(index=["DIST_LGD", "crop", "horizon"], columns="dataset", values="value_pct").reset_index()
    w["ggcmi"] = np.where(w.crop.isin(C4), w.get("ggcmi_noco2"), w[["ggcmi_co2", "ggcmi_noco2"]].mean(axis=1))
    w["hult"] = w[["hult_adapt", "hult_noadapt"]].mean(axis=1)
    # only crops the district actually grows (district production, same synthesis)
    prod = pd.read_csv(IMP / "district_production_weights.csv", dtype={"DIST_LGD": str})
    prod = prod[prod.weight_kt > 0].assign(DIST_LGD=lambda x: x.DIST_LGD.map(num)).set_index(["DIST_LGD", "crop"]).weight_kt
    w["prod_kt"] = [prod.get((num(i), c)) for i, c in zip(w.DIST_LGD, w.crop)]
    w = w[w.prod_kt.notna()]
    src = w[["tnc", "ggcmi", "hult"]]
    w["pooled"], w["lo"], w["hi"], w["n"] = src.median(axis=1), src.min(axis=1), src.max(axis=1), src.notna().sum(axis=1)
    n_d = 0
    for r in w.itertuples():
        k = dist_keys.get(num(r.DIST_LGD))
        if not k or r.n == 0:
            continue
        cs = stats[k].setdefault("crop_sensitivity", {"level": "district", "crops": {}})
        cs["crops"].setdefault(r.crop, {})[r.horizon] = {
            "soora": r1(r.tnc), "pooled": r1(r.pooled), "lo": r1(r.lo), "hi": r1(r.hi), "n": int(r.n), "prod_kt": r1(r.prod_kt),
            "sources": {"tnc": r1(r.tnc), "ggcmi": r1(r.ggcmi), "hultgren": r1(r.hult)}}
        n_d += 1

    # states
    sm = pd.read_csv(IMP / "headline" / "state_medians.csv")
    six = pd.read_csv(IMP / "six_source_state_values.csv")
    tnc = six[six.scenario.str.startswith("TNC")].set_index(["state", "crop", "horizon"]).value_pct
    n_s = 0
    for r in sm.itertuples():
        k = state_keys.get(key(r.state))
        if not k:
            continue
        cs = stats[k].setdefault("crop_sensitivity", {"level": "state", "crops": {}})
        cs["crops"].setdefault(r.crop, {})[r.horizon] = {
            "soora": r1(tnc.get((r.state, r.crop, r.horizon))), "pooled": r1(r.state_median_pct),
            "lo": r1(r.q1_pct), "hi": r1(r.q3_pct), "n": int(r.n_study_points),
            "major": bool(r.major_producing)}
        n_s += 1
    STATS.write_text(json.dumps(stats, separators=(",", ":")))
    print(f"crop sensitivity: {n_d} district-crop-horizon rows, {n_s} state rows; "
          f"{sum('crop_sensitivity' in v for k, v in stats.items() if k.startswith('district:'))} districts, "
          f"{sum('crop_sensitivity' in v for k, v in stats.items() if k.startswith('state:'))} states")


if __name__ == "__main__":
    main()
