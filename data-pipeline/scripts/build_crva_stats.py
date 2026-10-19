"""
Convert IndiaClimateHazard admin_stats.json → CRVA crva_stats.json

Source structure (per feature):
  {indicator_id: {historical: {mean,p10,p90}, SSP126: {2047: {mean,p10,p90}, ...}, ...}}

Target structure:
  {climate_hazard: {indicators: {indicator_id: {same structure as source}}},
   name: str, type: str}
"""
import json, sys
from pathlib import Path

_HERE = Path(__file__).parents[2]  # CRVATool/
SRC  = str(_HERE / "web" / "public" / "data" / "admin_stats.json")
DEST = str(_HERE / "web" / "public" / "data" / "crva_stats.json")

INDICATOR_IDS = [
    'heat_stress_35','heat_stress_40','tropical_nights','heatwave_days','wsdi',
    'heat_fatal_45','cdd_energy','tmean','rabi_tmax','frost_days','csdi','hdd',
    'prcptot','rx1day','rx5day','r20mm','r10mm','r1mm','cwd','kharif_precip',
    'cdd','spi3','spei3','gdd_10','gdd_38','monsoon_onset','dtr','etr',
    # Previously computed but excluded
    'r99ptot','r95ptot','tn90p','tx10p','gsl',
    # New Rama Rao indicators (precipitation)
    'june_precip','july_precip','rx3day','r100mm3d',
    # New Rama Rao indicators (temperature)
    'tmax_mean','tmin_mean','summer_tmean',
]

with open(SRC) as f:
    src = json.load(f)

out = {}
for key, feat in src.items():
    indicators = {}
    for ind_id in INDICATOR_IDS:
        if ind_id in feat:
            indicators[ind_id] = feat[ind_id]

    out[key] = {
        "name": feat.get("name", ""),
        "type": feat.get("type", ""),
        "climate_hazard": {
            "indicators": indicators
        }
    }

with open(DEST, "w") as f:
    json.dump(out, f, separators=(',', ':'))

keys = list(out.keys())
states  = sum(1 for k in keys if k.startswith('state:'))
dists   = sum(1 for k in keys if k.startswith('district:'))
print(f"Written {len(out)} entries ({states} states, {dists} districts)")
print(f"Indicators per entry: {len(indicators)}")

# Spot-check
sample = out[keys[0]]
print(f"\nSample key: {keys[0]}")
print(f"Name: {sample['name']}")
ind0 = list(sample['climate_hazard']['indicators'].items())[0]
print(f"First indicator: {ind0[0]}")
print(f"  historical mean: {ind0[1]['historical']['mean']}")
print(f"  SSP585 2100 mean: {ind0[1].get('SSP585',{}).get('2100',{}).get('mean','N/A')}")

import os
size_mb = os.path.getsize(DEST) / 1e6
print(f"\nOutput size: {size_mb:.1f} MB")
