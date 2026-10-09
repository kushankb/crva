/* Fallback indicator list used only in demo mode (no backend configured).
   The live list comes from the Indicators tab of the Google Sheet. */
/* ==========================================================================
   INDICATOR LIST: the single source of truth for the survey.
   To add an indicator, add one object to `indicators` below (or use the
   Indicators tab, or paste CSV rows there). Fields:
     id         stable, unique, snake_case (keep it once responses exist)
     sub        HF | HH | E | S | AC   (which component it belongs to)
     label      short name shown to experts
     unit       measurement / unit
     dir        "+" if a higher value RAISES the component score, "-" if it lowers it
                (for AC, "+" means a higher value means MORE adaptive capacity)
     source     data source and year
     why        one-line rationale
     status     core | candidate | retired
   ========================================================================== */
window.DEFAULT_CONFIG = {
  version: "2026-10-05 · Annexure I draft",
  activeRound: 1,
  open: true,
  regions: [
    "All-India", "Western Himalayan", "Eastern Himalayan", "Lower Gangetic Plains",
    "Middle Gangetic Plains", "Upper Gangetic Plains", "Trans-Gangetic Plains",
    "Eastern Plateau & Hills", "Central Plateau & Hills", "Western Plateau & Hills",
    "Southern Plateau & Hills", "East Coast Plains & Hills", "West Coast Plains & Ghats",
    "Gujarat Plains & Hills", "Western Dry Region", "Islands"
  ],
  groups: [
    "NITI Aayog / central ministry", "State government department", "ICAR institute",
    "State agricultural university", "IMD / IITM / climate science", "Research or academia",
    "International organisation", "NGO / farmer organisation / FPO", "Other"
  ],
  indicators: [
    // ---------- Future hazard (CMIP6 change signal, baseline to 2030s / 2050s) ----------
    { id: "fh_annual_rain", sub: "HF", label: "Annual rainfall", unit: "change from baseline (%)", dir: "-", source: "CMIP6 downscaled ensemble", why: "An increase is favourable to agricultural productivity.", status: "core" },
    { id: "fh_june_rain", sub: "HF", label: "June rainfall", unit: "change (%)", dir: "-", source: "CMIP6 downscaled ensemble", why: "Enables timely kharif sowing and crop establishment.", status: "core" },
    { id: "fh_july_rain", sub: "HF", label: "July rainfall", unit: "change (%)", dir: "-", source: "CMIP6 downscaled ensemble", why: "Enables timely kharif sowing and crop establishment.", status: "core" },
    { id: "fh_aug_rain", sub: "HF", label: "August rainfall", unit: "change (%)", dir: "-", source: "CMIP6 downscaled ensemble", why: "Retains soil moisture for rabi sowing.", status: "core" },
    { id: "fh_sep_rain", sub: "HF", label: "September rainfall", unit: "change (%)", dir: "-", source: "CMIP6 downscaled ensemble", why: "Retains soil moisture for rabi sowing.", status: "core" },
    { id: "fh_octnov_rain", sub: "HF", label: "October–November rainfall", unit: "change (%)", dir: "-", source: "CMIP6 downscaled ensemble", why: "Helps rabi sowing; may harm kharif harvest (region-specific).", status: "core" },
    { id: "fh_rainy_days", sub: "HF", label: "Rainy days (> 2.5 mm)", unit: "change in days per year", dir: "-", source: "CMIP6 downscaled ensemble", why: "More rainy days means better rainfall distribution.", status: "core" },
    { id: "fh_tmax", sub: "HF", label: "Daily maximum temperature", unit: "change", dir: "+", source: "CMIP6 downscaled ensemble", why: "Warming of maxima reduces crop yields.", status: "core" },
    { id: "fh_tmin", sub: "HF", label: "Daily minimum temperature", unit: "change", dir: "+", source: "CMIP6 downscaled ensemble", why: "Warmer nights reduce crop yields.", status: "core" },
    { id: "fh_rh", sub: "HF", label: "Seasonal relative humidity", unit: "change, critical crop seasons", dir: "+", source: "CMIP6 downscaled ensemble", why: "RH above 80% drives disease, poor pollination and lower grain quality.", status: "core" },
    { id: "fh_radiation", sub: "HF", label: "Seasonal shortwave radiation", unit: "change, critical crop seasons", dir: "-", source: "CMIP6 downscaled ensemble", why: "Low radiation reduces energy available for crop growth.", status: "core" },
    { id: "fh_hot_days", sub: "HF", label: "Unusually hot days", unit: "change in days with Tmax > normal + 4 °C", dir: "+", source: "CMIP6 downscaled ensemble", why: "Crop heat stress and soil moisture loss.", status: "core" },
    { id: "fh_heat_waves", sub: "HF", label: "Heat waves", unit: "change in events (5 days > normal + 4 °C)", dir: "+", source: "CMIP6 downscaled ensemble", why: "Crop heat stress and soil moisture loss.", status: "core" },
    { id: "fh_heavy_rain", sub: "HF", label: "Heavy rain days (> 50 mm)", unit: "change in days per year", dir: "+", source: "CMIP6 downscaled ensemble", why: "Crop damage, lower yields, pest and disease outbreaks.", status: "core" },
    { id: "fh_dry_spells", sub: "HF", label: "Dry spells", unit: "change in spells (14 days < 1 mm, rainy season)", dir: "+", source: "CMIP6 downscaled ensemble", why: "Moisture stress and crop failure in rainfed systems.", status: "core" },
    { id: "fh_cold_days", sub: "HF", label: "Unusually cold days", unit: "change in days with Tmin < normal − 4 °C", dir: "-", source: "CMIP6 downscaled ensemble", why: "Fewer cold days lowers rabi yields and raises biotic stress.", status: "core" },
    { id: "fh_cold_waves", sub: "HF", label: "Cold waves", unit: "change in events (3 days < normal − 4 °C)", dir: "-", source: "CMIP6 downscaled ensemble", why: "Fewer cold waves lowers rabi yields and raises biotic stress.", status: "core" },
    { id: "fh_winds", sub: "HF", label: "Damaging wind days", unit: "change in days with wind > 8 m/s", dir: "+", source: "CMIP6 downscaled ensemble", why: "Lodging, soil erosion and water stress.", status: "core" },
    { id: "fh_spei3", sub: "HF", label: "Drought frequency (SPEI-3 < −1)", unit: "change in % of months", dir: "+", source: "INDRA-CMIP6 (CRVA tool layer)", why: "Captures evaporative demand as well as rainfall deficit.", status: "candidate" },
    { id: "fh_kdd38", sub: "HF", label: "Killing degree days (base 38 °C)", unit: "change in °C days", dir: "+", source: "INDRA-CMIP6 (CRVA tool layer)", why: "Heat above crop tolerance thresholds drives yield loss.", status: "candidate" },

    // ---------- Historical hazard (observed incidence) ----------
    { id: "drought_proneness_pct", sub: "HH", label: "Drought proneness", unit: "% of geographical area", dir: "+", source: "NRAA / IMD", why: "Frequent droughts imply riskier agriculture.", status: "core" },
    { id: "flood_proneness_pct", sub: "HH", label: "Flood proneness", unit: "% of geographical area", dir: "+", source: "NDMA / CWC", why: "More flood-prone area means more land at risk.", status: "core" },
    { id: "earthquake_proneness_pct", sub: "HH", label: "Earthquake proneness", unit: "% of geographical area", dir: "+", source: "BIS / NDMA seismic zone map", why: "Damage to crops, livestock and infrastructure.", status: "core" },
    { id: "forest_fire_proneness_pct", sub: "HH", label: "Forest fire proneness", unit: "% of geographical area", dir: "+", source: "FSI / ISFR 2021", why: "Fires spread to farmland, crops and storage.", status: "core" },
    { id: "cyclone_proneness_pct", sub: "HH", label: "Cyclone proneness", unit: "% of geographical area", dir: "+", source: "IMD cyclone atlas / NDMA", why: "Wind, flooding and saline intrusion.", status: "core" },

    // ---------- Exposure ----------
    { id: "net_sown_area_pct", sub: "E", label: "Net sown area", unit: "% of geographical area", dir: "+", source: "Agriculture Census 2015–16", why: "More cultivated area means more area that can be affected.", status: "core" },
    { id: "rural_pop_density", sub: "E", label: "Rural population density", unit: "rural persons per km² (2024 projection)", dir: "+", source: "Census 2011, projected", why: "More people at risk and more pressure on land.", status: "core" },
    { id: "small_marginal_farmers_pct", sub: "E", label: "Small and marginal farmers", unit: "% of all farmers", dir: "+", source: "Agriculture Census 2015–16", why: "More farmers with few resources are exposed.", status: "core" },
    { id: "scst_population_pct", sub: "E", label: "SC/ST population", unit: "% of population", dir: "+", source: "Census 2011", why: "Greater dependence on natural resources for livelihoods.", status: "core" },
    { id: "women_landholdings_pct", sub: "E", label: "Women-owned landholdings", unit: "% of landholdings", dir: "+", source: "Agriculture Census 2015–16", why: "Smaller holdings with less access to irrigation, credit, insurance and markets.", status: "core" },
    { id: "crossbred_cattle_pct", sub: "E", label: "Cross-bred cattle", unit: "% of livestock population", dir: "+", source: "Livestock Census 2019", why: "More productive but more sensitive to heat stress.", status: "core" },

    // ---------- Sensitivity ----------
    { id: "annual_rainfall_mm", sub: "S", label: "Average annual rainfall", unit: "mm, 1990–2022", dir: "-", source: "IMD", why: "Higher rainfall supports crop growth.", status: "core" },
    { id: "actual_evapotranspiration", sub: "S", label: "Actual evapotranspiration", unit: "mm per year, 2018–2025", dir: "+", source: "MODIS / ERA5", why: "More water lost from soil and vegetation.", status: "core" },
    { id: "groundwater_depletion_pct", sub: "S", label: "Stage of groundwater extraction", unit: "% of annual recharge used", dir: "+", source: "CGWB 2022", why: "Agriculture is ~90% of extraction; high stages mean faster depletion.", status: "core" },
    { id: "degraded_land_pct", sub: "S", label: "Degraded and wasteland", unit: "% of geographical area", dir: "+", source: "NRSC", why: "Low and risky productivity.", status: "core" },
    { id: "rainfed_area_pct", sub: "S", label: "Rainfed area", unit: "% of net sown area", dir: "+", source: "Agriculture Census / LUS", why: "Rainfed farming is exposed to dry spells and drought.", status: "core" },
    { id: "projected_yield_change", sub: "S", label: "Projected crop yield change", unit: "% change, area-weighted major crops", dir: "-", source: "Activity 2.2 productivity scalars", why: "Links sensitivity to the project's own yield-impact evidence.", status: "candidate" },

    // ---------- Adaptive capacity (dir is relative to adaptive capacity) ----------
    { id: "livestock_density", sub: "AC", label: "Livestock density", unit: "livestock per km²", dir: "+", source: "Livestock Census 2019", why: "Diversifies livelihoods and helps cope with risk.", status: "core" },
    { id: "gesi_literacy_gap", sub: "AC", label: "Gender gap in literacy", unit: "total minus female literacy (pp)", dir: "-", source: "Census 2011", why: "A smaller gap means better gender equity (GESI).", status: "core" },
    { id: "income_gini", sub: "AC", label: "Income inequality", unit: "Gini, rural population aged 15–59", dir: "-", source: "PLFS", why: "Inequality lowers a community's collective capacity to adapt.", status: "core" },
    { id: "rural_road_density", sub: "AC", label: "Rural road density", unit: "km per km²", dir: "+", source: "PMGSY", why: "Market access and integration with the wider economy.", status: "core" },
    { id: "energy_access_pct", sub: "AC", label: "Access to energy", unit: "% agricultural households with electricity", dir: "+", source: "SECC / survey", why: "Reliable energy supports coping and irrigation.", status: "core" },
    { id: "nutrition_welfare_pct", sub: "AC", label: "Access to food welfare", unit: "% households using PDS, MDM, ICDS or canteens", dir: "+", source: "NFHS-5", why: "Food security is a base of resilience.", status: "core" },
    { id: "cbo_per_lakh_farms", sub: "AC", label: "SHGs and FPOs", unit: "number per lakh farm holdings", dir: "+", source: "MoRD / MoA&FW", why: "Collective action on resources and marketing.", status: "core" },
    { id: "market_access", sub: "AC", label: "Regulated wholesale markets", unit: "number per lakh farm holdings", dir: "+", source: "AGMARKNET", why: "Better prices and incomes.", status: "core" },
    { id: "warehouse_access", sub: "AC", label: "Regulated warehouses", unit: "number per lakh farm holdings", dir: "+", source: "WDRA", why: "Lower post-harvest loss, credit against stored produce.", status: "core" },
    { id: "mgnregs_access_pct", sub: "AC", label: "Access to work (MGNREGS)", unit: "% agricultural households completing 100 days", dir: "+", source: "MoRD MIS", why: "Income security and local infrastructure.", status: "core" },
    { id: "crop_insurance_pct", sub: "AC", label: "Crop insurance", unit: "% of farmers insured for any crop", dir: "+", source: "PMFBY / NSS", why: "A financial safety net that supports investment.", status: "core" },
    { id: "extension_access_pct", sub: "AC", label: "Access to technical advice", unit: "% of farmers receiving advice from any source", dir: "+", source: "NSS 77th round", why: "Timely, informed decisions.", status: "core" },
    { id: "farm_mechanisation_exp", sub: "AC", label: "Farm mechanisation", unit: "average household expense on machinery (₹)", dir: "+", source: "NSS 77th round", why: "Efficiency and lower production costs.", status: "core" },
    { id: "fish_production_mt", sub: "AC", label: "Inland and coastal fish production", unit: "tonnes", dir: "+", source: "DAHD", why: "Livelihood diversification; also a climate-sensitive activity.", status: "core" },
    { id: "forest_cover_per_100_rural", sub: "AC", label: "Forest cover per 100 rural people", unit: "km² per 100 rural population", dir: "+", source: "FSI ISFR", why: "Ecosystem services buffer weather impacts.", status: "core" },
    { id: "crop_diversity_kharif", sub: "AC", label: "Crop diversity, kharif", unit: "Simpson index", dir: "+", source: "Agriculture Census / LUS", why: "Buffers production, pests and disease.", status: "core" },
    { id: "crop_diversity_rabi", sub: "AC", label: "Crop diversity, rabi", unit: "Simpson index", dir: "+", source: "Agriculture Census / LUS", why: "Buffers production, pests and disease.", status: "core" }
  ]
};
