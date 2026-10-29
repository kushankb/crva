// District choropleth layers built from the Rama Rao et al. (2020) analysis: exposure (15_exposure_web.py) and
// historical hazard (18_historical_web.py). Both share one shape: {ids, ind, idx, cls, classes, gap, parent}.
import exposureIndicators from '../data/exposure_indicators.json'
import historicalIndicators from '../data/historical_hazard_indicators.json'

export const EX_INDEX = 'exposure_index'
export const HH_INDEX = 'historical_hazard_index'
export const EX_CLASS_COLORS = ['#2c7bb6', '#abd9e9', '#e9e4d4', '#fdae61', '#d7191c']
export const EX_BAND_COLORS = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']
const HH_BAND_COLORS = ['#fff7ec', '#fdd49e', '#fc8d59', '#b30000']

const LAYERS = {
  exposure: { file: 'exposure.json', groups: exposureIndicators, index: EX_INDEX, bandColors: EX_BAND_COLORS },
  // historical hazard bands are the source files' classes, lower bound inclusive (≥ 10 % = Moderate, …)
  historical_hazard: { file: 'historical_hazard.json', groups: historicalIndicators, index: HH_INDEX, bandColors: HH_BAND_COLORS, lowerInclusive: true },
}

const cache = {}
export async function loadLayer(dim) {
  if (!cache[dim]) cache[dim] = fetch(`${import.meta.env.BASE_URL}data/${LAYERS[dim].file}`).then(r => r.json())
  return cache[dim]
}
export const loadEX = () => loadLayer('exposure')

export function layerMeta(dim, id) {
  for (const g of LAYERS[dim].groups) {
    const ind = g.indicators.find(i => i.id === id)
    if (ind) return ind
  }
  return null
}
export const exMeta = id => layerMeta('exposure', id)
export const isLayerIndex = (dim, id) => LAYERS[dim].index === id
export const layerColors = (dim, id) => (isLayerIndex(dim, id) ? EX_CLASS_COLORS : LAYERS[dim].bandColors)

// Class for the map: index class 0–4, or the indicator's band.
export function layerClass(dim, id, data, i) {
  if (isLayerIndex(dim, id)) return data.cls[i]
  const v = data.ind[id]?.[i]
  if (typeof v !== 'number') return null
  const b = layerMeta(dim, id)?.bands ?? []
  const k = b.findIndex(t => (LAYERS[dim].lowerInclusive ? v < t : v <= t))
  return k < 0 ? b.length : k
}
export const exClass = (id, ex, i) => layerClass('exposure', id, ex, i)

export function layerLegend(dim, id) {
  if (isLayerIndex(dim, id)) return ['Very low', 'Low', 'Medium', 'High', 'Very high'].map((label, i) => ({ label, color: EX_CLASS_COLORS[i] }))
  const meta = layerMeta(dim, id)
  const b = meta?.bands ?? []
  const colors = LAYERS[dim].bandColors
  const labels = meta?.bandLabels
    ?? (LAYERS[dim].lowerInclusive
      ? [`< ${b[0]}`, ...b.slice(1).map((t, i) => `${b[i]}–${t}`), `≥ ${b[b.length - 1]}`]
      : [`≤ ${b[0]}`, ...b.slice(1).map((t, i) => `${b[i]}–${t}`), `> ${b[b.length - 1]}`])
  return labels.map((label, i) => ({ label, color: colors[i] }))
}
export const exLegend = id => layerLegend('exposure', id)
