/* ==========================================================================
   CRVA weighting results (facilitator view). Needs the admin key from the
   Settings tab of the Google Sheet. Reads the latest submission per expert
   and round; never writes. Round, open/closed and the indicator list are
   managed in the Sheet itself.
   ========================================================================== */
const ENDPOINT = (window.CRVA_ENDPOINT || "").trim();
const COLOR = { HF: "var(--hf)", HH: "var(--hh)", E: "var(--e)", S: "var(--s)", AC: "var(--ac)", H: "var(--hf)", V: "var(--s)" };
const TITLE = { HF: "Future hazard", HH: "Historical hazard", E: "Exposure", S: "Sensitivity", AC: "Adaptive capacity" };
const WORD = { HF: "hazard", HH: "hazard", E: "exposure", S: "sensitivity", AC: "adaptive capacity" };
const R = { data: null, key: "", filters: { round: 1, group: "all", region: "all", quality: "all" }, boot: null, err: "" };

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pct(x, d = 1) { return x == null || !isFinite(x) ? "–" : (x * 100).toFixed(d) + "%"; }
function fmt(x, d = 1) { return x == null || !isFinite(x) ? "–" : (+x).toFixed(d); }
function $(s) { return document.querySelector(s); }
function inds(sub) { return R.data.indicators.filter(i => i.status !== "retired" && (!sub || i.sub === sub)); }
function dirText(i) { return i.dir === "-" ? `↓ lowers ${WORD[i.sub]}` : `↑ raises ${WORD[i.sub]}`; }

/* ---------- load ---------- */
async function load(key) {
  R.err = ""; render("Loading results…");
  try {
    const r = await (await fetch(ENDPOINT + "?" + new URLSearchParams({ action: "export", key }))).json();
    if (!r.ok) { R.err = r.error === "bad_key" ? "That key does not match the adminKey in the Settings tab." : "The backend replied: " + r.error; R.data = null; }
    else { R.data = r; R.key = key; try { sessionStorage.setItem("crva-admin-key", key); } catch (e) {} R.filters.round = r.settings.activeRound; R.boot = null; }
  } catch (e) { R.err = "Could not reach the backend. Check endpoint.js and that the web app is deployed for Anyone."; }
  render();
}

/* ---------- rows for analysis ---------- */
function quality(p) {
  const flags = [];
  if (p.activeSeconds && p.activeSeconds < 240) flags.push("fast");
  const nums = Object.values(p.ratings || {}).filter(x => typeof x === "number");
  if (nums.length >= 10 && new Set(nums).size === 1) flags.push("straight-line");
  return flags;
}
function rowsFor(round, f = R.filters) {
  return (R.data.rounds[round] || []).map(p => ({ id: p.respondent, profile: p.profile || {}, round: p, q: quality(p) }))
    .filter(x => (f.group === "all" || x.profile.group === f.group) && (f.region === "all" || (x.profile.regions || []).includes(f.region)) && (f.quality === "all" || !x.q.length));
}

/* ---------- statistics ---------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* Percentile bootstrap over experts (B resamples, fixed seed so results are reproducible). */
function bootstrap(rows, B = 1000) {
  const rnd = rng(20261006), ids = inds().map(i => i.id), g = {}, w = {}; ids.forEach(id => { g[id] = []; w[id] = []; });
  for (let b = 0; b < B; b++) {
    const smp = rows.map(() => rows[Math.floor(rnd() * rows.length)]), a = aggregate(smp, R.data.indicators);
    ids.forEach(id => { const st = a.indicators[id]; if (st && st.global != null) { g[id].push(st.global); w[id].push(st.within); } });
  }
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
  const out = {}; ids.forEach(id => { out[id] = { g: [q(g[id], 0.025), q(g[id], 0.975)], w: [q(w[id], 0.025), q(w[id], 0.975)] }; });
  return out;
}
function ranks(v) { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = Array(v.length); let i = 0;
  while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[o[k][1]] = avg; i = j + 1; } return r; }
