/* ==========================================================================
   WEIGHTING MATHS (pure functions, no DOM)
   Expert j gives:  allocation A_j = {H, E, V} (100 points),
                    hazard split f_j = share of hazard to FUTURE hazard (0–100),
                    vulnerability split s_j = share of vulnerability to SENSITIVITY (0–100),
                    ratings r_ij in 0..5 (null = not sure), per sub-component.
   Within a sub-component, each expert's ratings are normalised to sum to 1
   (w_ij = r_ij / Σ r_j), so every expert counts equally regardless of how
   generously they rate. Group weight = mean over experts of w_ij, renormalised.
   Global weight = component share × split share × within-component weight.
   ========================================================================== */
const SUBS = {
  HF: { comp: "H", label: "Future hazard" },
  HH: { comp: "H", label: "Historical hazard" },
  E:  { comp: "E", label: "Exposure" },
  S:  { comp: "V", label: "Sensitivity" },
  AC: { comp: "V", label: "Adaptive capacity" }
};
const SUB_ORDER = ["HF", "HH", "E", "S", "AC"];

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function summary(values) {
  const v = values.filter(x => typeof x === "number" && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, median: null, q1: null, q3: null, iqr: null, min: null, max: null };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const q1 = quantile(v, 0.25), q3 = quantile(v, 0.75);
  return { n: v.length, mean, median: quantile(v, 0.5), q1, q3, iqr: q3 - q1, min: v[0], max: v[v.length - 1] };
}

/* Normalise a 3-way allocation so it sums to 100 (guards rounding drift). */
function normAlloc(a) {
  const H = +a?.H || 0, E = +a?.E || 0, V = +a?.V || 0, t = H + E + V;
  if (t <= 0) return null;
  return { H: H / t, E: E / t, V: V / t };
}

/* One expert's implied weights (used for the live preview and for aggregation). */
function expertWeights(round, indicators) {
  const out = { within: {}, global: {}, comp: null, f: null, s: null };
  if (!round) return out;
  const comp = normAlloc(round.comp) || { H: 1 / 3, E: 1 / 3, V: 1 / 3 };
  const f = (round.split?.HF ?? 50) / 100, s = (round.split?.S ?? 50) / 100;
  out.comp = comp; out.f = f; out.s = s;
  const subShare = { HF: comp.H * f, HH: comp.H * (1 - f), E: comp.E, S: comp.V * s, AC: comp.V * (1 - s) };
  for (const sub of SUB_ORDER) {
    if (round.skip?.[sub]) continue;
    const inds = indicators.filter(i => i.sub === sub && i.status !== "retired");
    const rated = inds.filter(i => typeof round.ratings?.[i.id] === "number");
    const total = rated.reduce((a, i) => a + round.ratings[i.id], 0);
    if (total <= 0) continue;
    for (const i of rated) {
      const w = round.ratings[i.id] / total;
      out.within[i.id] = w;
      out.global[i.id] = w * subShare[sub];
    }
  }
  return out;
}

/* Status rules shown to facilitators. Thresholds are deliberately simple and stated. */
function statusFor(st, ind) {
  if (st.nRated < 3) return { key: "few", label: "Too few ratings" };
  if (st.pctExclude >= 0.5) return { key: "drop", label: "Drop?" };
  if (ind.status === "candidate" && st.rating.median >= 3 && st.pctExclude < 0.25) return { key: "promote", label: "Promote" };
  if (st.rating.iqr >= 2 || (st.pctExclude >= 0.25 && st.pctExclude < 0.5)) return { key: "discuss", label: "Discuss" };
  return { key: "agree", label: "Consensus" };
}

/* Aggregate many experts' rounds. `rounds` = [{profile, round}] already filtered. */
function aggregate(rounds, indicators) {
  const active = indicators.filter(i => i.status !== "retired");
  const res = { n: rounds.length, comp: {}, split: {}, subs: {}, indicators: {}, globalRank: [] };
  const alloc = rounds.map(r => normAlloc(r.round.comp)).filter(Boolean);
  for (const k of ["H", "E", "V"]) res.comp[k] = summary(alloc.map(a => a[k] * 100));
  res.split.HF = summary(rounds.map(r => r.round.split?.HF));
  res.split.S = summary(rounds.map(r => r.round.split?.S));
  const cm = { H: (res.comp.H.mean ?? 33.3) / 100, E: (res.comp.E.mean ?? 33.3) / 100, V: (res.comp.V.mean ?? 33.3) / 100 };
  const ct = cm.H + cm.E + cm.V; cm.H /= ct; cm.E /= ct; cm.V /= ct;
  const f = (res.split.HF.mean ?? 50) / 100, s = (res.split.S.mean ?? 50) / 100;
  const subShare = { HF: cm.H * f, HH: cm.H * (1 - f), E: cm.E, S: cm.V * s, AC: cm.V * (1 - s) };
  res.subShare = subShare;

  const perExpert = rounds.map(r => expertWeights(r.round, indicators));
  for (const sub of SUB_ORDER) {
    const inds = active.filter(i => i.sub === sub);
    const raw = {};
    for (const i of inds) {
      const ratings = rounds.filter(r => !r.round.skip?.[sub]).map(r => r.round.ratings?.[i.id]);
      const numeric = ratings.filter(x => typeof x === "number");
      const ws = perExpert.map(p => p.within[i.id]).filter(x => typeof x === "number");
      const st = {
        rating: summary(numeric),
        nRated: numeric.length,
        nNotSure: ratings.filter(x => x === null).length,
        pctExclude: numeric.length ? numeric.filter(x => x === 0).length / numeric.length : 0,
        weight: summary(ws)
      };
      raw[i.id] = st.weight.mean ?? 0;
      st.status = statusFor(st, i);
      res.indicators[i.id] = st;
    }
    const tot = Object.values(raw).reduce((a, b) => a + b, 0);
    let skipped = rounds.filter(r => r.round.skip?.[sub]).length;
    res.subs[sub] = { share: subShare[sub], skipped, equal: inds.length ? 1 / inds.length : 0 };
    for (const i of inds) {
      const st = res.indicators[i.id];
      st.within = tot > 0 ? raw[i.id] / tot : null;
      st.global = st.within == null ? null : st.within * subShare[sub];
      // IQR of expert-level weights, rescaled the same way so whiskers sit on the bar's scale
      const k = tot > 0 ? 1 / tot : 0;
      st.wq1 = st.weight.q1 == null ? null : st.weight.q1 * k;
      st.wq3 = st.weight.q3 == null ? null : st.weight.q3 * k;
    }
  }
  res.globalRank = active.map(i => ({ id: i.id, g: res.indicators[i.id]?.global ?? 0 })).sort((a, b) => b.g - a.g);
  return res;
}

if (typeof module !== "undefined") module.exports = { SUBS, SUB_ORDER, summary, normAlloc, expertWeights, aggregate, statusFor };
