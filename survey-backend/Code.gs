/**
 * CRVA indicator weighting survey: Google Sheets backend (Google Apps Script).
 * TCP/IND/4005 Activity 2.4.
 *
 * SET UP (about 5 minutes, once)
 *  1. Create a new Google Sheet in the Drive that should own the data.
 *  2. Extensions > Apps Script. Delete the sample code and paste this whole file.
 *  3. Choose the function `setup` in the toolbar and press Run. Approve the permissions.
 *     This creates the tabs, seeds the indicator list and writes an admin key in Settings.
 *  4. Deploy > New deployment > type "Web app".
 *       Execute as: Me.   Who has access: Anyone.
 *     Copy the web app URL (ends in /exec).
 *  5. Put that URL in web/public/survey/endpoint.js in the crva repo (or send it to the team).
 *
 * WHAT LIVES WHERE
 *  Settings     activeRound, open, requireCode, randomiseOrder, version, adminKey
 *  Indicators   the indicator list the survey shows. Add a row to add an indicator.
 *  Regions      regions experts can pick (one per row)
 *  Groups       organisation types (one per row)
 *  Invitations  one row per invited expert; the code goes in their personal link (?code=...)
 *  Submissions  append-only log of every submitted response (full JSON). Never edit.
 *  Drafts       latest unsubmitted answers per respondent and round (overwritten)
 *  Ratings      one row per indicator rating per submission (analysis-ready, long format)
 *  Components   one row per submission: point allocation, splits, self-rated familiarity
 *  Suggestions  indicators proposed by experts
 *
 * Responses are written only through this script; experts never get access to the Sheet.
 * The script runs as the Sheet owner, so the Sheet itself stays private.
 */

const SHEETS = {
  settings: 'Settings', indicators: 'Indicators', regions: 'Regions', groups: 'Groups',
  invitations: 'Invitations', submissions: 'Submissions', drafts: 'Drafts',
  ratings: 'Ratings', components: 'Components', suggestions: 'Suggestions'
};
const COMPONENT_CODES = { HF: 'HF', HH: 'HH', E: 'E', S: 'S', AC: 'AC',
  'future hazard': 'HF', 'historical hazard': 'HH', 'exposure': 'E', 'sensitivity': 'S', 'adaptive capacity': 'AC' };
const MAX_PAYLOAD = 60000;