/* Kendall's W with tie correction, over experts who gave a numeric rating to every indicator in the component. */
function kendallW(rows, sub) {
  const l = inds(sub), m = rows.filter(x => !x.round.skip?.[sub] && l.every(i => typeof x.round.ratings?.[i.id] === "number"));
  const n = l.length; if (m.length < 3 || n < 3) return { W: null, m: m.length };
  const Rsum = Array(n).fill(0); let T = 0;
  m.forEach(x => { const v = l.map(i => x.round.ratings[i.id]); ranks(v).forEach((rk, k) => { Rsum[k] += rk; });
    const c = {}; v.forEach(y => { c[y] = (c[y] || 0) + 1; }); Object.values(c).forEach(t => { T += t ** 3 - t; }); });
  const mean = Rsum.reduce((a, b) => a + b, 0) / n, Ssq = Rsum.reduce((a, b) => a + (b - mean) ** 2, 0), M = m.length;
  const den = M * M * (n ** 3 - n) - M * T; return { W: den > 0 ? 12 * Ssq / den : null, m: M };
}
function spearman(a, b) { const ra = ranks(a), rb = ranks(b), n = a.length, ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; } return num / Math.sqrt(da * db); }
/* Familiarity-weighted variant: each expert's within-component weights count 1 / 2 / 3 by self-rated familiarity. */
function familiarityWeighted(rows) {
  const base = aggregate(rows, R.data.indicators), out = {};
  for (const s of SUB_ORDER) {
    const l = inds(s), raw = {};
    l.forEach(i => { let num = 0, den = 0; rows.forEach(x => { const f = x.round.familiarity?.[s]; if (f === "skip" || !f) return; const ew = expertWeights(x.round, R.data.indicators).within[i.id]; if (typeof ew === "number") { num += f * ew; den += f; } }); raw[i.id] = den ? num / den : 0; });
    const tot = Object.values(raw).reduce((a, b) => a + b, 0); l.forEach(i => { out[i.id] = tot ? raw[i.id] / tot * base.subShare[s] : 0; });
  }
  const ids = inds().map(i => i.id); return { rho: spearman(ids.map(id => base.indicators[id].global || 0), ids.map(id => out[id])), g: out };
}

/* ---------- render ---------- */
function render(msg) {
  const app = document.getElementById("app");
  const head = `<header class="top"><div class="wrap"><div class="brand"><span class="eyebrow">India CRVA · Facilitators</span><h1>Indicator weighting results</h1></div>
    ${R.data ? `<span class="pill live"><span class="dot"></span>Round ${R.data.settings.activeRound} active · ${R.data.settings.open ? "open" : "closed"}</span><button class="btn small" data-act="refresh">Refresh</button>` : ""}</div></header>`;
  if (!ENDPOINT) { app.innerHTML = head + `<main class="wrap"><div class="center-msg"><div class="stack" style="max-width:520px"><h2>No backend configured</h2><p class="muted">Add the Apps Script web app URL to endpoint.js, then reload.</p></div></div></main>`; return; }
  if (msg) { app.innerHTML = head + `<main class="wrap"><div class="center-msg"><p class="muted">${esc(msg)}</p></div></main>`; return; }
  if (!R.data) { app.innerHTML = head + `<main class="wrap"><div class="center-msg"><div class="stack" style="max-width:520px;justify-items:center"><h2>Facilitator access</h2>
    <p class="muted">Paste the adminKey from the Settings tab of the CRVA Google Sheet. It is kept only for this browser tab.</p>${R.err ? `<div class="banner err">${esc(R.err)}</div>` : ""}
    <form class="key-form" id="key-form"><input type="password" id="key-in" aria-label="Admin key" autocomplete="off"><button class="btn primary" type="submit">Open results</button></form></div></div></main>`; return; }
  app.innerHTML = head + `<main class="wrap">${view()}</main><footer class="wrap"><span>FAO · NITI Aayog · TCP/IND/4005 Activity 2.4 · Indicator list ${esc(R.data.settings.version)}</span></footer>`;
}

