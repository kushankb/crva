// Exposure layers (Rama Rao et al. 2020 indicators and index), from data-pipeline/scripts/15_exposure_web.py.
import exposureIndicators from '../data/exposure_indicators.json'

export const EX_INDEX = 'exposure_index'
export const EX_CLASS_COLORS = ['#2c7bb6', '#abd9e9', '#e9e4d4', '#fdae61', '#d7191c']
export const EX_BAND_COLORS = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']

let cache = null
export async function loadEX() {
  if (cache) return cache
  const res = await fetch(`${import.meta.env.BASE_URL}data/exposure.json`)
  cache = await res.json()
  return cache
}

export function exMeta(id) {
  for (const g of exposureIndicators) {
    const ind = g.indicators.find(i => i.id === id)
    if (ind) return ind
  }
  return null
}

// Class 0–4 for the map: Atlas class for the index, Atlas Section 4.1 bands for an indicator.
export function exClass(id, ex, i) {
  if (id === EX_INDEX) return ex.cls[i]
  const v = ex.ind[id]?.[i]
  if (typeof v !== 'number') return null
  const b = exMeta(id)?.bands ?? []
  const k = b.findIndex(t => v <= t)
  return k < 0 ? b.length : k
}

export function exLegend(id) {
  if (id === EX_INDEX) return ['Very low', 'Low', 'Medium', 'High', 'Very high'].map((label, i) => ({ label, color: EX_CLASS_COLORS[i] }))
  const b = exMeta(id)?.bands ?? []
  const labels = [`≤ ${b[0]}`, ...b.slice(1).map((t, i) => `${b[i]}–${t}`), `> ${b[b.length - 1]}`]
  return labels.map((label, i) => ({ label, color: EX_BAND_COLORS[i] }))
}