const DEFAULT_INDICATORS = [
 {
  "id": "fh_annual_rain",
  "sub": "HF",
  "label": "Annual rainfall",
  "unit": "change from baseline (%)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "An increase is favourable to agricultural productivity.",
  "status": "core"
 },
 {
  "id": "fh_june_rain",
  "sub": "HF",
  "label": "June rainfall",
  "unit": "change (%)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Enables timely kharif sowing and crop establishment.",
  "status": "core"
 },
 {
  "id": "fh_july_rain",
  "sub": "HF",
  "label": "July rainfall",
  "unit": "change (%)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Enables timely kharif sowing and crop establishment.",
  "status": "core"
 },
 {
  "id": "fh_aug_rain",
  "sub": "HF",
  "label": "August rainfall",
  "unit": "change (%)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Retains soil moisture for rabi sowing.",
  "status": "core"
 },
 {
  "id": "fh_sep_rain",
  "sub": "HF",
  "label": "September rainfall",
  "unit": "change (%)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Retains soil moisture for rabi sowing.",
  "status": "core"
 },
 {
  "id": "fh_octnov_rain",
  "sub": "HF",
  "label": "October–November rainfall",
  "unit": "change (%)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Helps rabi sowing; may harm kharif harvest (region-specific).",
  "status": "core"
 },
 {
  "id": "fh_rainy_days",
  "sub": "HF",
  "label": "Rainy days (> 2.5 mm)",
  "unit": "change in days per year",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "More rainy days means better rainfall distribution.",
  "status": "core"
 },
 {
  "id": "fh_tmax",
  "sub": "HF",
  "label": "Daily maximum temperature",
  "unit": "change",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Warming of maxima reduces crop yields.",
  "status": "core"
 },
 {
  "id": "fh_tmin",
  "sub": "HF",
  "label": "Daily minimum temperature",
  "unit": "change",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Warmer nights reduce crop yields.",
  "status": "core"
 },
 {
  "id": "fh_rh",
  "sub": "HF",
  "label": "Seasonal relative humidity",
  "unit": "change, critical crop seasons",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "RH above 80% drives disease, poor pollination and lower grain quality.",
  "status": "core"
 },
 {
  "id": "fh_radiation",
  "sub": "HF",
  "label": "Seasonal shortwave radiation",
  "unit": "change, critical crop seasons",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Low radiation reduces energy available for crop growth.",
  "status": "core"
 },
 {
  "id": "fh_hot_days",
  "sub": "HF",
  "label": "Unusually hot days",
  "unit": "change in days with Tmax > normal + 4 °C",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Crop heat stress and soil moisture loss.",
  "status": "core"
 },
 {
  "id": "fh_heat_waves",
  "sub": "HF",
  "label": "Heat waves",
  "unit": "change in events (5 days > normal + 4 °C)",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Crop heat stress and soil moisture loss.",
  "status": "core"
 },
 {
  "id": "fh_heavy_rain",
  "sub": "HF",
  "label": "Heavy rain days (> 50 mm)",
  "unit": "change in days per year",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Crop damage, lower yields, pest and disease outbreaks.",
  "status": "core"
 },
 {
  "id": "fh_dry_spells",
  "sub": "HF",
  "label": "Dry spells",
  "unit": "change in spells (14 days < 1 mm, rainy season)",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Moisture stress and crop failure in rainfed systems.",
  "status": "core"
 },
 {
  "id": "fh_cold_days",
  "sub": "HF",
  "label": "Unusually cold days",
  "unit": "change in days with Tmin < normal − 4 °C",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Fewer cold days lowers rabi yields and raises biotic stress.",
  "status": "core"
 },
 {
  "id": "fh_cold_waves",
  "sub": "HF",
  "label": "Cold waves",
  "unit": "change in events (3 days < normal − 4 °C)",
  "dir": "-",
  "source": "CMIP6 downscaled ensemble",
  "why": "Fewer cold waves lowers rabi yields and raises biotic stress.",
  "status": "core"
 },
 {
  "id": "fh_winds",
  "sub": "HF",
  "label": "Damaging wind days",
  "unit": "change in days with wind > 8 m/s",
  "dir": "+",
  "source": "CMIP6 downscaled ensemble",
  "why": "Lodging, soil erosion and water stress.",
  "status": "core"
 },
 {
  "id": "fh_spei3",
  "sub": "HF",
  "label": "Drought frequency (SPEI-3 < −1)",
  "unit": "change in % of months",
  "dir": "+",
  "source": "INDRA-CMIP6 (CRVA tool layer)",
  "why": "Captures evaporative demand as well as rainfall deficit.",
  "status": "candidate"
 },
 {
  "id": "fh_kdd38",
  "sub": "HF",
  "label": "Killing degree days (base 38 °C)",
  "unit": "change in °C days",
  "dir": "+",
  "source": "INDRA-CMIP6 (CRVA tool layer)",
  "why": "Heat above crop tolerance thresholds drives yield loss.",
  "status": "candidate"
 },
 {
  "id": "drought_proneness_pct",
  "sub": "HH",
  "label": "Drought proneness",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "NRAA / IMD",
  "why": "Frequent droughts imply riskier agriculture.",
  "status": "core"
 },
 {
  "id": "flood_proneness_pct",
  "sub": "HH",
  "label": "Flood proneness",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "NDMA / CWC",
  "why": "More flood-prone area means more land at risk.",
  "status": "core"
 },
 {
  "id": "earthquake_proneness_pct",
  "sub": "HH",
  "label": "Earthquake proneness",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "BIS / NDMA seismic zone map",
  "why": "Damage to crops, livestock and infrastructure.",
  "status": "core"
 },
 {
  "id": "forest_fire_proneness_pct",
  "sub": "HH",
  "label": "Forest fire proneness",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "FSI / ISFR 2021",
  "why": "Fires spread to farmland, crops and storage.",
  "status": "core"
 },
 {
  "id": "cyclone_proneness_pct",
  "sub": "HH",
  "label": "Cyclone proneness",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "IMD cyclone atlas / NDMA",
  "why": "Wind, flooding and saline intrusion.",
  "status": "core"
 },
 {
  "id": "net_sown_area_pct",
  "sub": "E",
  "label": "Net sown area",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "Agriculture Census 2015–16",
  "why": "More cultivated area means more area that can be affected.",
  "status": "core"
 },
 {
  "id": "rural_pop_density",
  "sub": "E",
  "label": "Rural population density",
  "unit": "rural persons per km² (2024 projection)",
  "dir": "+",
  "source": "Census 2011, projected",
  "why": "More people at risk and more pressure on land.",
  "status": "core"
 },
 {
  "id": "small_marginal_farmers_pct",
  "sub": "E",
  "label": "Small and marginal farmers",
  "unit": "% of all farmers",
  "dir": "+",
  "source": "Agriculture Census 2015–16",
  "why": "More farmers with few resources are exposed.",
  "status": "core"
 },
 {
  "id": "scst_population_pct",
  "sub": "E",
  "label": "SC/ST population",
  "unit": "% of population",
  "dir": "+",
  "source": "Census 2011",
  "why": "Greater dependence on natural resources for livelihoods.",
  "status": "core"
 },
 {
  "id": "women_landholdings_pct",
  "sub": "E",
  "label": "Women-owned landholdings",
  "unit": "% of landholdings",
  "dir": "+",
  "source": "Agriculture Census 2015–16",
  "why": "Smaller holdings with less access to irrigation, credit, insurance and markets.",
  "status": "core"
 },
 {
  "id": "crossbred_cattle_pct",
  "sub": "E",
  "label": "Cross-bred cattle",
  "unit": "% of livestock population",
  "dir": "+",
  "source": "Livestock Census 2019",
  "why": "More productive but more sensitive to heat stress.",
  "status": "core"
 },
 {
  "id": "annual_rainfall_mm",
  "sub": "S",
  "label": "Average annual rainfall",
  "unit": "mm, 1990–2022",
  "dir": "-",
  "source": "IMD",
  "why": "Higher rainfall supports crop growth.",
  "status": "core"
 },
 {
  "id": "actual_evapotranspiration",
  "sub": "S",
  "label": "Actual evapotranspiration",
  "unit": "mm per year, 2018–2025",
  "dir": "+",
  "source": "MODIS / ERA5",
  "why": "More water lost from soil and vegetation.",
  "status": "core"
 },
 {
  "id": "groundwater_depletion_pct",
  "sub": "S",
  "label": "Stage of groundwater extraction",
  "unit": "% of annual recharge used",
  "dir": "+",
  "source": "CGWB 2022",
  "why": "Agriculture is ~90% of extraction; high stages mean faster depletion.",
  "status": "core"
 },
 {
  "id": "degraded_land_pct",
  "sub": "S",
  "label": "Degraded and wasteland",
  "unit": "% of geographical area",
  "dir": "+",
  "source": "NRSC",
  "why": "Low and risky productivity.",
  "status": "core"
 },
 {
  "id": "rainfed_area_pct",
  "sub": "S",
  "label": "Rainfed area",
  "unit": "% of net sown area",
  "dir": "+",
  "source": "Agriculture Census / LUS",
  "why": "Rainfed farming is exposed to dry spells and drought.",
  "status": "core"
 },
 {
  "id": "projected_yield_change",
  "sub": "S",
  "label": "Projected crop yield change",
  "unit": "% change, area-weighted major crops",
  "dir": "-",
  "source": "Activity 2.2 productivity scalars",
  "why": "Links sensitivity to the project's own yield-impact evidence.",
  "status": "candidate"
 },
 {
  "id": "livestock_density",
  "sub": "AC",
  "label": "Livestock density",
  "unit": "livestock per km²",
  "dir": "+",
  "source": "Livestock Census 2019",
  "why": "Diversifies livelihoods and helps cope with risk.",
  "status": "core"
 },
 {
  "id": "gesi_literacy_gap",
  "sub": "AC",
  "label": "Gender gap in literacy",
  "unit": "total minus female literacy (pp)",
  "dir": "-",
  "source": "Census 2011",
  "why": "A smaller gap means better gender equity (GESI).",
  "status": "core"
 },
 {
  "id": "income_gini",
  "sub": "AC",
  "label": "Income inequality",
  "unit": "Gini, rural population aged 15–59",
  "dir": "-",
  "source": "PLFS",
  "why": "Inequality lowers a community's collective capacity to adapt.",
  "status": "core"
 },
 {
  "id": "rural_road_density",
  "sub": "AC",
  "label": "Rural road density",
  "unit": "km per km²",
  "dir": "+",
  "source": "PMGSY",
  "why": "Market access and integration with the wider economy.",
  "status": "core"
 },
 {
  "id": "energy_access_pct",
  "sub": "AC",
  "label": "Access to energy",
  "unit": "% agricultural households with electricity",
  "dir": "+",
  "source": "SECC / survey",
  "why": "Reliable energy supports coping and irrigation.",
  "status": "core"
 },
 {
  "id": "nutrition_welfare_pct",
  "sub": "AC",
  "label": "Access to food welfare",
  "unit": "% households using PDS, MDM, ICDS or canteens",
  "dir": "+",
  "source": "NFHS-5",
  "why": "Food security is a base of resilience.",
  "status": "core"
 },
 {
  "id": "cbo_per_lakh_farms",
  "sub": "AC",
  "label": "SHGs and FPOs",
  "unit": "number per lakh farm holdings",
  "dir": "+",
  "source": "MoRD / MoA&FW",
  "why": "Collective action on resources and marketing.",
  "status": "core"
 },
 {
  "id": "market_access",
  "sub": "AC",
  "label": "Regulated wholesale markets",
  "unit": "number per lakh farm holdings",
  "dir": "+",
  "source": "AGMARKNET",
  "why": "Better prices and incomes.",
  "status": "core"
 },
 {
  "id": "warehouse_access",
  "sub": "AC",
  "label": "Regulated warehouses",
  "unit": "number per lakh farm holdings",
  "dir": "+",
  "source": "WDRA",
  "why": "Lower post-harvest loss, credit against stored produce.",
  "status": "core"
 },
 {
  "id": "mgnregs_access_pct",
  "sub": "AC",
  "label": "Access to work (MGNREGS)",
  "unit": "% agricultural households completing 100 days",
  "dir": "+",
  "source": "MoRD MIS",
  "why": "Income security and local infrastructure.",
  "status": "core"
 },
 {
  "id": "crop_insurance_pct",
  "sub": "AC",
  "label": "Crop insurance",
  "unit": "% of farmers insured for any crop",
  "dir": "+",
  "source": "PMFBY / NSS",
  "why": "A financial safety net that supports investment.",
  "status": "core"
 },
 {
  "id": "extension_access_pct",
  "sub": "AC",
  "label": "Access to technical advice",
  "unit": "% of farmers receiving advice from any source",
  "dir": "+",
  "source": "NSS 77th round",
  "why": "Timely, informed decisions.",
  "status": "core"
 },
 {
  "id": "farm_mechanisation_exp",
  "sub": "AC",
  "label": "Farm mechanisation",
  "unit": "average household expense on machinery (₹)",
  "dir": "+",
  "source": "NSS 77th round",
  "why": "Efficiency and lower production costs.",
  "status": "core"
 },
 {
  "id": "fish_production_mt",
  "sub": "AC",
  "label": "Inland and coastal fish production",
  "unit": "tonnes",
  "dir": "+",
  "source": "DAHD",
  "why": "Livelihood diversification; also a climate-sensitive activity.",
  "status": "core"
 },
 {
  "id": "forest_cover_per_100_rural",
  "sub": "AC",
  "label": "Forest cover per 100 rural people",
  "unit": "km² per 100 rural population",
  "dir": "+",
  "source": "FSI ISFR",
  "why": "Ecosystem services buffer weather impacts.",
  "status": "core"
 },
 {
  "id": "crop_diversity_kharif",
  "sub": "AC",
  "label": "Crop diversity, kharif",
  "unit": "Simpson index",
  "dir": "+",
  "source": "Agriculture Census / LUS",
  "why": "Buffers production, pests and disease.",
  "status": "core"
 },
 {
  "id": "crop_diversity_rabi",
  "sub": "AC",
  "label": "Crop diversity, rabi",
  "unit": "Simpson index",
  "dir": "+",
  "source": "Agriculture Census / LUS",
  "why": "Buffers production, pests and disease.",
  "status": "core"
 }
];
const DEFAULT_REGIONS = ["All-India","Western Himalayan","Eastern Himalayan","Lower Gangetic Plains","Middle Gangetic Plains","Upper Gangetic Plains","Trans-Gangetic Plains","Eastern Plateau & Hills","Central Plateau & Hills","Western Plateau & Hills","Southern Plateau & Hills","East Coast Plains & Hills","West Coast Plains & Ghats","Gujarat Plains & Hills","Western Dry Region","Islands"];
const DEFAULT_GROUPS = ["NITI Aayog / central ministry","State government department","ICAR institute","State agricultural university","IMD / IITM / climate science","Research or academia","International organisation","NGO / farmer organisation / FPO","Other"];