function view() {
  const f = R.filters, rd = +f.round, d = R.data, rows = rowsFor(rd), agg = aggregate(rows, d.indicators), byId = Object.fromEntries(d.indicators.map(i => [i.id, i]));
  const allRows = rowsFor(rd, { group: "all", region: "all", quality: "all" });
  const invited = d.invitations.length, flagged = allRows.filter(x => x.q.length).length;
  const drafts = d.drafts.filter(x => +x.round === rd && !allRows.some(r => r.id === x.respondent)).length;
  const groups = new Set(rows.map(x => x.profile.group).filter(Boolean)), regions = new Set(rows.flatMap(x => x.profile.regions || []));
  const flags = {}; const suggestions = [];
  rows.forEach(x => { for (const [id, fl] of Object.entries(x.round.flags || {})) (flags[id] ||= []).push({ ...fl, group: x.profile.group }); (x.round.suggestions || []).forEach(s => suggestions.push({ ...s, group: x.profile.group })); });
  const toDiscuss = inds().map(i => ({ i, st: agg.indicators[i.id] })).filter(x => ["discuss", "drop", "promote"].includes(x.st.status.key)).sort((a, b) => (b.st.rating.iqr ?? 0) - (a.st.rating.iqr ?? 0));
  const bootKey = JSON.stringify(f) + rows.length; const ci = R.boot && R.boot.key === bootKey ? R.boot.ci : null;
  const filters = `<div class="filters">
    <label class="field">Round<select id="fl-round" data-k="round">${[1, 2, 3].map(n => `<option value="${n}" ${rd === n ? "selected" : ""}>Round ${n} (${(d.rounds[n] || []).length})</option>`).join("")}</select></label>
    <label class="field">Organisation type<select id="fl-group" data-k="group"><option value="all">All</option>${d.groups.map(g => `<option ${f.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
    <label class="field">Region<select id="fl-region" data-k="region"><option value="all">All</option>${d.regions.map(g => `<option ${f.region === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
    <label class="field">Data quality<select id="fl-quality" data-k="quality"><option value="all">All submissions</option><option value="clean" ${f.quality === "clean" ? "selected" : ""}>Exclude flagged</option></select></label></div>`;
  const exports = `<div class="row"><button class="btn" data-act="exportweights">Download weights (JSON)</button><button class="btn" data-act="exportcsv">Download ratings (CSV)</button>
    <button class="btn" data-act="boot" ${rows.length < 5 ? "disabled" : ""}>${ci ? "Bootstrap intervals shown" : "Compute 95% bootstrap intervals"}</button></div>
    <p class="tiny muted">Round, open/closed and the indicator list are changed in the Google Sheet (Settings and Indicators tabs). Refresh to see the change here.</p>`;
  if (!rows.length) return `<section class="section"><h2>Results · round ${rd}</h2>${filters}<div class="empty"><b>No submitted responses for round ${rd}${f.group !== "all" || f.region !== "all" ? " with these filters" : ""} yet.</b><br><span class="small">${invited ? `${invited} invited · ` : ""}${drafts} in progress.</span></div></section>`;
  const strip = (vals, ref, c) => `<div class="strip"><div class="ref" style="left:${ref}%"></div>${vals.map(v => `<div class="d" style="left:${Math.max(0, Math.min(100, v))}%;--c:${c}"></div>`).join("")}${vals.length ? `<div class="md" style="left:${summary(vals).median}%"></div>` : ""}</div>`;
  const compRow = (name, c, vals, st, ref) => `<div class="comprow"><span style="font-weight:600"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};margin-right:6px"></span>${name}</span>
     <div>${strip(vals, ref, c)}<div class="axis"><span>0</span><span>50</span><span>100</span></div></div><span class="small"><b class="num">${fmt(st.mean, 0)}</b> <span class="muted">mean · IQR <span class="num">${fmt(st.q1, 0)}–${fmt(st.q3, 0)}</span></span></span></div>`;
  const alloc = rows.map(x => normAlloc(x.round.comp)).filter(Boolean);
  const kw = Object.fromEntries(SUB_ORDER.map(s => [s, kendallW(rows, s)]));
  const fw = rows.length >= 3 ? familiarityWeighted(rows) : null;
  const prevRows = rd > 1 ? rowsFor(rd - 1) : [], prevAgg = prevRows.length ? aggregate(prevRows, d.indicators) : null;
  let stab = "";
  if (prevAgg) {
    const ids = inds().map(i => i.id), iq = a => summary(ids.map(id => a.indicators[id].rating.iqr)).median, cons = a => ids.filter(id => a.indicators[id].status.key === "agree").length;
    const mad = ids.reduce((s, id) => s + Math.abs((agg.indicators[id].global || 0) - (prevAgg.indicators[id].global || 0)), 0) / ids.length;
    stab = `<div class="card stack"><h3>Change from round ${rd - 1}</h3><div class="tiles">
      <div class="tile"><span class="eyebrow">Median rating IQR</span><span class="v">${fmt(iq(prevAgg))} → ${fmt(iq(agg))}</span></div>
      <div class="tile"><span class="eyebrow">Indicators at consensus</span><span class="v">${cons(prevAgg)} → ${cons(agg)}<small>of ${ids.length}</small></span></div>
      <div class="tile"><span class="eyebrow">Mean change in weight</span><span class="v">${fmt(mad * 100, 2)}<small>points of risk share</small></span></div></div>
      <p class="tiny muted">Stopping rule (pre-specified): accept the round when the median IQR stops shrinking and mean weight change is under 0.25 points; otherwise discuss the remaining contested indicators.</p></div>`;
  }
  const subTable = s => {
    const l = inds(s), eq = 1 / l.length, mx = Math.max(eq * 1.5, ...l.map(i => agg.indicators[i.id]?.wq3 ?? 0), ...l.map(i => agg.indicators[i.id]?.within ?? 0)), sc = x => (x / mx * 100).toFixed(1);
    return `<div class="stack"><div class="row" style="justify-content:space-between"><h3 style="color:${COLOR[s]}">${TITLE[s]}</h3>
      <span class="small muted">${pct(agg.subs[s].share)} of risk · ${agg.subs[s].skipped} skipped · Kendall's W ${kw[s].W == null ? "–" : fmt(kw[s].W, 2)} (m=${kw[s].m})</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Indicator</th><th class="wcell">Weight within component</th><th style="text-align:right">Within</th><th style="text-align:right">Of risk${ci ? " (95% CI)" : ""}</th><th style="text-align:right">Median</th><th style="text-align:right">IQR</th><th style="text-align:right">Excl.</th><th style="text-align:right">n</th><th style="text-align:right">Flags</th><th>Status</th></tr></thead>
      <tbody>${l.map(i => { const st = agg.indicators[i.id]; return `<tr><td>${esc(i.label)}${i.status === "candidate" ? ' <span class="tag cand">proposed</span>' : ""}<div class="tiny muted">${esc(dirText(i))}</div></td>
        <td class="wcell"><div class="wviz" style="--c:${COLOR[s]}"><div class="bar" style="width:${sc(st.within || 0)}%"></div>${st.wq1 != null ? `<div class="iqr" style="left:${sc(st.wq1)}%;width:${Math.max(0, sc(st.wq3) - sc(st.wq1))}%"></div>` : ""}<div class="eq" style="left:${sc(eq)}%"></div></div></td>
        <td class="n">${pct(st.within)}</td><td class="n">${pct(st.global, 2)}${ci ? `<div class="ci">${pct(ci[i.id].g[0], 2)}–${pct(ci[i.id].g[1], 2)}</div>` : ""}</td><td class="n">${fmt(st.rating.median)}</td><td class="n">${fmt(st.rating.iqr)}</td>
        <td class="n">${pct(st.pctExclude, 0)}</td><td class="n">${st.nRated}${st.nNotSure ? `<span class="muted">+${st.nNotSure}?</span>` : ""}</td><td class="n">${(flags[i.id] || []).length || ""}</td><td><span class="status ${st.status.key}">${st.status.label}</span></td></tr>`; }).join("")}</tbody></table></div>
      <p class="tiny muted">Bar: mean of experts' normalised weights. Whisker: interquartile range across experts. Dashed line: equal weights (${pct(eq)}). Kendall's W: agreement on the ranking of indicators (0 none, 1 complete), over experts who rated every indicator.</p></div>`;
  };
  return `<section class="section">
    <div class="row" style="justify-content:space-between"><h2>Results · round ${rd}</h2><span class="small muted">Latest submission per expert counts.</span></div>
    ${filters}${exports}
    <div class="tiles">
      <div class="tile"><span class="eyebrow">Submitted</span><span class="v">${rows.length}<small>${invited ? `of ${invited} invited (${pct(allRows.length / invited, 0)})` : "responses"}</small></span></div>
      <div class="tile"><span class="eyebrow">In progress</span><span class="v">${drafts}<small>drafts</small></span></div>
      <div class="tile"><span class="eyebrow">Organisation types</span><span class="v">${groups.size}<small>of ${d.groups.length}</small></span></div>
      <div class="tile"><span class="eyebrow">Regions covered</span><span class="v">${regions.size}<small>of ${d.regions.length}</small></span></div>
      <div class="tile"><span class="eyebrow">Quality flags</span><span class="v">${flagged}<small>fast or straight-lined</small></span></div>
      <div class="tile"><span class="eyebrow">To discuss</span><span class="v">${toDiscuss.length}<small>indicators</small></span></div></div>
    <div class="card stack" style="gap:14px"><h3>Component weights</h3><p class="small muted">Each dot is one expert. Black bar is the median, dashed line is equal weights.</p><div class="complist">
      ${compRow("Hazard", COLOR.H, alloc.map(a => a.H * 100), agg.comp.H, 33.33)}${compRow("Exposure", COLOR.E, alloc.map(a => a.E * 100), agg.comp.E, 33.33)}${compRow("Vulnerability", COLOR.V, alloc.map(a => a.V * 100), agg.comp.V, 33.33)}
      <hr class="hr">${compRow("Future share of hazard", COLOR.HF, rows.map(x => x.round.split?.HF), agg.split.HF, 50)}${compRow("Sensitivity share of vulnerability", COLOR.S, rows.map(x => x.round.split?.S), agg.split.S, 50)}</div></div>
    ${stab}
    <div class="card stack"><h3>Robustness</h3><div class="tiles">
      <div class="tile"><span class="eyebrow">Familiarity-weighted vs default</span><span class="v">${fw ? fmt(fw.rho, 2) : "–"}<small>Spearman ρ of indicator weights</small></span></div>
      <div class="tile"><span class="eyebrow">Agreement on rankings</span><span class="v">${fmt(summary(SUB_ORDER.map(s => kw[s].W)).median, 2)}<small>median Kendall's W</small></span></div></div>
      <p class="tiny muted">ρ near 1 means giving more say to experts who rated themselves more familiar would barely change the weights. Bootstrap intervals resample experts 1,000 times with a fixed seed, so the same data always gives the same intervals.</p></div>
    <div class="card stack"><h3>Agenda for discussion</h3><p class="small muted">Rating IQR of 2 or more, or 25–49% voting to exclude (Discuss); 50% or more exclude (Drop?); proposed indicators with median 3 or more and under 25% exclude (Promote).</p>
      ${toDiscuss.length ? `<div class="tbl-wrap"><table><thead><tr><th>Indicator</th><th>Component</th><th style="text-align:right">Median</th><th style="text-align:right">IQR</th><th style="text-align:right">Excl.</th><th style="text-align:right">Flags</th><th>Status</th></tr></thead><tbody>
        ${toDiscuss.map(({ i, st }) => `<tr><td>${esc(i.label)}</td><td>${TITLE[i.sub]}</td><td class="n">${fmt(st.rating.median)}</td><td class="n">${fmt(st.rating.iqr)}</td><td class="n">${pct(st.pctExclude, 0)}</td><td class="n">${(flags[i.id] || []).length || ""}</td><td><span class="status ${st.status.key}">${st.status.label}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">Nothing contested with these filters.</p>`}</div>
    <div class="card stack"><h3>Strongest drivers of risk</h3><p class="small muted">Top 15 indicators by share of the whole risk score.</p>
      <div class="wbars">${agg.globalRank.slice(0, 15).map(x => wbar(byId[x.id].label + " · " + TITLE[byId[x.id].sub], x.g, COLOR[byId[x.id].sub], agg.globalRank[0].g)).join("")}</div>
      <p class="tiny muted">Components with fewer indicators give each of their indicators a larger share, so compare drivers within a component as well as across.</p></div>
    ${SUB_ORDER.map(subTable).join("")}
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))">
      <div class="card stack"><h3>Flags and comments</h3>${Object.keys(flags).length ? `<div class="list">${Object.entries(flags).map(([id, fl]) => `<div class="item"><b>${esc(byId[id]?.label || id)}</b>
        <span class="small muted">${Object.entries(fl.flatMap(x => x.reasons || []).reduce((a, r) => (a[r] = (a[r] || 0) + 1, a), {})).map(([r, n]) => `${esc(r)} (${n})`).join(" · ")}</span>
        ${fl.filter(x => x.note).map(x => `<span class="small">“${esc(x.note)}” <span class="muted">· ${esc(x.group || "")}</span></span>`).join("")}</div>`).join("")}</div>` : `<p class="small muted">No flags yet.</p>`}</div>
      <div class="card stack"><h3>Suggested indicators</h3>${suggestions.length ? `<div class="list">${suggestions.map(s => `<div class="item"><div class="row" style="justify-content:space-between"><b>${esc(s.label)}</b><span class="tag">${TITLE[s.sub] || esc(s.sub)}</span></div>
        <span class="small muted">${esc(s.unit)} · ${s.dir === "+" ? "raises" : "lowers"} · ${esc(s.source)}</span><span class="small">${esc(s.why)}</span></div>`).join("")}</div>
        <p class="tiny muted">To adopt one, add it as a row in the Indicators tab with status "candidate".</p>` : `<p class="small muted">No suggestions yet.</p>`}</div></div></section>`;
}
function wbar(label, v, c, max) { const w = v == null ? 0 : Math.min(100, v / max * 100);
  return `<div class="wbar" style="--c:${c}"><span class="lbl" title="${esc(label)}">${esc(label)}</span><span class="val num">${pct(v, 1)}</span><div class="trk"><div class="fill" style="width:${w}%"></div></div></div>`; }

/* ---------- exports ---------- */
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function weightsJSON() {
  const rd = +R.filters.round, rows = rowsFor(rd), agg = aggregate(rows, R.data.indicators), ci = R.boot?.ci;
  return JSON.stringify({ generated: new Date().toISOString(), round: rd, filters: R.filters, n_experts: rows.length, indicator_list: R.data.settings.version,
    method: "Per-expert ratings normalised within component; group weight = mean of expert weights, renormalised. Global = component share x split x within. 95% CI: percentile bootstrap over experts, B=1000, seed 20261006.",
    components: { hazard: agg.comp.H.mean / 100, exposure: agg.comp.E.mean / 100, vulnerability: agg.comp.V.mean / 100, future_share_of_hazard: agg.split.HF.mean / 100, sensitivity_share_of_vulnerability: agg.split.S.mean / 100 },
    agreement_kendall_w: Object.fromEntries(SUB_ORDER.map(s => [s, kendallW(rows, s).W])),
    indicators: inds().map(i => { const st = agg.indicators[i.id]; return { id: i.id, label: i.label, component: i.sub, direction: i.dir, status: i.status, weight_within: st.within, weight_global: st.global,
      weight_global_ci95: ci ? ci[i.id].g : null, weight_iqr: [st.wq1, st.wq3], median_rating: st.rating.median, rating_iqr: st.rating.iqr, pct_exclude: st.pctExclude, n_rated: st.nRated, n_not_sure: st.nNotSure, consensus: st.status.key }; }) }, null, 2);
}
function ratingsCSV() {
  const rd = +R.filters.round, rows = rowsFor(rd), q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ["respondent", "org_type", "regions", "round", "quality_flags", "active_seconds", "alloc_hazard", "alloc_exposure", "alloc_vulnerability", "future_share_of_hazard", "sensitivity_share_of_vulnerability", "component", "familiarity", "indicator_id", "indicator", "status", "rating", "position_shown", "flag_reasons", "flag_note"];
  const out = [head.join(",")];
  rows.forEach(x => inds().forEach(i => { const v = x.round.ratings?.[i.id], fl = x.round.flags?.[i.id];
    out.push([x.id, x.profile.group, (x.profile.regions || []).join("; "), rd, x.q.join("; "), x.round.activeSeconds, x.round.comp?.H, x.round.comp?.E, x.round.comp?.V, x.round.split?.HF, x.round.split?.S,
      i.sub, x.round.familiarity?.[i.sub] ?? "", i.id, i.label, i.status, v === null ? "NS" : v ?? "", x.round.order?.[i.id] ?? "", (fl?.reasons || []).join("; "), fl?.note || ""].map(q).join(",")); }));
  return out.join("\n");
}

/* ---------- events ---------- */
document.addEventListener("submit", e => { if (e.target.id === "key-form") { e.preventDefault(); const k = $("#key-in").value.trim(); if (k) load(k); } });
document.addEventListener("change", e => { const k = e.target.dataset?.k; if (!k) return; R.filters[k] = k === "round" ? +e.target.value : e.target.value; render(); });
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  if (t.dataset.act === "refresh") load(R.key);
  if (t.dataset.act === "exportweights") download(`crva-weights-round${R.filters.round}.json`, weightsJSON(), "application/json");
  if (t.dataset.act === "exportcsv") download(`crva-ratings-round${R.filters.round}.csv`, ratingsCSV(), "text/csv");
  if (t.dataset.act === "boot") { t.textContent = "Computing…"; setTimeout(() => { const rows = rowsFor(+R.filters.round); R.boot = { key: JSON.stringify(R.filters) + rows.length, ci: bootstrap(rows) }; render(); }, 30); }
});
(() => { let k = ""; try { k = sessionStorage.getItem("crva-admin-key") || ""; } catch (e) {} if (k && ENDPOINT) load(k); else render(); })();
