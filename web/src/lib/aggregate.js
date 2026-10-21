import meta from '../data/aggregate_hazard_meta.json'

export const AGG_ABS = 'agg_abs'
export const AGG_REL = 'agg_rel'
export const isAggregate = id => id === AGG_ABS || id === AGG_REL
export const AGG_META = meta

export const AGG_CLASSES = {
  [AGG_ABS]: [
    { label: 'High',     note: 'over 40% of weight 10% worse', color: '#b2182b' },
    { label: 'Moderate', note: '20–40%',                       color: '#ef8a62' },
    { label: 'Low',      note: 'under 20%',                    color: '#fddbc7' },
    { label: 'None',     note: 'no indicator 10% worse',       color: '#d1e5f0' },
  ],
  [AGG_REL]: [
    { label: 'Very high', color: '#b2182b' },
    { label: 'High',      color: '#ef8a62' },
    { label: 'Medium',    color: '#f2efe9' },
    { label: 'Low',       color: '#92c5de' },
    { label: 'Very low',  color: '#2166ac' },
  ],
}

export function aggCategory(id, entry) {
  if (!entry) return null
  return id === AGG_ABS ? entry.absolute.category : entry.relative.quintile
}

export function aggClass(id, label) {
  return AGG_CLASSES[id].find(c => c.label === label)
}

export function aggColorExpr(id) {
  const v = ['feature-state', 'agg']
  const arms = AGG_CLASSES[id].flatMap((c, i) => [i, c.color])
  return ['case', ['==', ['typeof', v], 'number'], ['match', v, ...arms, 'rgba(0,0,0,0)'], 'rgba(0,0,0,0)']
}

export const COMPONENT_LABELS = {
  annual_rain: 'Annual rainfall', june_rain: 'June rainfall', july_rain: 'July rainfall',
  rainy_days: 'Rainy days', tmax: 'Max temperature', tmin: 'Min temperature',
  hot_days: 'Unusually hot days', cold_days: 'Unusually cold days', frost: 'Frost days',
  drought: 'Drought (SPI-3 proxy)', dry_spells: 'Dry-spell score', p99_rain: '99th pct daily rain',
  events_100mm: '>100 mm in 3 days', rx1_pct: 'Max 1-day % of normal', rx3_pct: 'Max 3-day % of normal',
}
