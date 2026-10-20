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

export const FHI_COMPONENTS = meta.components

// Categories are computed in the pipeline with the SD of each SSP × period.
export function fhiClassOf(category) {
  return FHI_CLASSES.find(c => c.label === category) ?? FHI_CLASSES[2]
}

export function fhiColorExpr() {
  const v = ['feature-state', 'fhi']
  return ['case', ['==', ['typeof', v], 'number'],
    ['match', v, 0, FHI_CLASSES[0].color, 1, FHI_CLASSES[1].color, 2, FHI_CLASSES[2].color,
      3, FHI_CLASSES[3].color, 4, FHI_CLASSES[4].color, 'rgba(0,0,0,0)'],
    'rgba(0,0,0,0)']
}
