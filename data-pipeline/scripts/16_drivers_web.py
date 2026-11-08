"""
What drives each district's risk and each of its components, for the app's detail drawer.

Future hazard  each Table 5c indicator's contribution to the Rama Rao index (weight x normalised change), median of
               the six models, per window; `top` = the indicator pushing hardest in the direction of the index,
               `agree` = how many models have that same top driver.        (11_atlas_index.py -> atlas_contrib_per_model.csv)
Exposure, historical hazard  each indicator's contribution (weight x z-score)            (Outputs/CRVA_exposure 03 -> exposure_index_lgd.csv)
Risk           as in the Atlas: each component index x its Table 6 weight (historical hazard 20, future hazard 20,
               exposure 20, vulnerability 40). Where a part is missing, the weights are re-scaled over the parts the
               district has (crva_weights.reweighted_index, used for every CRVA dimension; at least half needed). Exposure (z-score based) reads relative to other
               districts; future hazard reads relative to today (0 = no change). Vulnerability is 14 of 15 Atlas indicators.
States         for each part, how many of the state's districts have each top driver.

Risk index   sum of the four parts; classes at ±0.5 / ±1.5 SD around the mean across districts with a risk index
             (Atlas Table 7), per future-hazard window. Compared with Atlas Table 12 (state counts, 573 districts) in
             Outputs/CRVA_risk/tables/state_classes_vs_atlas.csv.

Writes a `drivers` and a `risk_score` block into web/public/data/crva_stats.json and web/public/data/risk.json
  {ids, classes, idx/cls: {window: [...]}, pct: {window: {part: [...]}}, missing, names, state, bbox: [...]}.
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
from crva_weights import reweighted_index
MI = HERE.parent / "model_indicators"
HIST = ROOT.parent / "Outputs" / "CRVA_historical_hazard" / "data" / "processed" / "hazard_index_lgd.csv"
VULN = ROOT.parent / "Outputs" / "CRVA_vulnerability" / "data" / "processed" / "vulnerability_index_lgd.csv"
VU_ID = {"rain": "annual_rainfall_mm", "degr": "degraded_land_pct", "awhc": "awhc_mm", "gw": "groundwater_availability",
         "lsd": "livestock_density", "lit": "literacy_pct", "gap": "gender_gap_literacy", "irr": "net_irrigated_pct",
         "road": "road_density", "elec": "rural_electrification_pct", "fert": "fertiliser_use", "shg": "shg_density", "mkt": "market_density", "linc": "low_income_households_pct"}
EXPO = ROOT.parent / "Outputs" / "CRVA_exposure" / "data" / "processed" / "exposure_index_lgd.csv"
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
RISK_JSON = ROOT / "web" / "public" / "data" / "risk.json"
RISK_OUT = ROOT.parent / "Outputs" / "CRVA_risk" / "tables"
CLASSES = ["Very low", "Low", "Medium", "High", "Very high"]
# Atlas Table 12: risk classes by state (Very low, Low, Medium, High, Very high), 573 districts
ATLAS_T12 = {
    "Andhra Pradesh": [0, 3, 6, 3, 1], "Arunachal Pradesh": [0, 1, 5, 6, 1], "Assam": [0, 2, 14, 5, 2], "Bihar": [0, 0, 14, 13, 10],
    "Chhattisgarh": [0, 0, 10, 6, 0], "Goa": [0, 1, 1, 0, 0], "Gujarat": [3, 7, 7, 6, 2], "Haryana": [0, 0, 8, 8, 3],
    "Himachal Pradesh": [0, 1, 3, 6, 2], "Jammu And Kashmir": [0, 1, 3, 7, 3], "Jharkhand": [0, 1, 11, 6, 0], "Karnataka": [0, 3, 9, 12, 3],
    "Kerala": [0, 0, 1, 5, 8], "Madhya Pradesh": [1, 7, 21, 14, 2], "Maharashtra": [1, 2, 17, 11, 2], "Manipur": [0, 0, 3, 6, 0],
    "Meghalaya": [0, 0, 0, 1, 6], "Mizoram": [0, 0, 1, 5, 2], "Nagaland": [0, 2, 0, 5, 1], "Odisha": [0, 0, 11, 13, 6],
    "Puducherry": [1, 1, 0, 0, 0], "Punjab": [0, 2, 6, 4, 5], "Rajasthan": [0, 0, 5, 10, 17], "Sikkim": [0, 0, 0, 3, 1],
    "Tamil Nadu": [4, 9, 11, 5, 0], "Telangana": [0, 2, 5, 2, 0], "Tripura": [0, 2, 2, 0, 0], "Uttar Pradesh": [0, 1, 21, 26, 22],
    "Uttarakhand": [0, 0, 4, 2, 7], "West Bengal": [0, 0, 3, 11, 3]}
# Ladakh (Leh, Kargil) is not assessed: left out of the exposure and historical hazard indices (2026-10-29)
NOT_ASSESSED = {"district:003", "district:004"}
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


def num(v, k=4):
    """Rounded float, or None for a missing value (JSON has no NaN)."""
    return None if v is None or pd.isna(v) else round(float(v), k)


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
    risk_fh = {w: idx.xs(w, level="window") for w in sorted(pm.window.unique())}
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
    ex_idx = ex.set_index("_id").idx_atlas
    for r in ex.itertuples():
        a = f"district:{r._1}"
        if a not in out:
            continue
        c = {EX_ID[k]: num(getattr(r, f"c_{k}")) for k in EX}
        out[a]["exposure"] = {"c": c, "index": round(float(r.idx_atlas), 4), "top": top_of(c, r.idx_atlas)}

    # historical hazard
    hh = pd.read_csv(HIST, dtype={"_id": str}).dropna(subset=["idx_atlas", "_id"])
    hh_idx = hh.set_index("_id").idx_atlas
    for r in hh.itertuples():
        a = f"district:{r._1}"
        if a not in out:
            continue
        c = {f"{k}_proneness": num(getattr(r, f"c_{k}")) for k in ("drought", "flood", "cyclone")}
        out[a]["historical_hazard"] = {"c": c, "index": round(float(r.idx_atlas), 4), "top": top_of(c, r.idx_atlas)}

    # vulnerability (14 of 15 Atlas indicators)
    vu = pd.read_csv(VULN, dtype={"_id": str}).dropna(subset=["idx", "_id"])
    vu_idx = vu.set_index("_id").idx
    for r in vu.itertuples():
        a = f"district:{r._1}"
        if a not in out:
            continue
        c = {VU_ID[k]: num(getattr(r, f"c_{k}")) for k in VU_ID}
        out[a]["vulnerability"] = {"c": c, "index": round(float(r.idx), 4), "top": top_of(c, r.idx)}

    # risk, as in the Atlas: Table 6 weight x each component index; weights re-scaled over the parts a district has
    ids = list(out)
    num_ids = [a.split(":", 1)[1] for a in ids]
    risk_tab, part_pct = {}, {}
    for w, z in risk_fh.items():
        parts = pd.DataFrame({"historical_hazard": hh_idx.reindex(num_ids).values,
                              "future_hazard": z.reindex(ids).values,
                              "exposure": ex_idx.reindex(num_ids).values,
                              "vulnerability": vu_idx.reindex(num_ids).values}, index=ids)
        risk_tab[w] = reweighted_index(parts, RISK_W)
        part_pct[w] = parts.rank(pct=True) * 100        # national position on each part, for the four-axis chart
    for a, d in out.items():
        rk = {}
        for w, (ix, contrib, share, missing) in risk_tab.items():
            if pd.isna(ix[a]):
                rk[w] = None
                continue
            rk[w] = {k: num(contrib.at[a, k]) for k in RISK_W}
            avail = {k: v for k, v in rk[w].items() if v is not None}
            rk[w]["top"] = top_of(avail, sum(avail.values())) if avail else None
            if missing[a]:
                rk[w]["missing"] = missing[a]
        d["risk"] = rk
        if a in NOT_ASSESSED:
            d["risk"] = {w: None for w in rk}
            d["not_assessed"] = "Ladakh: exposure and historical hazard data incomplete"

    for a, d in out.items():
        stats[a]["drivers"] = d

    # display names: undo the boundary file's symbol-for-vowel encoding (04_admin_aggregates.clean_name)
    for v in stats.values():
        if "name" in v:
            v["name"] = admin.clean_name(v["name"])

    # risk index and classes (Atlas Table 7: ±0.5 / ±1.5 SD around the mean), per window
    for v in stats.values():
        v.pop("risk_score", None)
    risk_json = {"ids": num_ids, "classes": CLASSES, "idx": {}, "cls": {}, "pct": {}, "missing": None}
    edges = [-np.inf, -1.5, -0.5, 0.5, 1.5, np.inf]
    for w, (ix, contrib, share, missing) in risk_tab.items():
        cls = pd.cut((ix - ix.mean()) / ix.std(), edges, labels=False)
        risk_json["idx"][w] = [num(v, 3) for v in ix]
        risk_json["cls"][w] = [None if pd.isna(c) else int(c) for c in cls]
        # national position on each part, for the state panel's spread of districts
        risk_json["pct"][w] = {k: [None if pd.isna(ix[a]) else num(part_pct[w].at[a, k], 0) for a in ids] for k in RISK_W}
        for a in ids:
            if pd.notna(ix[a]):
                rs = stats[a].setdefault("risk_score", {"index": {}, "class": {}, "pct": {}})
                rs["index"][w], rs["class"][w] = num(ix[a], 3), CLASSES[int(cls[a])]
                rs["pct"][w] = {k: num(part_pct[w].at[a, k], 0) for k in RISK_W}
        if w == "2050":
            risk_json["missing"] = [None if pd.isna(ix[a]) else missing[a] for a in ids]

    # states: how many districts have each top driver
    dist = admin.load_districts().drop_duplicates("_id")
    key = lambda s: "".join(ch for ch in str(s).lower() if ch.isalpha()).replace("and", "")
    state_of = dict(zip("district:" + dist["_id"].astype(str), dist["_state_name"].map(key)))
    state_keys = {key(v.get("name")): k for k, v in stats.items() if k.startswith("state:")}
    # Each district counts once, under the part pushing hardest in its own direction: "up" = above the national
    # average (the part raising it most), "down" = below (the part lowering it most). Kept apart so a part that
    # lowers risk is never shown as a driver of risk.
    agg = {}
    side = lambda total: "up" if total >= 0 else "down"
    new_split = lambda: {"up": Counter(), "down": Counter()}
    for a, d in out.items():
        sk = state_keys.get(state_of.get(a))
        if not sk:
            continue
        s = agg.setdefault(sk, {"future_hazard": {}, "exposure": new_split(), "historical_hazard": new_split(), "vulnerability": new_split(), "risk": {}})
        for w, v in d.get("future_hazard", {}).items():
            s["future_hazard"].setdefault(w, new_split())[side(v["index"])][v["top"]] += 1
        for dim in ("exposure", "historical_hazard", "vulnerability"):
            if dim in d:
                s[dim][side(d[dim]["index"])][d[dim]["top"]] += 1
        for w, v in d["risk"].items():
            if v and v["top"]:
                total = sum(v[k] for k in RISK_W if v.get(k) is not None)
                s["risk"].setdefault(w, new_split())[side(total)][v["top"]] += 1
    # states: districts per risk class, per window
    dist_state = {a: state_keys.get(state_of.get(a)) for a in ids}
    # risk.json: each district's name, state and map extent, so a state's panel can list and locate its districts
    import geopandas as gpd
    geo = gpd.read_file(ROOT / "web" / "public" / "data" / "india_districts.geojson")
    bb = {str(r.district_id): [round(float(v), 2) for v in r.geometry.bounds] for r in geo.itertuples() if r.geometry is not None}
    risk_json["names"] = [stats[a].get("name") for a in ids]
    risk_json["state"] = [dist_state[a].split(":", 1)[1] if dist_state[a] else None for a in ids]
    risk_json["bbox"] = [bb.get(n) for n in num_ids]
    RISK_JSON.write_text(json.dumps(risk_json, separators=(",", ":")))
    # search.json: every state and district on the map, with its extent, for the search box
    sgeo = gpd.read_file(ROOT / "web" / "public" / "data" / "india_states.geojson")
    ext = lambda g: [round(float(v), 2) for v in g.bounds]
    st_id = {key(r.name): str(r.state_id) for r in sgeo.itertuples()}
    search = {"s": [[str(r.state_id), admin.clean_name(r.name), ext(r.geometry)] for r in sgeo.itertuples() if r.geometry is not None],
              "d": [[str(r.district_id), admin.clean_name(r.name), admin.clean_name(r.state_name), st_id.get(key(admin.clean_name(r.state_name))), ext(r.geometry)]
                    for r in geo.itertuples() if r.geometry is not None and isinstance(r.name, str)]}
    (ROOT / "web" / "public" / "data" / "search.json").write_text(json.dumps(search, separators=(",", ":"), ensure_ascii=False))
    for w in risk_tab:
        cnt = {}
        for a in ids:
            c = (stats[a].get("risk_score") or {}).get("class", {}).get(w)
            if c and dist_state[a]:
                cnt.setdefault(dist_state[a], Counter())[c] += 1
        for sk, c in cnt.items():
            stats[sk].setdefault("risk_score", {"class_counts": {}})["class_counts"][w] = {k: int(c.get(k, 0)) for k in CLASSES}
        # states: median national position of their districts on each part
        for sk in cnt:
            sub = part_pct[w].loc[[a for a in ids if dist_state[a] == sk and (stats[a].get("risk_score") or {}).get("class", {}).get(w)]]
            stats[sk]["risk_score"].setdefault("pct", {})[w] = {k: num(sub[k].median(), 0) for k in RISK_W}
    # compare with Atlas Table 12 (state average class, 0 = Very low … 4 = Very high)
    RISK_OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for sk, v in stats.items():
        if not sk.startswith("state:") or "risk_score" not in v:
            continue
        name = v.get("name")
        atlas = next((a for s_, a in ATLAS_T12.items() if key(s_) == key(name)), None)
        for w, c in v["risk_score"]["class_counts"].items():
            ours = [c[k] for k in CLASSES]
            rows.append({"state": name, "window": w, **{f"ours_{k}": n for k, n in zip(CLASSES, ours)},
                         "ours_mean_class": np.dot(range(5), ours) / max(sum(ours), 1),
                         "atlas_mean_class": np.dot(range(5), atlas) / sum(atlas) if atlas else None})
    cmp_ = pd.DataFrame(rows)
    cmp_.round(3).to_csv(RISK_OUT / "state_classes_vs_atlas.csv", index=False)
    for w, g in cmp_.dropna(subset=["atlas_mean_class"]).groupby("window"):
        print(f"risk ~{w}: classes", [sum(1 for a in ids if (stats[a].get('risk_score') or {}).get('class', {}).get(w) == k) for k in CLASSES],
              f"| state mean class r with Atlas Table 12 = {g.ours_mean_class.corr(g.atlas_mean_class):.2f}")

    for sk, s in agg.items():
        plain = lambda sp: {k: dict(c) for k, c in sp.items()}
        stats[sk]["drivers"] = {"future_hazard": {w: plain(c) for w, c in s["future_hazard"].items()},
                                "exposure": plain(s["exposure"]), "historical_hazard": plain(s["historical_hazard"]),
                                "vulnerability": plain(s["vulnerability"]), "risk": {w: plain(c) for w, c in s["risk"].items()},
                                "states_view": "top_counts"}
    STATS.write_text(json.dumps(stats, separators=(",", ":")))
    n_fh = sum("future_hazard" in d for d in out.values())
    n_ex = sum("exposure" in d for d in out.values())
    print(f"drivers: {n_fh} districts with future hazard, {n_ex} with exposure, {len(agg)} states")
    ex_top = Counter(d["exposure"]["top"] for d in out.values() if "exposure" in d)
    fh_top = Counter(d["future_hazard"]["2050"]["top"] for d in out.values() if "future_hazard" in d)
    print("risk ~2050 top parts:", Counter((d["risk"]["2050"] or {}).get("top") for d in out.values()).most_common())
    print("exposure top drivers:", ex_top.most_common()); print("future hazard ~2050 top drivers:", fh_top.most_common(6))


if __name__ == "__main__":
    main()