/* ------------------------------------------------------------------ setup */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const make = (name, header) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(header); sh.setFrozenRows(1); sh.getRange(1, 1, 1, header.length).setFontWeight('bold'); }
    return sh;
  };
  const st = make(SHEETS.settings, ['key', 'value', 'note']);
  if (st.getLastRow() === 1) {
    st.getRange(2, 1, 6, 3).setValues([
      ['activeRound', 1, 'Round experts answer now (1 before the workshop, 2 in the room)'],
      ['open', true, 'FALSE closes the survey'],
      ['requireCode', true, 'TRUE accepts only codes listed in Invitations'],
      ['randomiseOrder', true, 'Shuffle indicator order within each component, per respondent'],
      ['version', 'Annexure I draft 2026-10', 'Change when the indicator list changes; stored with every response'],
      ['adminKey', Utilities.getUuid().replace(/-/g, '').slice(0, 20), 'Paste into the results page. Keep private.']
    ]);
  }
  const ind = make(SHEETS.indicators, ['id', 'component', 'label', 'measurement', 'direction', 'source', 'rationale', 'status']);
  if (ind.getLastRow() === 1) {
    ind.getRange(2, 1, DEFAULT_INDICATORS.length, 8).setValues(DEFAULT_INDICATORS.map(i => [i.id, i.sub, i.label, i.unit, i.dir, i.source, i.why, i.status]));
  }
  const rg = make(SHEETS.regions, ['region']);
  if (rg.getLastRow() === 1) rg.getRange(2, 1, DEFAULT_REGIONS.length, 1).setValues(DEFAULT_REGIONS.map(r => [r]));
  const gp = make(SHEETS.groups, ['organisation type']);
  if (gp.getLastRow() === 1) gp.getRange(2, 1, DEFAULT_GROUPS.length, 1).setValues(DEFAULT_GROUPS.map(r => [r]));
  make(SHEETS.invitations, ['code', 'name', 'email', 'organisation type', 'notes', 'round1', 'round2', 'round3']);
  make(SHEETS.submissions, ['submission_id', 'received_utc', 'respondent', 'round', 'instrument_version', 'indicator_hash', 'started_utc', 'active_seconds', 'n_rated', 'n_not_sure', 'payload_json']);
  make(SHEETS.drafts, ['respondent', 'round', 'updated_utc', 'payload_json']);
  make(SHEETS.ratings, ['submission_id', 'respondent', 'round', 'org_type', 'regions', 'component', 'familiarity', 'indicator_id', 'indicator_status', 'rating', 'not_sure', 'position_shown', 'flag_reasons', 'flag_note']);
  make(SHEETS.components, ['submission_id', 'respondent', 'round', 'org_type', 'regions', 'alloc_hazard', 'alloc_exposure', 'alloc_vulnerability', 'future_share_of_hazard', 'sensitivity_share_of_vulnerability', 'fam_HF', 'fam_HH', 'fam_E', 'fam_S', 'fam_AC']);
  make(SHEETS.suggestions, ['submission_id', 'respondent', 'round', 'component', 'label', 'measurement', 'direction', 'source', 'rationale']);
  const def = ss.getSheetByName('Sheet1'); if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  Logger.log('Set up done. Admin key: ' + getSettings_().adminKey);
}

