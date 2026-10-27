"""
Exposure layers for the web app, from the CRVA exposure analysis (Outputs/CRVA_exposure, scripts 01–03).

Reads  Outputs/CRVA_exposure/data/processed/exposure_index_lgd.csv (one row per CRVA district)
Writes web/public/data/exposure.json  {ids, ind: {indicator: [...]}, cls: [...], gap: [...], parent: [...]}
       and an `exposure` block per district in web/public/data/crva_stats.json
Exposure index: Rama Rao et al. (2020) method — z-scores across rural districts, rural density capped at p99,
weights NSA 40 / density 15 / small holdings 20 / SC-ST 15 / crossbred cattle 10, classes at ±0.5 / ±1.5 SD.
Gaps (districts missing from the source sheet) are 0 and flagged in `gap`.

  conda run -n ml_trade python 15_exposure_web.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT.parent / "Outputs" / "CRVA_exposure" / "data" / "processed" / "exposure_index_lgd.csv"
WEB = ROOT / "web" / "public" / "data"
IND = {"nsa": "net_sown_area_pct", "rpd": "rural_pop_density", "smh": "small_marginal_farmers_pct",
       "scst": "scst_population_pct", "xbc": "crossbred_cattle_pct"}
CLASSES = ["Very low", "Low", "Medium", "High", "Very high"]


def main():
    d = pd.read_csv(SRC, dtype={"_id": str})
    d = d[d.in_index.fillna(False).astype(bool) & d["_id"].notna()].copy()
    rnd = lambda s, k: [None if pd.isna(v) else round(float(v), k) for v in s]
    cls = [None if pd.isna(c) else CLASSES.index(c) for c in d.cls_atlas]
    out = {"ids": d["_id"].tolist(),
           "ind": {IND[c]: rnd(d[c], 1) for c in IND},
           "idx": rnd(d.idx_atlas, 3), "cls": cls, "classes": CLASSES,
           "gap": [None if pd.isna(g) else ",".join(IND[x] for x in g.split(",")) for g in d.gap_filled_zero],
           "parent": [None if m.startswith("same") or not s else f"{s} ({m.split(' (')[0]})" for s, m in zip(d.source_district.fillna(""), d.method)]}
    (WEB / "exposure.json").write_text(json.dumps(out, separators=(",", ":")))

    stats_f = WEB / "crva_stats.json"
    stats = json.loads(stats_f.read_text())
    for i, row in enumerate(d.itertuples()):
        k = f"district:{row._1}"
        if k not in stats:
            continue
        stats[k]["exposure"] = {"indicators": {IND[c]: out["ind"][IND[c]][i] for c in IND},
                                "index": out["idx"][i], "class": CLASSES[cls[i]] if cls[i] is not None else None,
                                "gaps": out["gap"][i], "source_district": out["parent"][i]}
    # states: how many of their districts fall in each class (matched on state name)
    key = lambda s: "".join(ch for ch in str(s).lower() if ch.isalpha()).replace("and", "")
    by_state = d.assign(k=d.lgd_state.map(key), c=d.cls_atlas).groupby("k").c.value_counts().unstack(fill_value=0)
    for k, v in stats.items():
        if k.startswith("state:") and key(v.get("name")) in by_state.index:
            row = by_state.loc[key(v["name"])]
            stats[k]["exposure"] = {"class_counts": {c: int(row.get(c, 0)) for c in CLASSES}}
    stats_f.write_text(json.dumps(stats, separators=(",", ":")))
    n = pd.Series(cls).value_counts().sort_index()
    print(f"exposure.json: {len(d)} districts; classes {dict(zip([CLASSES[int(i)] for i in n.index], n.tolist()))}")


if __name__ == "__main__":
    main()
