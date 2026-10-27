"""
What drives each district's risk and each of its components, for the app's detail drawer.

Future hazard  each Table 5c indicator's contribution to the Rama Rao index (weight x normalised change), median of
               the six models, per window; `top` = the indicator pushing hardest in the direction of the index,
               `agree` = how many models have that same top driver.        (11_atlas_index.py -> atlas_contrib_per_model.csv)
Exposure       each indicator's contribution (weight x z-score)            (Outputs/CRVA_exposure 03 -> exposure_index_lgd.csv)
Risk           each component standardised across districts (z) x its Atlas Table 6 weight (hazard 20, future hazard 20,
               exposure 20, vulnerability 40), so every bar means "how far this component pushes risk above or below the
               national average". Historical hazard and vulnerability are not available yet (null).
States         for each part, how many of the state's districts have each top driver.

Writes a `drivers` block into web/public/data/crva_stats.json.
  conda run -n ml_trade python 16_drivers_web.py
"""
import importlib
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
admin = importlib.import_module("04_admin_aggregates")
MI = HERE.parent / "model_indicators"
EXPO = ROOT.parent / "Outputs" / "CRVA_exposure" / "data" / "processed" / "exposure_index_lgd.csv"
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
RISK_W = {"historical_hazard": 0.2, "future_hazard": 0.2, "exposure": 0.2, "vulnerability": 0.4}
EX = ["nsa", "rpd", "smh", "scst", "xbc"]
EX_ID = {"nsa": "net_sown_area_pct", "rpd": "rural_pop_density", "smh": "small_marginal_farmers_pct",
         "scst": "scst_population_pct", "xbc": "crossbred_cattle_pct"}


def top_of(contrib: dict, total: float):
    """Indicator pushing hardest in the direction of the total."""
    items = [(k, v) for k, v in contrib.items() if v is not None]
    if not items:
        return None
    return (max if total >= 0 else min)(items, key=lambda kv: kv[1])[0]


def zscore(s):
    return (s - s.mean()) / s.std()


def main():
    stats = json.loads(STATS.read_text())
    out = {k: {} for k in stats if k.startswith("district:")}

    # future hazard
    pm = pd.read_csv(MI / "atlas_contrib_per_model.csv", dtype={"window": str})
    pm = pm[pm.admin.str.startswith("district:")]
    idx = pd.read_csv(MI / "atlas_index.csv", dtype={"window": str})
    idx = idx[idx.admin.str.startswith("district:")].set_index(["admin", "window"]).index_med
    med = pm.groupby(["admin", "window", "indicator"]).contrib.median().unstack()
    per_model = pm.pivot_table(index=["admin", "window", "model"], columns="indicator", values="contrib")
    risk_fh = {}
    for w in sorted(pm.window.unique()):
        z = zscore(idx.xs(w, level="window"))
        risk_fh[w] = z
    for (a, w), row in med.iterrows():
        if a not in out:
            continue
        c = {k: round(float(v), 4) for k, v in row.items()}
        total = float(idx.get((a, w), sum(c.values())))
        top = top_of(c, total)
        models = per_model.loc[(a, w)]
        agree = int(sum(top_of(r.to_dict(), r.sum()) == top for _, r in models.iterrows()))
        out[a].setdefault("future_hazard", {})[w] = {"c": c, "index": round(total, 4), "top": top, "agree": agree, "n": len(models)}

    # exposure
    ex = pd.read_csv(EXPO, dtype={"_id": str}).dropna(subset=["idx_atlas", "_id"])
    z_ex = zscore(ex.set_index("_id").idx_atlas)
    for r in ex.itertuples():
        a = f"district:{r._1}"
        if a not in out:
            continue
        c = {EX_ID[k]: round(float(getattr(r, f"c_{k}")), 4) for k in EX}
        out[a]["exposure"] = {"c": c, "index": round(float(r.idx_atlas), 4), "top": top_of(c, r.idx_atlas)}

    # risk: weight x z of each component
    for a, d in out.items():
        i = a.split(":", 1)[1]
        rk = {}
        for w, z in risk_fh.items():
            rk[w] = {"historical_hazard": None, "vulnerability": None,
                     "future_hazard": round(float(z[a]) * RISK_W["future_hazard"], 4) if a in z.index else None,
                     "exposure": round(float(z_ex[i]) * RISK_W["exposure"], 4) if i in z_ex.index else None}
            avail = {k: v for k, v in rk[w].items() if v is not None}
            rk[w]["top"] = top_of(avail, sum(avail.values())) if avail else None
        d["risk"] = rk

    for a, d in out.items():
        stats[a]["drivers"] = d

    # states: how many districts have each top driver
    dist = admin.load_districts().drop_duplicates("_id")
    key = lambda s: "".join(ch for ch in str(s).lower() if ch.isalpha()).replace("and", "")
    state_of = dict(zip("district:" + dist["_id"].astype(str), dist["_state_name"].map(key)))
    state_keys = {key(v.get("name")): k for k, v in stats.items() if k.startswith("state:")}
    agg = {}
    for a, d in out.items():
        sk = state_keys.get(state_of.get(a))
        if not sk:
            continue
        s = agg.setdefault(sk, {"future_hazard": {}, "exposure": Counter(), "risk": {}})
        for w, v in d.get("future_hazard", {}).items():
            s["future_hazard"].setdefault(w, Counter())[v["top"]] += 1
        if "exposure" in d:
            s["exposure"][d["exposure"]["top"]] += 1
        for w, v in d["risk"].items():
            if v["top"]:
                s["risk"].setdefault(w, Counter())[v["top"]] += 1
    for sk, s in agg.items():
        stats[sk]["drivers"] = {"future_hazard": {w: dict(c) for w, c in s["future_hazard"].items()},
                                "exposure": dict(s["exposure"]), "risk": {w: dict(c) for w, c in s["risk"].items()},
                                "states_view": "top_counts"}
    STATS.write_text(json.dumps(stats, separators=(",", ":")))
    n_fh = sum("future_hazard" in d for d in out.values())
    n_ex = sum("exposure" in d for d in out.values())
    print(f"drivers: {n_fh} districts with future hazard, {n_ex} with exposure, {len(agg)} states")
    ex_top = Counter(d["exposure"]["top"] for d in out.values() if "exposure" in d)
    fh_top = Counter(d["future_hazard"]["2050"]["top"] for d in out.values() if "future_hazard" in d)
    print("exposure top drivers:", ex_top.most_common()); print("future hazard ~2050 top drivers:", fh_top.most_common(6))


if __name__ == "__main__":
    main()
