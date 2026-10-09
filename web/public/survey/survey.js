/* ==========================================================================
   CRVA indicator weighting survey (expert view).
   Data path: this page -> Google Apps Script web app (survey-backend/Code.gs) -> Google Sheet.
   The indicator list, round and open/closed state come from the Sheet, so adding an
   indicator is adding a row to its Indicators tab.
   ========================================================================== */
const ENDPOINT = (window.CRVA_ENDPOINT || "").trim();
const COLOR = { HF: "var(--hf)", HH: "var(--hh)", E: "var(--e)", S: "var(--s)", AC: "var(--ac)", H: "var(--hf)", V: "var(--s)" };
const SUB_TEXT = {
  HF: { comp: "Hazard", title: "Future hazard", word: "hazard",
        def: "Climate change signals between a historical baseline and the 2030s and 2050s, under SSP2-4.5 and SSP5-8.5, from bias-corrected, downscaled CMIP6.",
        q: "How important is each projected change for the risk to agriculture in a district?" },
  HH: { comp: "Hazard", title: "Historical hazard", word: "hazard",
        def: "The observed incidence of extreme events, from national observational and disaster records.",
        q: "How important is each type of past hazard for the risk to agriculture in a district?" },
  E:  { comp: "Exposure", title: "Exposure", word: "exposure",
        def: "The rural people and agriculture-related livelihoods present that could be adversely affected.",
        q: "How much should each indicator count towards a district's exposure?" },
  S:  { comp: "Vulnerability", title: "Sensitivity", word: "sensitivity",
        def: "Inherent weaknesses of the farming system that make it susceptible to harm. Sensitivity raises vulnerability.",
        q: "How much should each indicator count towards a district's sensitivity?" },
  AC: { comp: "Vulnerability", title: "Adaptive capacity", word: "adaptive capacity",
        def: "Inherent strengths that help the system adjust, cope and recover, including GESI indicators. Adaptive capacity lowers vulnerability.",
        q: "How much should each indicator count towards a district's adaptive capacity?" }
};
const STEPS = [
  { key: "about", label: "About you" }, { key: "comp", label: "Risk components" },
  { key: "HF", label: "Future hazard" }, { key: "HH", label: "Historical hazard" },
  { key: "E", label: "Exposure" }, { key: "S", label: "Sensitivity" }, { key: "AC", label: "Adaptive capacity" },
  { key: "review", label: "Review and submit" }
];
const SCALE = [[0, "Exclude", "Should not be in the index"], [1, "1", "Minor"], [2, "2", "Low"], [3, "3", "Moderate"], [4, "4", "High"], [5, "5", "Critical"]];
const FAM = [[1, "Limited"], [2, "Working knowledge"], [3, "Expert"]];
const FLAG_REASONS = ["Direction looks wrong", "Overlaps another indicator", "Data quality or currency", "Belongs in another component", "Only relevant in some regions"];

const S = {
  mode: "loading", config: null, code: "", rid: "", data: null, prev: null, feedback: null,
  step: 0, openFlags: {}, receipt: null, problems: [], saveState: "", lastAct: Date.now(), dirty: false
};

