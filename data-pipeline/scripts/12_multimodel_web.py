"""
Package the per-model Rama Rao results for the CRVA web app.

Writes web/public/data/multimodel.json (districts, for the map) and adds the
Rama Rao index to climate_hazard.multimodel.aggregate in crva_stats.json
(districts and states, for the drawer).

multimodel.json:
  admins       district ids ("496", ...) in array order
  sources      ["median", model, ...]
  windows      ["2047", "2050", "2100"]
  ind[id][source] = {"base": [...], "2047": [...], ...}   absolute values
  chg[id][source][window] = [...]                        change (% for rainfall / rainy days)
  agree[id][window] = [[n_adverse, n_worse], ...]         across models
  rng[id][window]   = [[min, max], ...]                   change across models
  agg[source][window] = [{ai, ac, nu, nf, ts, tc, nm, rs, rq, rd}, ...]
  scale[id] = {vmin, vmax, amax}

Run after 09, 10 and 11:
  conda run -n ml_trade python 12_multimodel_web.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parents[2]
MI = Path(__file__).parents[1] / "model_indicators"
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
OUT = ROOT / "web" / "public" / "data" / "multimodel.json"
WINDOWS = ["2047", "2050", "2100"]
WEIGHTS = {"annual_rain": 10, "june_rain": 5, "july_rain": 15, "rainy_days": 5, "tmax": 6, "tmin": 6, "hot_days": 5,
           "cold_days": 3, "frost": 2, "drought": 12, "dry_spells": 11, "p99_rain": 5, "events_100mm": 5, "rx1_pct": 5, "rx3_pct": 5}
PCT = {"annual_rain", "june_rain", "july_rain", "rainy_days"}
ATLAS = ["More favourable", "Moderately favourable", "No hazard", "Moderately unfavourable", "More unfavourable"]
QUINT = ["Very low", "Low", "Medium", "High", "Very high"]


def r(v, n=3):
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return None
    v = float(v)
    return 0.0 if v == 0 else float(f"{v:.{n}g}")


def abs_class(s):
    return None if s is None or not np.isfinite(s) else "None" if s <= 0 else "High" if s > 40 else "Moderate" if s > 20 else "Low"


def main():
    models_df = pd.concat([pd.read_csv(f) for f in sorted(MI.glob("*.csv"))
                           if f.stem not in ("multimodel", "model_changes", "atlas_index", "atlas_index_per_model")])
    models = sorted(models_df["model"].unique())
    sources = ["median"] + models
    dist = models_df[models_df["admin"].str.startswith("district:")]
    admins = sorted(dist["admin"].unique(), key=lambda a: a)
    pos = {a: i for i, a in enumerate(admins)}
    N = len(admins)
    blank = lambda: [None] * N

    ind = {k: {s: {w: blank() for w in ["base"] + WINDOWS} for s in sources} for k in WEIGHTS}
    for row in dist.itertuples():
        if row.indicator not in WEIGHTS:
            continue
        e = ind[row.indicator][row.model]
        i = pos[row.admin]
        e["base"][i] = r(row.base)
        for w in WINDOWS:
            e[w][i] = r(getattr(row, f"ssp245_{w}"))
    med = dist.groupby(["admin", "indicator"])[["base"] + [f"ssp245_{w}" for w in WINDOWS]].median().reset_index()
    for row in med.itertuples():
        if row.indicator not in WEIGHTS:
            continue
        e = ind[row.indicator]["median"]
        i = pos[row.admin]
        e["base"][i] = r(row.base)
        for w in WINDOWS:
            e[w][i] = r(getattr(row, f"ssp245_{w}"))

    ch = pd.read_csv(MI / "model_changes.csv")
    ch["window"] = ch["window"].astype(str)
    ch = ch[ch["admin"].isin(pos)]
    chg = {k: {s: {w: blank() for w in WINDOWS} for s in sources} for k in WEIGHTS}
    for row in ch.itertuples():
        chg[row.indicator][row.model][row.window][pos[row.admin]] = r(row.change)

    mm = pd.read_csv(MI / "multimodel.csv")
    mm["window"] = mm["window"].astype(str)
    mm = mm[mm["admin"].isin(pos)]
    agree = {k: {w: blank() for w in WINDOWS} for k in WEIGHTS}
    rng = {k: {w: blank() for w in WINDOWS} for k in WEIGHTS}
    for row in mm.itertuples():
        i = pos[row.admin]
        chg[row.indicator]["median"][row.window][i] = r(row.change_med)
        agree[row.indicator][row.window][i] = [int(row.n_adverse), int(row.n_worse)]
        rng[row.indicator][row.window][i] = [r(row.change_min), r(row.change_max)]

    # aggregates
    agg = {s: {w: [dict() for _ in range(N)] for w in WINDOWS} for s in sources}
    apm = pd.read_csv(MI / "atlas_index_per_model.csv")
    apm["window"] = apm["window"].astype(str)
    for row in apm[apm["admin"].isin(pos)].itertuples():
        agg[row.model][row.window][pos[row.admin]].update(ai=r(row.index), ac=ATLAS[row.code + 2])
    amm = pd.read_csv(MI / "atlas_index.csv")
    amm["window"] = amm["window"].astype(str)
    for row in amm[amm["admin"].isin(pos)].itertuples():
        agg["median"][row.window][pos[row.admin]].update(ai=r(row.index_med), ac=row.category, nu=int(row.n_unfav), nf=int(row.n_fav))

    ch["w"] = ch["indicator"].map(WEIGHTS)
    ch["ww"] = ch["w"] * (ch["worse"] & ch["valid"])
    ch["wv"] = ch["w"] * ch["valid"]
    sh = ch.groupby(["model", "admin", "window"])[["ww", "wv"]].sum()
    sh = (sh["ww"] / sh["wv"] * 100).reset_index(name="share")
    for row in sh.itertuples():
        agg[row.model][row.window][pos[row.admin]].update(ts=r(row.share), tc=abs_class(row.share))
    for m in models:
        for w in WINDOWS:
            sub = ch[(ch["model"] == m) & (ch["window"] == w)].pivot_table(index="admin", columns="indicator", values="adverse")
            score = (sub.rank(pct=True) * 100 * pd.Series(WEIGHTS)).sum(axis=1) / sum(WEIGHTS.values())
            cuts = np.percentile(score, [20, 40, 60, 80])
            mu, sd = score.mean(), score.std(ddof=0)
            for a, v in score.items():
                z = (v - mu) / sd
                agg[m][w][pos[a]].update(rs=r(v), rq=QUINT[int(np.searchsorted(cuts, v, "right"))],
                                        rd="Very high" if z > 1.5 else "High" if z > 0.5 else "Medium" if z > -0.5 else "Low" if z > -1.5 else "Very low")

    stats = json.loads(STATS.read_text())
    amm_all = amm.set_index(["admin", "window"])
    for key, feat in stats.items():
        mmx = feat.get("climate_hazard", {}).get("multimodel")
        if not mmx:
            continue
        for w in WINDOWS:
            a = mmx["aggregate"].get(w)
            if a is None or (key, w) not in amm_all.index:
                continue
            row = amm_all.loc[(key, w)]
            a["atlas"] = {"index": r(row["index_med"]), "category": row["category"], "n_unfav": int(row["n_unfav"]), "n_fav": int(row["n_fav"])}
            if key in pos:
                i = pos[key]
                agg["median"][w][i].update(ts=a["absolute"]["share"], tc=a["absolute"]["category"], nm=a["absolute"]["n_moderate"],
                                           rs=a["relative"]["score"], rq=a["relative"]["quintile"], rd=a["relative"]["sd_class"])
    STATS.write_text(json.dumps(stats, separators=(",", ":")))

    scale = {}
    for k in WEIGHTS:
        vals = np.array([v for s in sources for w in ["base"] + WINDOWS for v in ind[k][s][w] if v is not None], float)
        chs = np.array([v for s in sources for w in WINDOWS for v in chg[k][s][w] if v is not None], float)
        lo, hi = np.percentile(vals, [2, 98])
        scale[k] = {"vmin": r(lo), "vmax": r(hi), "amax": r(max(np.percentile(np.abs(chs), 98), 1e-6))}

    out = {"admins": [a.split(":", 1)[1] for a in admins], "sources": sources, "windows": WINDOWS, "pct": sorted(PCT),
           "weights": WEIGHTS, "ind": ind, "chg": chg, "agree": agree, "rng": rng, "agg": agg, "scale": scale}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT.name}: {N} districts, {len(sources)} sources, {OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
