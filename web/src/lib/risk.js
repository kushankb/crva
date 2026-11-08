// Climate risk index (Rama Rao et al. 2020): historical hazard 20 + future hazard 20 + exposure 20 + vulnerability 40
// (Atlas Table 6), weights re-scaled where a part is missing, classes at ±0.5 / ±1.5 SD around the mean (Table 7).
// Data: public/data/risk.json from data-pipeline/scripts/16_drivers_web.py
//   {ids, classes, idx: {window: [...]}, cls: {window: [...]}, missing: [...]}
import { EX_CLASS_COLORS } from './exposure.js'

export const RISK_WINDOWS = ['2047', '2050', '2100']
// Risk needs a future-hazard window; the historical period falls back to ~2050
export const riskWindow = p => (RISK_WINDOWS.includes(p) ? p : '2050')

export const RISK_PARTS_W = [
  { id: 'vulnerability', label: 'Vulnerability', weight: 40, color: '#A259C4' },
  { id: 'exposure', label: 'Exposure', weight: 20, color: '#4A90C4' },
  { id: 'historical_hazard', label: 'Historical hazard', weight: 20, color: '#8a6d3b' },
  { id: 'future_hazard', label: 'Future hazard', weight: 20, color: '#D4572A' },
]

// One class ramp for every Atlas index in the tool, risk included: a colour means one class everywhere
export const RISK_CLASS_LIST = ['Very low', 'Low', 'Medium', 'High', 'Very high'].map((label, i) => ({ id: label, label, color: EX_CLASS_COLORS[i] }))

let cache
export const loadRisk = () => (cache ??= fetch(`${import.meta.env.BASE_URL}data/risk.json`).then(r => r.json()))

export function riskCounts(data, window) {
  const n = [0, 0, 0, 0, 0]
  for (const c of data.cls[window] ?? []) if (typeof c === 'number') n[c] += 1
  return n
}
