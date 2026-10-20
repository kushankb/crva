import meta from '../data/future_hazard_meta.json'

export const FHI_ID = 'future_hazard_index'

// Atlas Table 7: thresholds in SD of the index, centred on zero.
export const FHI_CLASSES = [
  { label: 'More unfavourable',       min: 1.5,       color: '#b2182b' },
  { label: 'Moderately unfavourable', min: 0.5,       color: '#ef8a62' },
  { label: 'No hazard',               min: -0.5,      color: '#f2efe9' },
  { label: 'Moderately favourable',   min: -1.5,      color: '#67a9cf' },
  { label: 'More favourable',         min: -Infinity, color: '#2166ac' },
]

export const FHI_SD = meta.sd
export const FHI_COMPONENTS = meta.components

export function fhiClass(value) {
  return FHI_CLASSES.find(c => value / FHI_SD > c.min)
}

export function fhiColorExpr() {
  const v = ['feature-state', 'fhi']
  return ['case', ['==', ['typeof', v], 'number'],
    ['step', v,
      FHI_CLASSES[4].color, -1.5 * FHI_SD,
      FHI_CLASSES[3].color, -0.5 * FHI_SD,
      FHI_CLASSES[2].color, 0.5 * FHI_SD,
      FHI_CLASSES[1].color, 1.5 * FHI_SD,
      FHI_CLASSES[0].color],
    'rgba(0,0,0,0)']
}
