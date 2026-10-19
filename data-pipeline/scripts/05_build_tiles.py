"""
Build per-indicator vector PMTiles for the CRVA map.

Each India grid cell becomes a point with properties:
  hist, {ssp}_{period}, delta_{ssp}_{period}   (delta = future − historical)

Writes tiles/vector_v2/{indicator}.pmtiles; publish by copying into the
kushankb/india-climate-hazards-tiles repo under vector_v2/.

Run:
  conda run -n ml_trade python 05_build_tiles.py [indicator ...]
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_bounds

from hazard_common import INDICATORS, PERIODS, SSPS, load_2d

INDIA_GEOJSON = Path("/Volumes/Extreme SSD/FAO_India/ClimateHazardsExplorer/web/public/data/india_states.geojson")
OUT_DIR = Path(__file__).parents[1] / "tiles" / "vector_v2"


def india_mask(lats, lons):
    gj = json.loads(INDIA_GEOJSON.read_text())
    shapes = [(f["geometry"], 1) for f in gj["features"] if f.get("geometry")]
    res = abs(float(lats[1] - lats[0]))
    transform = from_bounds(lons.min() - res / 2, lats.min() - res / 2,
                            lons.max() + res / 2, lats.max() + res / 2, len(lons), len(lats))
    mask = rasterize(shapes, out_shape=(len(lats), len(lons)), transform=transform, fill=0, dtype="uint8")
    if lats[0] < lats[-1]:
        mask = mask[::-1]
    return mask.astype(bool)


def rnd(v):
    return None if not np.isfinite(v) else float(f"{v:.4g}")


def build(ind, mask_cache):
    hist, lats, lons = load_2d(ind, "historical")
    if hist is None:
        print(f"  SKIP {ind}: no historical file")
        return
    key = (len(lats), float(lats[0]))
    if key not in mask_cache:
        mask_cache[key] = india_mask(lats, lons)
    rows, cols = np.where(mask_cache[key])

    layers = {"hist": hist}
    for ssp in SSPS:
        for per in PERIODS:
            fut, _, _ = load_2d(ind, ssp, per)
            if fut is None:
                print(f"  WARN {ind}: missing {ssp} {per}")
                continue
            k = f"{ssp.lower()}_{per}"
            layers[k] = fut
            layers[f"delta_{k}"] = fut - hist

    feats = []
    for r, c in zip(rows, cols):
        props = {k: rnd(v[r, c]) for k, v in layers.items()}
        feats.append({"type": "Feature",
                      "geometry": {"type": "Point", "coordinates": [round(float(lons[c]), 4), round(float(lats[r]), 4)]},
                      "properties": props})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        gj = Path(td) / f"{ind}.geojson"
        mb = Path(td) / f"{ind}.mbtiles"
        gj.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
        subprocess.run(["tippecanoe", f"--output={mb}", f"--name={ind}", f"--layer={ind}",
                        "--minimum-zoom=3", "--maximum-zoom=9", "--base-zoom=3",
                        "--no-tile-size-limit", "--no-feature-limit", "--force", "--quiet", str(gj)], check=True)
        out = OUT_DIR / f"{ind}.pmtiles"
        subprocess.run(["pmtiles", "convert", str(mb), str(out)], check=True, capture_output=True)
    print(f"  {ind}: {len(feats)} cells → {out.stat().st_size / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    targets = sys.argv[1:] or INDICATORS
    cache = {}
    for ind in targets:
        build(ind, cache)