/* ------------------------------------------------------------------ helpers */
function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function rows_(name) {
  const sh = sheet_(name); if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const h = v.shift();
  return v.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
function getSettings_() {
  const s = {}; rows_(SHEETS.settings).forEach(r => { s[r.key] = r.value; });
  const bool = v => v === true || String(v).toUpperCase() === 'TRUE';
  return { activeRound: Number(s.activeRound) || 1, open: bool(s.open), requireCode: bool(s.requireCode),
    randomiseOrder: bool(s.randomiseOrder), version: String(s.version || ''), adminKey: String(s.adminKey || '') };
}
function slug_(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'ind'; }
function hash_(s) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return d.slice(0, 6).map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
function cleanId_(s) { return String(s || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 64); }
function validCode_(code) {
  return rows_(SHEETS.invitations).some(r => String(r.code).trim() === code);
}
/* Reads the Indicators tab; gives blank ids a stable id and writes it back so ratings stay attached. */
function indicators_() {
  const sh = sheet_(SHEETS.indicators); const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 8).getValues(); v.shift();
  const used = new Set(v.map(r => String(r[0]).trim()).filter(Boolean)); const out = []; let wrote = false;
  v.forEach((r, k) => {
    if (!String(r[2]).trim()) return;
    let id = String(r[0]).trim();
    if (!id) { id = slug_(r[2]); let n = 2; while (used.has(id)) id = slug_(r[2]) + '_' + n++; used.add(id); sh.getRange(k + 2, 1).setValue(id); wrote = true; }
    const sub = COMPONENT_CODES[String(r[1]).trim()] || COMPONENT_CODES[String(r[1]).trim().toLowerCase()];
    if (!sub) return;
    const status = String(r[7] || 'candidate').trim().toLowerCase();
    out.push({ id, sub, label: String(r[2]).trim(), unit: String(r[3]).trim(), dir: /^[-−–]/.test(String(r[4]).trim()) ? '-' : '+',
      source: String(r[5]).trim(), why: String(r[6]).trim(), status: ['core', 'candidate', 'retired'].includes(status) ? status : 'candidate' });
  });
  if (wrote) SpreadsheetApp.flush();
  return out;
}
function list_(name) { return rows_(name).map(r => String(Object.values(r)[0]).trim()).filter(Boolean); }
function latestFinal_(round) {
  const byResp = {};
  rows_(SHEETS.submissions).forEach(r => { if (Number(r.round) === round) byResp[r.respondent] = r; });
  return Object.values(byResp).map(r => { const p = JSON.parse(r.payload_json); p.respondent = r.respondent; p.submission_id = r.submission_id; p.received_utc = r.received_utc; return p; });
}
function quantile_(a, q) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }

