import hazardIndicators from '../data/climate_hazard_indicators.json'

const BASE = {
  YlOrRd: ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026'],
  YlOrBr: ['#ffffe5','#fff7bc','#fee391','#fec44f','#fe9929','#ec7014','#cc4c02','#993404','#662506'],
  PuBu:   ['#fff7fb','#ece7f2','#d0d1e6','#a6bddb','#74a9cf','#3690c0','#0570b0','#045a8d','#023858'],
  Blues:  ['#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#08519c','#08306b'],
  RdYlGn: ['#d73027','#f46d43','#fdae61','#fee08b','#ffffbf','#d9ef8b','#a6d96a','#66bd63','#1a9850'],
  RdBu:   ['#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7','#d1e5f0','#92c5de','#4393c3','#2166ac'],
  BrBG:   ['#8c510a','#bf812d','#dfc27d','#f6e8c3','#f5f5f5','#c7eae5','#80cdc1','#35978f','#01665e'],
}

export function colorStops(name) {
  if (name?.endsWith('_r')) return [...(BASE[name.slice(0, -2)] ?? BASE.YlOrRd)].reverse()
  return BASE[name] ?? BASE.YlOrRd
}

export function getHazardMeta(id) {
  for (const g of hazardIndicators) {
    const ind = g.indicators.find(i => i.id === id)
    if (ind) return ind
  }
  return null
}

// Change view is a diverging scale centred on zero.
export function hazardScale(meta, viewMode) {
  if (viewMode === 'anomaly') {
    const a = meta?.anomaly_max ?? 1
    return { cmap: meta?.anomaly_cmap ?? 'RdBu_r', vmin: -a, vmax: a }
  }
  return { cmap: meta?.cmap ?? 'YlOrRd', vmin: meta?.vmin ?? 0, vmax: meta?.vmax ?? 100 }
}

export function buildColorExpr(propKey, { cmap, vmin, vmax }) {
  const stops = colorStops(cmap)
  const step = (vmax - vmin) / (stops.length - 1)
  const interp = ['interpolate', ['linear'], ['to-number', ['get', propKey]]]
  stops.forEach((c, i) => interp.push(vmin + i * step, c))
  return ['case', ['==', ['typeof', ['get', propKey]], 'number'], interp, 'rgba(0,0,0,0)']
}

export function cssGradient(cmap) {
  return `linear-gradient(to right, ${colorStops(cmap).join(', ')})`
}

export function fmt(v) {
  const a = Math.abs(v)
  if (a >= 1000) return Math.round(v).toLocaleString()
  if (a >= 10) return v.toFixed(0)
  if (a >= 1) return v.toFixed(1)
  return v.toFixed(2)
}
