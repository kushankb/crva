// Compound extremes from individual models (data-pipeline/scripts/13 and 14).
import { getHazardMeta } from './hazardScale.js'

let cache = null
export async function loadCX() {
  if (cache) return cache
  const res = await fetch(`${import.meta.env.BASE_URL}data/compound.json`)
  cache = await res.json()
  return cache
}

export const CX_PREFIX = 'cx_'
export const isCX = id => typeof id === 'string' && id.startsWith(CX_PREFIX)
export const cxFlag = id => id.slice(CX_PREFIX.length)
export const cxKey = (id, season) => `${cxFlag(id)}_${season}`
export const SEASONS = [
  { id: 'kharif', label: 'Kharif', months: 'Jun–Oct' },
  { id: 'rabi',   label: 'Rabi',   months: 'Nov–Mar' },
  { id: 'summer', label: 'Summer', months: 'Apr–May' },
  { id: 'annual', label: 'Annual', months: 'all year' },
]

// Indicator metadata with the colour range for the chosen season.
export function cxMeta(id, season) {
  const meta = getHazardMeta(id)
  const s = meta?.season_scale?.[season]
  return s ? { ...meta, vmin: s.vmin, vmax: s.vmax, anomaly_max: s.amax } : meta
}