/* ---------- helpers ---------- */
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pct(x, d = 0) { return x == null ? "–" : (x * 100).toFixed(d) + "%"; }
function fmt(x, d = 1) { return x == null ? "–" : (+x).toFixed(d); }
function $(sel) { return document.querySelector(sel); }
function round() { return S.config.activeRound || 1; }
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function draftKey() { return `crva-weighting-${S.rid}-r${round()}`; }
function newData() {
  return { consent: false, profile: { group: "", regions: [], name: "", org: "" }, comp: { H: 34, E: 33, V: 33 }, split: { HF: 50, S: 50 },
    familiarity: {}, ratings: {}, flags: {}, suggestions: [], order: {}, compTouched: false,
    startedAt: new Date().toISOString(), activeSeconds: 0, savedAt: 0 };
}
/* Seeded shuffle so a respondent always sees the same order, recorded with their answers. */
function seeded(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function inds(sub) {
  const list = S.config.indicators.filter(i => i.status !== "retired" && (!sub || i.sub === sub));
  if (!sub || !S.config.randomiseOrder) return list;
  const rnd = seeded(S.rid + "|" + sub), a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function skipOf(d) { const o = {}; for (const s of SUB_ORDER) if (d.familiarity[s] === "skip") o[s] = true; return o; }
function asRound(d) { return { comp: d.comp, split: d.split, ratings: d.ratings, skip: skipOf(d) }; }

/* ---------- backend ---------- */
async function api(params) {
  const r = await fetch(ENDPOINT + "?" + new URLSearchParams(params), { method: "GET" });
  return r.json();
}
async function post(body) {
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  return r.json();
}
function payload() {
  const d = clone(S.data);
  d.skip = skipOf(S.data);
  d.order = {}; for (const s of SUB_ORDER) inds(s).forEach((i, k) => { d.order[i.id] = k + 1; });
  return d;
}
let saving = false;
async function saveDraft() {
  S.data.savedAt = Date.now(); lsSet(draftKey(), S.data);
  if (S.mode !== "live" || saving || !S.dirty || S.data.submitted) return;
  saving = true; S.dirty = false; setSave("Saving…");
  try { const r = await post({ action: "draft", rid: S.rid, round: round(), data: payload() }); setSave(r.ok ? "Draft saved" : "Draft not saved: " + r.error); if (!r.ok) S.dirty = true; }
  catch (e) { S.dirty = true; setSave("Offline: answers kept in this browser"); }
  finally { saving = false; }
}
function setSave(t) { S.saveState = t; const el = $("#save-state"); if (el) el.textContent = t; }
function touch() { S.dirty = true; S.lastAct = Date.now(); lsSet(draftKey(), Object.assign(S.data, { savedAt: Date.now() })); }
setInterval(() => { if (S.data && document.visibilityState === "visible" && Date.now() - S.lastAct < 120000) S.data.activeSeconds += 5; }, 5000);
setInterval(() => { if (S.dirty) saveDraft(); }, 45000);
window.addEventListener("pagehide", () => { if (S.dirty) saveDraft(); });

/* ---------- boot ---------- */
async function boot() {
  const q = new URLSearchParams(location.search);
  S.code = (q.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, "");
  if (!ENDPOINT) {
    S.mode = "demo"; S.config = Object.assign(clone(window.DEFAULT_CONFIG), { requireCode: false, randomiseOrder: true, indicatorHash: "demo" });
  } else {
    try { const c = await api({ action: "config" }); if (!c.ok) throw new Error(c.error); S.config = c; S.mode = "live"; }
    catch (e) { S.mode = "error"; S.error = "The survey could not reach its data store. Check your connection and reload. If it keeps failing, contact the CRVA team."; return render(); }
  }
  if (S.config.requireCode && !S.code) { S.mode = S.mode === "live" ? "needcode" : S.mode; if (S.mode === "needcode") return render(); }
  S.rid = S.code || (lsGet("crva-weighting-rid") || (() => { const r = "W" + Math.random().toString(36).slice(2, 10).toUpperCase(); lsSet("crva-weighting-rid", r); return r; })());
  let server = null;
  if (S.mode === "live") {
    try {
      server = await api({ action: "resume", rid: S.rid, round: round() });
      if (!server.ok && server.error === "unknown_code") { S.mode = "badcode"; return render(); }
    } catch (e) { server = null; }
    if (round() > 1) { try { const f = await api({ action: "feedback", round: round() - 1 }); if (f.ok && f.n >= 3) S.feedback = f; } catch (e) {} }
  }
  const local = lsGet(draftKey());
  const draft = server?.draft, sub = server?.submitted;
  S.prev = server?.previous || null;
  const newest = [local, draft].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  if (sub && !(newest && newest.savedAt > Date.parse(server.submittedAt || 0))) { S.data = Object.assign(newData(), sub, { submitted: true }); S.receipt = { at: server.submittedAt }; S.step = STEPS.length - 1; }
  else if (newest) S.data = Object.assign(newData(), newest);
  else if (S.prev) S.data = Object.assign(newData(), { consent: S.prev.consent, profile: S.prev.profile, comp: S.prev.comp, split: S.prev.split, familiarity: S.prev.familiarity, ratings: clone(S.prev.ratings || {}), flags: {}, compTouched: true });
  else S.data = newData();
  render();
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function render() {
  const app = document.getElementById("app");
  if (S.mode === "error" || S.mode === "needcode" || S.mode === "badcode") { app.innerHTML = shell(gate()); return; }
  if (S.config.open === false && !S.data?.submitted) { app.innerHTML = shell(`<section class="section"><div class="card stack"><h2>The survey is closed</h2><p class="muted">Round ${round()} is not taking responses right now. The CRVA team will contact you when the next round opens.</p></div></section>`); return; }
  app.innerHTML = shell(viewSurvey());
  afterRender();
}
function shell(inner) {
  const pill = S.mode === "live" ? `<span class="pill live"><span class="dot"></span><span id="save-state">${esc(S.saveState || "Saving to the CRVA record")}</span></span>`
    : S.mode === "demo" ? `<span class="pill off"><span class="dot"></span>Preview: nothing is saved</span>` : "";
  return `<header class="top"><div class="wrap">
      <div class="brand"><span class="eyebrow">India CRVA · District climate risk</span><h1>Indicator weighting survey</h1></div>
      ${S.config ? `<span class="pill">Round ${round()}</span>` : ""}${pill}</div></header>
    <main class="wrap">${inner}</main>
    <footer class="wrap"><div class="row" style="justify-content:space-between">
      <span>FAO · NITI Aayog · TCP/IND/4005 Activity 2.4${S.config ? " · Indicator list " + esc(S.config.version || "") : ""}</span>
      <span>Method: IPCC WG II (2014) risk framing, adapted from Rama Rao et al. (2019)</span></div></footer>`;
}
function gate() {
  if (S.mode === "error") return `<div class="center-msg"><div class="stack" style="max-width:480px"><h2>Something went wrong</h2><p class="muted">${esc(S.error)}</p><div><button class="btn primary" data-act="reload">Try again</button></div></div></div>`;
  const msg = S.mode === "badcode" ? "That code is not on the invitation list. Check the link in your invitation email, or type the code below."
    : "This survey is by invitation. Open the personal link from your invitation email, or type the code it contains.";
  return `<div class="center-msg"><div class="stack" style="max-width:520px;justify-items:center"><h2>Enter your invitation code</h2><p class="muted">${msg}</p>
    <form class="key-form" id="code-form"><input type="text" id="code-in" autocomplete="off" aria-label="Invitation code" placeholder="e.g. K7Q2MD" value="${esc(S.code)}"><button class="btn primary" type="submit">Continue</button></form></div></div>`;
}

function stepDone(i) {
  const k = STEPS[i].key, d = S.data;
  if (k === "about") return !!(d.consent && d.profile.group && d.profile.regions.length);
  if (k === "comp") return d.compTouched && total() === 100;
  if (SUB_TEXT[k]) return d.familiarity[k] === "skip" || (!!d.familiarity[k] && inds(k).every(x => d.ratings[x.id] !== undefined));
  if (k === "review") return !!d.submitted;
  return false;
}
function total() { const c = S.data.comp; return c.H + c.E + c.V; }
function viewSurvey() {
  const st = STEPS[S.step];
  const demo = S.mode === "demo" ? `<div class="banner" style="margin-top:16px">Preview mode. No backend is configured, so answers stay in this browser and are not sent anywhere.</div>` : "";
  const stepper = `<nav class="stepper" aria-label="Survey steps">${STEPS.map((s, i) => `
    <button class="step ${stepDone(i) ? "done" : ""}" data-act="go" data-i="${i}" ${i === S.step ? 'aria-current="step"' : ""}>
      <span class="n">${stepDone(i) ? "✓" : i + 1}</span>${SUB_TEXT[s.key] ? `<span class="sw" style="background:${COLOR[s.key]}"></span>` : ""}${esc(s.label)}</button>`).join("")}</nav>`;
  let body = st.key === "about" ? stepAbout() : st.key === "comp" ? stepComp() : SUB_TEXT[st.key] ? stepSub(st.key) : stepReview();
  const blocked = (st.key === "about" && !stepDone(0)) || (st.key === "comp" && total() !== 100);
  const nav = st.key === "review" ? "" : `<div class="navbar"><button class="btn" data-act="prev" ${S.step === 0 ? "disabled" : ""}>Back</button>
      <span class="small muted" id="nav-hint">${st.key === "about" && blocked ? "Give your consent, organisation type and at least one region to continue." : st.key === "comp" && blocked ? "The three shares must total 100 to continue." : ""}</span>
      <button class="btn primary" data-act="next" ${blocked ? "disabled" : ""}>Next: ${esc(STEPS[S.step + 1].label)}</button></div>`;
  return demo + stepper + body + nav;
}

function stepAbout() {
  const d = S.data, p = d.profile, n = inds().length, counts = Object.fromEntries(SUB_ORDER.map(s => [s, inds(s).length]));
  return `<section class="section">
    <div class="stack" style="gap:12px"><h2>Help set the weights for India's district climate risk assessment</h2>
      <p class="lede">FAO and NITI Aayog are classifying every district from Very High to Very Low climate risk to agriculture, and naming the indicators that drive each district's score. Those results feed the CRVA tool, technology prioritisation and the economic modelling. How much each indicator counts is a judgement call, and this survey asks for yours.</p></div>
    <div class="frame" aria-label="Risk framework">${SUB_ORDER.map(s => `<div class="blk" style="--c:${COLOR[s]}"><span class="eyebrow">${esc(SUB_TEXT[s].comp)}</span><b>${esc(SUB_TEXT[s].title)}</b><span>${counts[s]} indicators</span></div>`).join("")}</div>
    <div class="grid2">
      <div class="card stack"><h3>How it works</h3>
        <ol class="small muted" style="margin:0;padding-left:18px;display:grid;gap:6px">
          <li><b style="color:var(--fg)">Split 100 points</b> between hazard, exposure and vulnerability, then split hazard (future or historical) and vulnerability (sensitivity or adaptive capacity).</li>
          <li><b style="color:var(--fg)">Rate each of the ${n} indicators</b> from 0 (exclude) to 5 (critical), or mark Not sure. Your ratings become weights within each component, shown live as you go.</li>
          <li><b style="color:var(--fg)">Review and submit.</b> Flag indicators that look wrong, and suggest ones that are missing.</li></ol>
        <p class="small muted">About 15 minutes. Skip any component outside your expertise. Your answers are saved as you go, so you can stop and come back with the same link.</p>
        <div class="formula" aria-label="How answers are combined">Risk ≈ w<sub>H</sub>·Hazard + w<sub>E</sub>·Exposure + w<sub>V</sub>·Vulnerability<br>Hazard = f·Future + (1−f)·Historical<br>Vulnerability = s·Sensitivity + (1−s)·(1 − Adaptive capacity)</div>
        <p class="tiny muted">Illustrative additive form. The final aggregation is fixed in the methodology; your weights carry into it either way.</p>
        ${S.config.randomiseOrder ? `<p class="tiny muted">Indicators appear in a different order for each expert, so that the order of the list does not shape the weights.</p>` : ""}
      </div>
      <div class="card stack"><h3>About you</h3>
        <label class="field">Which best describes your organisation?
          <select id="pf-group" data-in="group"><option value="">Choose one</option>${S.config.groups.map(g => `<option ${p.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
        <div style="display:grid;gap:6px;font-size:.84rem;color:var(--fg-2)">Which regions do you know best? <span class="tiny">Agro-climatic zones. Choose all that apply.</span>
          <div class="chips">${S.config.regions.map(r => `<button class="chip" data-act="region" data-r="${esc(r)}" aria-pressed="${p.regions.includes(r)}">${esc(r)}</button>`).join("")}</div></div>
        <div class="edit-grid"><label class="field">Name (optional)<input type="text" id="pf-name" data-in="name" value="${esc(p.name)}"></label>
          <label class="field">Institution (optional)<input type="text" id="pf-org" data-in="org" value="${esc(p.org)}"></label></div>
        <hr class="hr">
        <label class="consent"><input type="checkbox" id="consent" data-in="consent" ${d.consent ? "checked" : ""}>
          <span>I agree to take part. My answers are stored by the FAO project team (TCP/IND/4005) and used only to set and document the CRVA weights. Results are reported in aggregate and never with my name. Taking part is voluntary and I can stop at any time.</span></label>
      </div></div></section>`;
}

function stepComp() {
  const r = S.data;
  const row = (k, name) => `<div class="alloc-row" style="--c:${COLOR[k]}"><span class="name"><i></i>${name}</span>
      <input type="range" min="0" max="100" step="1" id="al-${k}" data-in="alloc" data-k="${k}" value="${r.comp[k]}" aria-label="${name} points">
      <input type="number" min="0" max="100" id="aln-${k}" data-in="alloc" data-k="${k}" value="${r.comp[k]}" aria-label="${name} points"></div>`;
  return `<section class="section"><div class="grid2"><div class="stack" style="gap:18px">
    <div class="stack"><span class="eyebrow">Step 2 · Risk components</span><h2>How much should each part of risk count?</h2>
    <p class="lede">Split 100 points between the three determinants of risk. Think about agricultural risk across the regions you know.</p></div>
    <div class="card alloc">${row("H", "Hazard")}${row("E", "Exposure")}${row("V", "Vulnerability")}<div class="stackbar" id="al-bar"></div>
      <div class="row" style="justify-content:space-between"><span id="al-total" class="small"></span><button class="btn small" data-act="rebalance">Rescale to 100</button></div></div>
    <div class="card stack" style="gap:18px">
      <div class="split"><h3>Within hazard</h3><p class="small muted">Should projected change or the past record count more?</p>
        <input type="range" min="0" max="100" id="sp-HF" data-in="split" data-k="HF" value="${r.split.HF}" aria-label="Share of hazard given to future hazard">
        <div class="ends"><span><b style="color:var(--hf)" id="sp-HF-a">${r.split.HF}</b> future (CMIP6)</span><span>historical (observed) <b style="color:var(--hh)" id="sp-HF-b">${100 - r.split.HF}</b></span></div></div>
      <div class="split"><h3>Within vulnerability</h3><p class="small muted">Should weaknesses or the capacity to cope count more?</p>
        <input type="range" min="0" max="100" id="sp-S" data-in="split" data-k="S" value="${r.split.S}" aria-label="Share of vulnerability given to sensitivity">
        <div class="ends"><span><b style="color:var(--s)" id="sp-S-a">${r.split.S}</b> sensitivity</span><span>adaptive capacity <b style="color:var(--ac)" id="sp-S-b">${100 - r.split.S}</b></span></div></div></div></div>
    <aside class="sticky stack"><div class="panel stack"><span class="eyebrow">Share of the risk score</span><div class="wbars" id="comp-preview"></div>
      <p class="tiny muted">Marker shows equal weights. These shares are then divided among the indicators you rate next.</p></div>
      <div class="note">There is no right answer. The workshop compares everyone's splits, so a clear view helps more than a cautious 33/33/33.</div></aside></div></section>`;
}
function subShares(r) { const a = normAlloc(r.comp) || { H: 1 / 3, E: 1 / 3, V: 1 / 3 }, f = r.split.HF / 100, s = r.split.S / 100; return { HF: a.H * f, HH: a.H * (1 - f), E: a.E, S: a.V * s, AC: a.V * (1 - s) }; }
function updateCompUI() {
  const r = S.data, t = total(), bar = $("#al-bar"); if (!bar) return;
  bar.innerHTML = ["H", "E", "V"].map(k => `<div style="--c:${COLOR[k]};flex:0 0 ${t ? r.comp[k] / t * 100 : 33.3}%">${r.comp[k] >= 8 ? { H: "Hazard", E: "Exposure", V: "Vulnerability" }[k] + " " + r.comp[k] : ""}</div>`).join("");
  $("#al-total").innerHTML = t === 100 ? `<span class="total-ok">Total 100 ✓</span>` : `<span class="total-bad">Total ${t}. Rescale, or adjust until it reaches 100.</span>`;
  const sh = subShares(r);
  $("#comp-preview").innerHTML = SUB_ORDER.map(s => wbar(SUB_TEXT[s].title, sh[s], s === "E" ? 1 / 3 : 1 / 6, COLOR[s], 0.6)).join("");
  for (const k of ["HF", "S"]) { const a = $("#sp-" + k + "-a"); if (a) { a.textContent = r.split[k]; $("#sp-" + k + "-b").textContent = 100 - r.split[k]; } }
  const nx = document.querySelector('[data-act="next"]'), hint = $("#nav-hint");
  if (nx) nx.disabled = t !== 100; if (hint) hint.textContent = t !== 100 ? "The three shares must total 100 to continue." : "";
}
function wbar(label, v, eq, c, max = 1, d = 0) {
  const sc = x => Math.min(100, (x / max) * 100);
  return `<div class="wbar" style="--c:${c}"><span class="lbl" title="${esc(label)}">${esc(label)}</span><span class="val num">${pct(v, d)}</span>
    <div class="trk"><div class="fill" style="width:${v == null ? 0 : sc(v)}%"></div>${eq != null ? `<div class="eq" style="left:${sc(eq)}%"></div>` : ""}</div></div>`;
}

function stepSub(sub) {
  const r = S.data, T = SUB_TEXT[sub], list = inds(sub), idx = SUB_ORDER.indexOf(sub) + 1, fam = r.familiarity[sub], skip = fam === "skip";
  const sugg = (r.suggestions || []).filter(s => s.sub === sub);
  return `<section class="section"><div class="grid2"><div class="stack" style="gap:14px">
    <div class="subhead" style="--c:${COLOR[sub]}"><span class="eyebrow">Component ${idx} of 5 · ${esc(T.comp)}</span><h2>${esc(T.title)}</h2>
      <p class="muted small" style="max-width:66ch">${esc(T.def)}</p><p style="max-width:66ch"><b>${esc(T.q)}</b></p></div>
    <div class="skipbar" style="display:grid;gap:8px"><span>How familiar are you with these indicators?</span>
      <div class="fam" role="group" aria-label="Familiarity">${FAM.map(([v, l]) => `<button data-act="fam" data-s="${sub}" data-v="${v}" aria-pressed="${fam === v}">${l}</button>`).join("")}
        <button class="skip" data-act="fam" data-s="${sub}" data-v="skip" aria-pressed="${skip}">Outside my expertise, skip</button></div>
      <span class="tiny muted">${skip ? "Skipped. The group's weights for this component will come from other experts." : "Used to test whether the weights change when more familiar experts count more."}</span></div>
    ${skip ? "" : `<div class="panel tiny muted" style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px">${SCALE.map(([v, , dd]) => `<span><b class="num" style="color:var(--fg)">${v}</b> ${dd}</span>`).join("")}<span><b style="color:var(--fg)">Not sure</b> leaves it out of your weights</span>${S.feedback ? `<span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent)"></i> group median, round ${round() - 1}</span>` : ""}</div>
    <div class="stack">${list.map(i => indCard(i)).join("")}</div>
    <details class="card"><summary style="cursor:pointer;font-weight:600">Suggest a missing ${esc(T.word)} indicator</summary>
      <div class="stack" style="margin-top:12px"><div class="edit-grid">
          <label class="field">Indicator<input type="text" id="sg-label-${sub}"></label>
          <label class="field">Measurement and unit<input type="text" id="sg-unit-${sub}"></label>
          <label class="field">A higher value…<select id="sg-dir-${sub}"><option value="+">raises ${esc(T.word)}</option><option value="-">lowers ${esc(T.word)}</option></select></label>
          <label class="field">Likely data source and year<input type="text" id="sg-src-${sub}"></label></div>
        <label class="field">Why it matters for agricultural risk<textarea id="sg-why-${sub}"></textarea></label>
        <div><button class="btn" data-act="suggest" data-s="${sub}">Add suggestion</button></div>
        ${sugg.length ? `<div class="list">${sugg.map(s => `<div class="item"><b>${esc(s.label)}</b><span class="muted small">${esc(s.unit)} · ${s.dir === "+" ? "raises" : "lowers"} ${esc(T.word)} · ${esc(s.source)}</span></div>`).join("")}</div>` : ""}</div></details>`}
    </div><aside class="sticky stack"><div class="panel stack"><span class="eyebrow">Your weights within ${esc(T.title.toLowerCase())}</span>
      <div class="wbars" id="sub-preview"></div><p class="tiny muted" id="sub-note"></p></div></aside></div></section>`;
}
function dirText(i) { const w = SUB_TEXT[i.sub].word; return i.dir === "-" ? `↓ higher value lowers ${w}` : `↑ higher value raises ${w}`; }
function indCard(i) {
  const r = S.data, v = r.ratings[i.id], open = S.openFlags[i.id] || r.flags[i.id];
  const fb = S.feedback?.indicators?.[i.id], med = fb?.median, medR = med == null ? null : Math.round(med);
  const btn = (val, label, cls = "") => `<button class="${cls}" data-act="rate" data-id="${i.id}" data-v="${val}" aria-pressed="${v === val}" title="${val === null ? "Not sure" : SCALE[val][2]}">${label}${medR !== null && medR === val ? '<span class="med" aria-hidden="true"></span>' : ""}</button>`;
  const fl = r.flags[i.id] || { reasons: [], note: "" }, pv = S.prev?.ratings?.[i.id];
  const missing = S.problems.includes("rate:" + i.id);
  return `<article class="ind ${i.status === "candidate" ? "cand" : ""} ${missing ? "missing" : ""}" id="card-${i.id}">
    <div class="ind-top"><div><div class="ind-name">${esc(i.label)}</div><div class="ind-meta">${esc(i.unit)} · ${esc(i.source)}</div><div class="ind-meta" style="margin-top:2px">${esc(i.why)}</div></div>
      <div class="stack" style="gap:4px;justify-items:end">${i.status === "candidate" ? `<span class="tag cand" title="Not yet in the core set. Rate 0 if it should stay out.">Proposed addition</span>` : ""}<span class="tag dir">${esc(dirText(i))}</span></div></div>
    <div class="rate" role="group" aria-label="Rating for ${esc(i.label)}">${btn(0, "Exclude", "x")}${[1, 2, 3, 4, 5].map(n => btn(n, String(n))).join("")}${btn(null, "Not sure", "ns")}</div>
    ${fb || pv !== undefined ? `<div class="feedback">${fb && fb.n ? `<span>Group median, round ${round() - 1}: <b>${fmt(med)}</b> (IQR ${fmt(fb.q1)}–${fmt(fb.q3)}, n=${fb.n})</span>` : ""}${pv !== undefined ? `<span>Your round ${round() - 1}: <b>${pv === null ? "not sure" : pv}</b></span>` : ""}</div>` : ""}
    <div><button class="btn ghost small" data-act="flag" data-id="${i.id}" aria-expanded="${!!open}">${r.flags[i.id] ? "⚑ Flagged · edit" : "Flag or comment"}</button></div>
    ${open ? `<div class="flagbox"><div class="chips">${FLAG_REASONS.map(x => `<button class="chip" data-act="flagr" data-id="${i.id}" data-r="${esc(x)}" aria-pressed="${fl.reasons.includes(x)}">${esc(x)}</button>`).join("")}</div>
      <textarea id="fn-${i.id}" data-in="flagnote" data-id="${i.id}" placeholder="What should change? e.g. a better data source, a threshold, the regions where it matters">${esc(fl.note)}</textarea></div>` : ""}</article>`;
}
function updateSubUI(sub) {
  const r = S.data, el = $("#sub-preview"); if (!el) return;
  if (r.familiarity[sub] === "skip") { el.innerHTML = `<p class="small muted">Skipped.</p>`; $("#sub-note").textContent = ""; return; }
  const list = inds(sub), ew = expertWeights(asRound(r), S.config.indicators);
  const max = Math.max(1 / list.length * 1.6, ...list.map(i => ew.within[i.id] || 0));
  el.innerHTML = list.map(i => wbar(i.label, ew.within[i.id] ?? null, 1 / list.length, COLOR[sub], max)).join("");
  const rated = list.filter(i => r.ratings[i.id] !== undefined).length, nums = list.map(i => r.ratings[i.id]).filter(x => typeof x === "number");
  let note = `Answered ${rated} of ${list.length}. Marker shows equal weights.`;
  if (nums.length >= 4 && new Set(nums).size === 1) note += " Every rating is the same, so every indicator gets an equal weight. That is fine if you mean it.";
  else if (nums.length >= 4 && nums.filter(x => x === 5).length / nums.length > 0.6) note += " Most ratings are 5. Weights only differ when ratings differ, so keep 5 for the indicators that matter most.";
  $("#sub-note").textContent = note;
}

function problems() {
  const d = S.data, out = [];
  if (!d.consent) out.push({ k: "consent", step: 0, t: "Consent is not given" });
  if (!d.profile.group) out.push({ k: "group", step: 0, t: "Organisation type is missing" });
  if (!d.profile.regions.length) out.push({ k: "regions", step: 0, t: "No region chosen" });
  if (!d.compTouched || total() !== 100) out.push({ k: "comp", step: 1, t: "Component shares are not set to total 100" });
  for (const s of SUB_ORDER) {
    const st = STEPS.findIndex(x => x.key === s);
    if (!d.familiarity[s]) out.push({ k: "fam:" + s, step: st, t: `${SUB_TEXT[s].title}: familiarity not given` });
    if (d.familiarity[s] !== "skip") { const miss = inds(s).filter(i => d.ratings[i.id] === undefined); if (miss.length) out.push({ k: "rate:" + s, ids: miss.map(i => i.id), step: st, t: `${SUB_TEXT[s].title}: ${miss.length} indicator${miss.length > 1 ? "s" : ""} not answered` }); }
  }
  return out;
}
function stepReview() {
  const r = S.data, ew = expertWeights(asRound(r), S.config.indicators), top = Object.entries(ew.global).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const byId = Object.fromEntries(S.config.indicators.map(i => [i.id, i])), sh = subShares(r), pr = problems();
  const rows = SUB_ORDER.map(s => { const l = inds(s), rated = l.filter(i => r.ratings[i.id] !== undefined).length, fl = l.filter(i => r.flags[i.id]).length;
    return `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COLOR[s]};margin-right:6px"></span>${SUB_TEXT[s].title}</td><td class="n">${pct(sh[s])}</td>
      <td class="n">${r.familiarity[s] === "skip" ? "skipped" : rated + " / " + l.length}</td><td class="n">${fl}</td><td><button class="btn ghost small" data-act="go" data-i="${STEPS.findIndex(x => x.key === s)}">Edit</button></td></tr>`; }).join("");
  const done = r.submitted;
  return `<section class="section"><div class="stack"><span class="eyebrow">Step 8 · Review</span><h2>${done ? "Thank you. Your response is in." : "Review and submit"}</h2>
    <p class="lede">${done ? `Your round ${round()} answers are recorded${S.receipt?.id ? ` (receipt ${esc(S.receipt.id)})` : ""}. You can still change them until the round closes: edit any step and submit again, and only your latest submission counts.`
      : "Check the shares and your strongest drivers. These are your own implied weights, before they are combined with other experts'."}</p></div>
    ${S.sendError ? `<div class="banner err stack"><b>Your answers could not be sent.</b><span>${esc(S.sendError)} Your answers are kept in this browser. Try again, or copy them and email them to the CRVA team.</span>
      <div class="row"><button class="btn primary" data-act="submit">Try again</button><button class="btn" data-act="copycode">Copy my answers</button></div></div>` : ""}
    <div class="grid2"><div class="stack" style="gap:16px">
      <div class="tbl-wrap"><table><thead><tr><th>Component</th><th style="text-align:right">Share of risk</th><th style="text-align:right">Answered</th><th style="text-align:right">Flags</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${pr.length ? `<div class="note warn stack"><b>Before you submit</b>${pr.map(p => `<div class="row" style="justify-content:space-between"><span>${esc(p.t)}</span><button class="btn small" data-act="fix" data-i="${p.step}" data-k="${esc(p.k)}">Go there</button></div>`).join("")}</div>` : ""}
      <div class="row"><button class="btn primary" data-act="submit" ${pr.length || S.sending ? "disabled" : ""}>${S.sending ? "Sending…" : done ? `Submit changes to round ${round()}` : `Submit round ${round()} response`}</button>
        ${S.mode === "demo" ? `<span class="small muted">Preview mode: submitting only shows what would be sent.</span>` : ""}</div>
    </div>
    <aside class="sticky panel stack"><span class="eyebrow">Your top drivers of risk</span>
      <div class="wbars">${top.length ? top.map(([id, g]) => wbar(byId[id]?.label || id, g, null, COLOR[byId[id]?.sub], top[0][1], 1)).join("") : `<p class="small muted">Rate some indicators to see which ones your weights put first.</p>`}</div>
      <p class="tiny muted">Share of the whole risk score: component share × your weight within the component.</p></aside></div></section>`;
}
function afterRender() { const k = STEPS[S.step].key; if (k === "comp") updateCompUI(); if (SUB_TEXT[k]) updateSubUI(k); }
function go(i) { S.step = i; saveDraft(); render(); window.scrollTo(0, 0); }

async function submit() {
  if (problems().length) { render(); return; }
  const body = { action: "submit", rid: S.rid, round: round(), version: S.config.version, indicatorHash: S.config.indicatorHash, data: Object.assign(payload(), { submitted: true }) };
  if (S.mode === "demo") { S.data.submitted = true; S.receipt = { id: "preview" }; render(); console.log("Would send", body); return; }
  S.sending = true; S.sendError = null; render();
  try {
    const r = await post(body);
    if (!r.ok) throw new Error({ closed: "The survey is closed.", wrong_round: "The survey has moved to another round. Reload the page.", unknown_code: "Your invitation code was not recognised.", invalid: "Some answers did not pass the server's checks (" + (r.detail || "") + ")." }[r.error] || "The server replied: " + r.error);
    S.data.submitted = true; S.receipt = { id: r.submissionId, at: r.received }; S.dirty = false; lsSet(draftKey(), S.data); toast("Submitted");
  } catch (e) { S.sendError = e.message && !/fetch/i.test(e.message) ? e.message : "The connection failed."; }
  finally { S.sending = false; render(); window.scrollTo(0, 0); }
}

/* ==========================================================================
   EVENTS
   ========================================================================== */
document.addEventListener("submit", e => { if (e.target.id === "code-form") { e.preventDefault(); const c = $("#code-in").value.trim().toUpperCase(); if (c) { const u = new URL(location.href); u.searchParams.set("code", c); location.href = u.toString(); } } });
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act, r = S.data;
  switch (a) {
    case "reload": location.reload(); break;
    case "go": go(+t.dataset.i); break;
    case "fix": go(+t.dataset.i); break;
    case "next": if (STEPS[S.step].key === "comp") r.compTouched = true; touch(); go(S.step + 1); break;
    case "prev": go(S.step - 1); break;
    case "region": { const v = t.dataset.r, l = r.profile.regions, k = l.indexOf(v); k >= 0 ? l.splice(k, 1) : l.push(v); t.setAttribute("aria-pressed", l.includes(v)); touch(); refreshNav(); break; }
    case "rebalance": { const tot = total(); if (!tot) r.comp = { H: 34, E: 33, V: 33 }; else { const H = Math.round(r.comp.H / tot * 100), E = Math.round(r.comp.E / tot * 100); r.comp = { H, E, V: 100 - H - E }; }
      r.compTouched = true; ["H", "E", "V"].forEach(k => { $("#al-" + k).value = r.comp[k]; $("#aln-" + k).value = r.comp[k]; }); updateCompUI(); touch(); break; }
    case "fam": { const s = t.dataset.s, v = t.dataset.v === "skip" ? "skip" : +t.dataset.v; const was = r.familiarity[s]; r.familiarity[s] = v; touch(); if ((was === "skip") !== (v === "skip")) render(); else { t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === t)); refreshStepper(); } break; }
    case "rate": { const id = t.dataset.id, v = t.dataset.v === "null" ? null : +t.dataset.v; r.ratings[id] = v; t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === t));
      t.closest(".ind").classList.remove("missing"); updateSubUI(STEPS[S.step].key); touch(); refreshStepper(); break; }
    case "flag": { const id = t.dataset.id; S.openFlags[id] = !(S.openFlags[id] || r.flags[id]); if (!S.openFlags[id]) delete r.flags[id]; touch(); rerenderCard(id); break; }
    case "flagr": { const id = t.dataset.id, fl = (r.flags[id] ||= { reasons: [], note: "" }), x = t.dataset.r, k = fl.reasons.indexOf(x); k >= 0 ? fl.reasons.splice(k, 1) : fl.reasons.push(x); t.setAttribute("aria-pressed", k < 0); touch(); break; }
    case "suggest": { const s = t.dataset.s, g = id => ($("#sg-" + id + "-" + s)?.value || "").trim();
      if (!g("label")) { toast("Give the indicator a name"); $("#sg-label-" + s)?.focus(); break; }
      (r.suggestions ||= []).push({ sub: s, label: g("label"), unit: g("unit"), dir: g("dir") || "+", source: g("src"), why: g("why") }); touch(); render(); toast("Suggestion added"); break; }
    case "submit": submit(); break;
    case "copycode": { const txt = JSON.stringify({ kind: "crva-weighting-response", v: 2, rid: S.rid, round: round(), version: S.config.version, data: payload() });
      navigator.clipboard?.writeText(txt).then(() => toast("Copied. Paste it into an email to the CRVA team."), () => toast("Copy failed. Select and copy manually.")); break; }
  }
});
document.addEventListener("input", e => {
  const t = e.target, k = t.dataset?.in; if (!k) return; const r = S.data;
  if (k === "name" || k === "org") { r.profile[k] = t.value; touch(); }
  else if (k === "consent") { r.consent = t.checked; touch(); refreshNav(); }
  else if (k === "alloc") { const v = Math.max(0, Math.min(100, Math.round(+t.value || 0))); r.comp[t.dataset.k] = v; r.compTouched = true;
    const o = t.type === "range" ? $("#aln-" + t.dataset.k) : $("#al-" + t.dataset.k); if (o) o.value = v; updateCompUI(); touch(); }
  else if (k === "split") { r.split[t.dataset.k] = +t.value; r.compTouched = true; updateCompUI(); touch(); }
  else if (k === "flagnote") { (r.flags[t.dataset.id] ||= { reasons: [], note: "" }).note = t.value; touch(); }
});
document.addEventListener("change", e => { const t = e.target; if (t.dataset?.in === "group") { S.data.profile.group = t.value; touch(); refreshNav(); } });
function refreshNav() {
  if (STEPS[S.step].key !== "about") return refreshStepper();
  const b = document.querySelector('[data-act="next"]'), h = $("#nav-hint"), ok = stepDone(0);
  if (b) b.disabled = !ok; if (h) h.textContent = ok ? "" : "Give your consent, organisation type and at least one region to continue."; refreshStepper();
}
function refreshStepper() { document.querySelectorAll(".stepper .step").forEach((b, i) => { const d = stepDone(i); b.classList.toggle("done", d); b.querySelector(".n").textContent = d ? "✓" : i + 1; }); }
function rerenderCard(id) { const el = $("#card-" + id); if (!el) return; const tmp = document.createElement("div"); tmp.innerHTML = indCard(S.config.indicators.find(x => x.id === id)); el.replaceWith(tmp.firstElementChild); }
document.addEventListener("click", e => {
  const t = e.target.closest('[data-act="fix"]'); if (!t) return;
  const k = t.dataset.k; if (k.startsWith("rate:")) { S.problems = problems().filter(p => p.k === k).flatMap(p => p.ids.map(id => "rate:" + id)); render(); const first = document.querySelector(".ind.missing"); first && first.scrollIntoView({ block: "center" }); }
});

boot();
