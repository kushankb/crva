"""
Combine per-model Rama Rao indicators (09_model_indicators.py) across models.

Per admin unit, indicator and SSP2-4.5 window:
  change per model (% for rainfall and rainy days, absolute otherwise)
  median across models, min/max (range), number of models with an adverse change

Aggregates, computed within each model and then combined across models:
  absolute  weighted share (%) of indicators past their worsening threshold;
            median across models, and number of models with share >= 20 %
  relative  weighted mean percentile rank among districts (100 = worst);
            median across models, then quintile and mean ± SD classes

Rules (as in 08_aggregate_hazard.py): rainfall and rainy-day increases are neutral
where the district's baseline annual rainfall (that model) is >= 1500 mm.
All 15 indicators carry their Atlas Table 5c weights: hot days, cold days and
drought are represented properly in single-model data.

Writes model_indicators/multimodel.csv and, in crva_stats.json, each admin
unit's climate_hazard.multimodel.

Run:
  conda run -n ml_trade python 10_multimodel.py              # per-model changes + cross-model combination
  conda run -n ml_trade python 10_multimodel.py --per-model  # per-model changes only (no combination)
"""
import sys
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parents[2]
IND_DIR = Path(__file__).parents[1] / "model_indicators"
STATS = ROOT / "web" / "public" / "data" / "crva_stats.json"
META = ROOT / "web" / "src" / "data" / "multimodel_meta.json"
WINDOWS = ["2047", "2050", "2100"]
WET_MM = 1500

# id: (Atlas weight %, change type, sign +1 increase worse / −1 decrease worse, threshold)
SPEC = {
    "annual_rain":  (10, "pct", -1, 10),
    "june_rain":    (5,  "pct", -1, 10),
    "july_rain":    (15, "pct", -1, 10),
    "rainy_days":   (5,  "pct", -1, 10),
    "tmax":         (6,  "abs", +1, 1.0),
    "tmin":         (6,  "abs", +1, 1.0),
    "hot_days":     (5,  "abs", +1, 5),
    "cold_days":    (3,  "abs", +1, 2),
    "frost":        (2,  "abs", +1, 5),
    "drought":      (12, "abs", +1, 5),
    "dry_spells":   (11, "abs", +1, 1.0),
    "p99_rain":     (5,  "abs", +1, 5.0),
    "events_100mm": (5,  "abs", +1, 0.5),
    "rx1_pct":      (5,  "rel", +1, 10),
    "rx3_pct":      (5,  "rel", +1, 10),
}
RAIN = {"annual_rain", "june_rain", "july_rain", "rainy_days"}
ABS_CLASSES = [(40, "High"), (20, "Moderate"), (0, "Low")]
QUINTILES = ["Very low", "Low", "Medium", "High", "Very high"]
SD_CLASSES = [(1.5, "Very high"), (0.5, "High"), (-0.5, "Medium"), (-1.5, "Low"), (-np.inf, "Very low")]


def abs_class(share):
    if share <= 0:
        return "None"
    return next(label for t, label in ABS_CLASSES if share > t or t == 0)