/* ------------------------------------------------------------------ GET */
function doGet(e) {
  const p = e.parameter || {}, action = p.action || 'config', st = getSettings_();
  try {
    if (action === 'config') {
      const inds = indicators_();
      return json_({ ok: true, activeRound: st.activeRound, open: st.open, requireCode: st.requireCode, randomiseOrder: st.randomiseOrder,
        version: st.version, indicatorHash: hash_(JSON.stringify(inds)), indicators: inds, regions: list_(SHEETS.regions), groups: list_(SHEETS.groups) });
    }
    if (action === 'resume') {
      const rid = cleanId_(p.rid), round = Number(p.round) || st.activeRound;
      if (!rid) return json_({ ok: false, error: 'missing_id' });
      if (st.requireCode && !validCode_(rid)) return json_({ ok: false, error: 'unknown_code' });
      const draft = rows_(SHEETS.drafts).filter(r => r.respondent === rid && Number(r.round) === round).pop();
      const subs = rows_(SHEETS.submissions).filter(r => r.respondent === rid);
      const final = subs.filter(r => Number(r.round) === round).pop();
      const prev = subs.filter(r => Number(r.round) === round - 1).pop();
      return json_({ ok: true, draft: draft ? JSON.parse(draft.payload_json) : null, submitted: final ? JSON.parse(final.payload_json) : null,
        submittedAt: final ? final.received_utc : null, previous: prev ? JSON.parse(prev.payload_json) : null });
    }
    if (action === 'feedback') {
      // Group summary of the previous round, shown to experts in later rounds. Aggregates only, never individual answers.
      const round = Number(p.round) || st.activeRound - 1;
      if (round >= st.activeRound) return json_({ ok: false, error: 'not_available' });
      const subs = latestFinal_(round), out = {};
      indicators_().forEach(i => {
        const v = subs.filter(s => !(s.skip || {})[i.sub]).map(s => (s.ratings || {})[i.id]).filter(x => typeof x === 'number');
        out[i.id] = { n: v.length, median: quantile_(v, 0.5), q1: quantile_(v, 0.25), q3: quantile_(v, 0.75) };
      });
      return json_({ ok: true, round, n: subs.length, indicators: out });
    }
    if (action === 'export') {
      if (!p.key || p.key !== st.adminKey) return json_({ ok: false, error: 'bad_key' });
      const rounds = {}; [1, 2, 3].forEach(r => { rounds[r] = latestFinal_(r); });
      const inv = rows_(SHEETS.invitations).map(r => ({ code: r.code, group: r['organisation type'], round1: r.round1, round2: r.round2 }));
      return json_({ ok: true, settings: Object.assign({}, st, { adminKey: undefined }), indicators: indicators_(), regions: list_(SHEETS.regions),
        groups: list_(SHEETS.groups), invitations: inv, drafts: rows_(SHEETS.drafts).map(r => ({ respondent: r.respondent, round: r.round })), rounds,
        nSubmissionRows: Math.max(0, sheet_(SHEETS.submissions).getLastRow() - 1) });
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) { return json_({ ok: false, error: 'server_error', detail: String(err) }); }
}

/* ------------------------------------------------------------------ POST */
function doPost(e) {
  let body; try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  if (String(e.postData.contents).length > MAX_PAYLOAD) return json_({ ok: false, error: 'too_large' });
  const st = getSettings_(), rid = cleanId_(body.rid), round = Number(body.round), data = body.data || {};
  if (!rid) return json_({ ok: false, error: 'missing_id' });
  if (!st.open) return json_({ ok: false, error: 'closed' });
  if (round !== st.activeRound) return json_({ ok: false, error: 'wrong_round', activeRound: st.activeRound });
  if (st.requireCode && !validCode_(rid)) return json_({ ok: false, error: 'unknown_code' });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json_({ ok: false, error: 'busy' }); }
  try {
    const now = new Date().toISOString();
    if (body.action === 'draft') {
      const sh = sheet_(SHEETS.drafts), v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
      const k = v.findIndex(r => r[0] === rid && Number(r[1]) === round), row = [rid, round, now, JSON.stringify(data)];
      if (k >= 0) sh.getRange(k + 2, 1, 1, 4).setValues([row]); else sh.appendRow(row);
      return json_({ ok: true, saved: now });
    }
    if (body.action === 'submit') {
      const err = validate_(data); if (err) return json_({ ok: false, error: 'invalid', detail: err });
      const inds = indicators_(), byId = Object.fromEntries(inds.map(i => [i.id, i]));
      const sid = 'S' + Utilities.formatDate(new Date(), 'UTC', 'yyMMddHHmmss') + '-' + rid.slice(0, 12);
      const ratings = data.ratings || {}, nums = Object.values(ratings);
      sheet_(SHEETS.submissions).appendRow([sid, now, rid, round, String(body.version || ''), String(body.indicatorHash || ''), String(data.startedAt || ''),
        Number(data.activeSeconds) || '', nums.filter(x => typeof x === 'number').length, nums.filter(x => x === null).length, JSON.stringify(data)]);
      const prof = data.profile || {}, regions = (prof.regions || []).join('; '), fam = data.familiarity || {};
      const rrows = Object.keys(ratings).map(id => {
        const i = byId[id] || { sub: '', status: 'unknown' }, fl = (data.flags || {})[id] || {};
        return [sid, rid, round, prof.group || '', regions, i.sub, fam[i.sub] || '', id, i.status, ratings[id] === null ? '' : ratings[id], ratings[id] === null ? 1 : 0,
          (data.order || {})[id] ?? '', (fl.reasons || []).join('; '), fl.note || ''];
      });
      if (rrows.length) { const sh = sheet_(SHEETS.ratings); sh.getRange(sh.getLastRow() + 1, 1, rrows.length, rrows[0].length).setValues(rrows); }
      const c = data.comp || {}, sp = data.split || {};
      sheet_(SHEETS.components).appendRow([sid, rid, round, prof.group || '', regions, c.H, c.E, c.V, sp.HF, sp.S, fam.HF || '', fam.HH || '', fam.E || '', fam.S || '', fam.AC || '']);
      (data.suggestions || []).forEach(s => sheet_(SHEETS.suggestions).appendRow([sid, rid, round, s.sub, s.label, s.unit, s.dir, s.source, s.why]));
      markInvitation_(rid, round, now);
      return json_({ ok: true, submissionId: sid, received: now });
    }
    return json_({ ok: false, error: 'unknown_action' });
  } finally { lock.releaseLock(); }
}
function validate_(d) {
  const c = d.comp || {}, t = Number(c.H) + Number(c.E) + Number(c.V);
  if (Math.round(t) !== 100) return 'allocation_must_total_100';
  for (const k of ['HF', 'S']) { const v = Number((d.split || {})[k]); if (!(v >= 0 && v <= 100)) return 'split_out_of_range'; }
  for (const [id, v] of Object.entries(d.ratings || {})) if (!(v === null || (Number.isInteger(v) && v >= 0 && v <= 5))) return 'bad_rating:' + id;
  if (!(d.profile || {}).group) return 'missing_org_type';
  if (!d.consent) return 'missing_consent';
  return null;
}
function markInvitation_(rid, round, when) {
  const sh = sheet_(SHEETS.invitations); if (sh.getLastRow() < 2) return;
  const codes = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()), k = codes.indexOf(rid);
  if (k >= 0 && round >= 1 && round <= 3) sh.getRange(k + 2, 5 + round).setValue('submitted ' + when.slice(0, 16).replace('T', ' '));
}

/* Optional helper: fills the Invitations tab with N random codes (run from the editor). */
function makeInvitationCodes(n) {
  n = n || 40; const sh = sheet_(SHEETS.invitations), have = new Set(list_(SHEETS.invitations)), rows = [];
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  while (rows.length < n) { let c = ''; for (let i = 0; i < 6; i++) c += abc[Math.floor(Math.random() * abc.length)]; if (!have.has(c)) { have.add(c); rows.push([c, '', '', '', '', '', '', '']); } }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
}
