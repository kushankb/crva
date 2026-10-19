"""
Set map colour ranges in web/src/data/climate_hazard_indicators.json from the data.

Values view: 2nd–98th percentile over India cells across all scenarios.
Change view: symmetric ±98th percentile of |future − historical|.

Run after 05_build_tiles.py:
  conda run -n ml_trade python 06_update_indicator_meta.py
"""
import importlib
import json
import math
from pathlib import Path

import numpy as np

from hazard_common import PERIODS, SSPS, load_2d

META = Path(__file__).parents[2] / "web" / "src" / "data" / "climate_hazard_indicators.json"
tiles = importlib.import_module("05_build_tiles")


def nice(x, up):
    if x == 0:
        return 0
    mag = 10 ** math.floor(math.log10(abs(x)))
    f = (math.ceil if up else math.floor)(x / mag * 2) / 2
    return round(f * mag, 6)


def main():
    groups = json.loads(META.read_text())
    _, lats, lons = load_2d("tmean", "historical")
    mask = tiles.india_mask(lats, lons)
    for g in groups:
        for ind in g["indicators"]:
            iid = ind["id"]
            h = load_2d(iid, "historical")[0][mask]
            vals, deltas = [h], []
            for s in SSPS:
                for p in PERIODS:
                    f = load_2d(iid, s, p)[0][mask]
                    vals.append(f)
                    deltas.append(f - h)
            v = np.concatenate(vals)
            ind["vmin"] = nice(float(np.nanpercentile(v, 2)), up=False)
            ind["vmax"] = nice(float(np.nanpercentile(v, 98)), up=True)
            ind["anomaly_max"] = nice(float(np.nanpercentile(np.abs(np.concatenate(deltas)), 98)), up=True) or 1
            print(f"{iid:15} {ind['vmin']:>10} {ind['vmax']:>10}  ±{ind['anomaly_max']}")
    META.write_text(json.dumps(groups, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