def main():
    df = pd.concat([pd.read_csv(f) for f in sorted(IND_DIR.glob("*.csv")) if f.stem not in ("multimodel", "model_changes", "atlas_index", "atlas_index_per_model")])
    models = sorted(df["model"].unique())
    print("models:", models)

    wide = df.pivot_table(index=["model", "admin"], columns="indicator", values=["base"] + [f"ssp245_{w}" for w in WINDOWS])
    wet = (wide["base"]["annual_rain"] >= WET_MM)

    recs = []
    for w in WINDOWS:
        fut = wide[f"ssp245_{w}"]
        base = wide["base"]
        for ind, (wt, kind, sign, thr) in SPEC.items():
            b, f = base[ind], fut[ind]
            if kind == "pct":
                chg = (f - b) / b.where(b > 0) * 100
            else:
                chg = f - b
            adverse = chg * sign
            if ind in RAIN:
                adverse = adverse.where(~wet, adverse.clip(lower=0))
            if kind == "rel":
                test = (f - b) / b.where(b.abs() > 1e-9) * 100 * sign
            else:
                test = adverse
            part = pd.DataFrame({"change": chg, "adverse": adverse, "worse": test >= thr, "valid": test.notna()})
            part["indicator"], part["window"] = ind, w
            recs.append(part.reset_index())
    long = pd.concat(recs, ignore_index=True)
    long["district"] = long["admin"].str.startswith("district:")

    weights = {k: v[0] for k, v in SPEC.items()}
    long["weight"] = long["indicator"].map(weights)

    per_model_cols = ["model", "admin", "window", "indicator", "change", "adverse", "worse", "valid"]
    long[per_model_cols].to_csv(IND_DIR / "model_changes.csv", index=False)
    if "--per-model" in sys.argv:
        d = long[long["district"] & (long["window"] == "2050")]
        print(f"wrote model_changes.csv ({len(long)} rows, {len(models)} models)")
        print("\n~2050, districts past threshold (of 773), per model:")
        print(d[d["worse"]].pivot_table(index="indicator", columns="model", values="admin", aggfunc="count", fill_value=0).reindex(list(SPEC)).fillna(0).astype(int).to_string())
        return

    # absolute share per model
    long["w_worse"] = long["weight"] * (long["worse"] & long["valid"])
    long["w_valid"] = long["weight"] * long["valid"]
    share = long.groupby(["model", "admin", "window"])[["w_worse", "w_valid"]].sum()
    share = (share["w_worse"] / share["w_valid"] * 100).rename("share")

    # relative: percentile rank of adverse change among districts, per model, window, indicator
    def ranks(g):
        d = g[g["district"]]["adverse"].dropna().sort_values().to_numpy()
        lo = np.searchsorted(d, g["adverse"].to_numpy(), "left")
        hi = np.searchsorted(d, g["adverse"].to_numpy(), "right")
        r = (lo + hi) / 2 / len(d) * 100
        return pd.Series(np.where(g["adverse"].isna(), np.nan, r), index=g.index)
    long["rank"] = long.groupby(["model", "window", "indicator"], group_keys=False).apply(ranks)
    long["w_rank"] = long["weight"] * long["rank"]
    rel = long.dropna(subset=["rank"]).groupby(["model", "admin", "window"]).apply(lambda g: g["w_rank"].sum() / g["weight"].sum()).rename("score")

    permodel = pd.concat([share, rel], axis=1).reset_index()
    agg = permodel.groupby(["admin", "window"]).agg(
        share_med=("share", "median"), share_min=("share", "min"), share_max=("share", "max"),
        n_moderate=("share", lambda s: int((s >= 20).sum())),
        score_med=("score", "median"), score_min=("score", "min"), score_max=("score", "max"),
        n_models=("share", "count")).reset_index()

    # relative classes from the district distribution of the median score, per window
    agg["quintile"], agg["sd_class"] = None, None
    for w in WINDOWS:
        sel = agg["window"] == w
        dsel = sel & agg["admin"].str.startswith("district:")
        sc = agg.loc[dsel, "score_med"]
        cuts = np.nanpercentile(sc, [20, 40, 60, 80])
        mu, sd = sc.mean(), sc.std(ddof=0)
        agg.loc[sel, "quintile"] = agg.loc[sel, "score_med"].map(lambda v: QUINTILES[int(np.searchsorted(cuts, v, "right"))])
        agg.loc[sel, "sd_class"] = agg.loc[sel, "score_med"].map(lambda v: next(l for t, l in SD_CLASSES if (v - mu) / sd > t))
    agg["abs_class"] = agg["share_med"].map(abs_class)

    # per-indicator cross-model summary
    ind_sum = long.groupby(["admin", "window", "indicator"]).agg(
        change_med=("change", "median"), change_min=("change", "min"), change_max=("change", "max"),
        n_adverse=("adverse", lambda s: int((s > 0).sum())), n_worse=("worse", "sum"), n=("change", "count")).reset_index()
    base_med = df.groupby(["admin", "indicator"])["base"].median().rename("base_med").reset_index()
    ind_sum = ind_sum.merge(base_med, on=["admin", "indicator"], how="left")
    ind_sum.to_csv(IND_DIR / "multimodel.csv", index=False)

    # write into crva_stats.json
    stats = json.loads(STATS.read_text())
    r = lambda v, n=2: None if pd.isna(v) else round(float(v), n)
    out = {}
    for row in ind_sum.itertuples():
        e = out.setdefault(row.admin, {"n_models": len(models), "indicators": {}, "aggregate": {}})
        e["indicators"].setdefault(row.indicator, {"base": r(row.base_med)})[row.window] = {
            "med": r(row.change_med), "min": r(row.change_min), "max": r(row.change_max),
            "n_adverse": int(row.n_adverse), "n_worse": int(row.n_worse)}
    for row in agg.itertuples():
        out[row.admin]["aggregate"][row.window] = {
            "absolute": {"share": r(row.share_med, 1), "min": r(row.share_min, 1), "max": r(row.share_max, 1),
                         "category": row.abs_class, "n_moderate": int(row.n_moderate)},
            "relative": {"score": r(row.score_med, 1), "min": r(row.score_min, 1), "max": r(row.score_max, 1),
                         "quintile": row.quintile, "sd_class": row.sd_class}}
    for k, v in out.items():
        if k in stats:
            stats[k].setdefault("climate_hazard", {})["multimodel"] = v
    STATS.write_text(json.dumps(stats, separators=(",", ":")))
    META.write_text(json.dumps({"models": models, "scenario": "SSP2-4.5", "wet_threshold_mm": WET_MM,
                                "spec": {k: {"weight": v[0], "change": v[1], "sign": v[2], "threshold": v[3]} for k, v in SPEC.items()}}, indent=1))

    # summary
    d = agg[agg["admin"].str.startswith("district:")]
    for w in WINDOWS:
        x = d[d["window"] == w]
        print(f"~{w}: absolute {x['abs_class'].value_counts().to_dict()}  median share {x['share_med'].median():.1f}% "
              f"| districts where >=4 of {len(models)} models say Moderate+: {(x['n_moderate'] >= 4).sum()}")
    di = ind_sum[ind_sum["admin"].str.startswith("district:") & (ind_sum["window"] == "2050")]
    print("\n~2050 per indicator: median change | districts where >=4 models adverse | >=4 models past threshold")
    for ind in SPEC:
        x = di[di["indicator"] == ind]
        print(f"  {ind:13} {x['change_med'].median():8.2f} | {(x['n_adverse'] >= 4).sum():4d} | {(x['n_worse'] >= 4).sum():4d}")


if __name__ == "__main__":
    main()
