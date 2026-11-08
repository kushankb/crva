import React, { useEffect, useRef, useState } from 'react'
import { loadLayer, layerClass, layerColors, EX_CLASS_COLORS } from '../lib/exposure.js'
import { loadRisk, riskWindow } from '../lib/risk.js'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useCRVAStore } from '../store/useCRVAStore.js'
import Legend from './Legend.jsx'
import { getHazardMeta, hazardScale, buildColorExpr } from '../lib/hazardScale.js'
import { FHI_ID, FHI_CLASSES, fhiColorExpr } from '../lib/hazardIndex.js'
import { loadStats } from '../lib/stats.js'
import { isAggregate, aggColorExpr, mapCategory, AGG_CLASSES } from '../lib/aggregate.js'
import { loadMM, isMM, mmComp } from '../lib/multimodel.js'
import { loadCX, isCX, cxKey, cxMeta } from '../lib/compound.js'
import styles from './Map.module.css'

let pmRegistered = false
function ensurePmtiles() {
  if (!pmRegistered) {
    const p = new Protocol()
    maplibregl.addProtocol('pmtiles', p.tile.bind(p))
    pmRegistered = true
  }
}

async function tileExists(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-6' } })
    if (!res.ok) return false
    const buf = await res.arrayBuffer()
    return new TextDecoder().decode(new Uint8Array(buf, 0, 7)) === 'PMTiles'
  } catch { return false }
}

const BASE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#E8E2D8' } }],
}

const DISTRICT_ZOOM = 6
const VEC_ID     = 'hazard-vec'
const VEC_LAYER  = 'hazard-circles'
const CHORO_LAYER = 'choro-fill'

export default function Map() {
  const mapContainer = useRef(null)
  const map          = useRef(null)
  const popup        = useRef(null)
  const styleReady   = useRef(false)
  const [tilesStatus, setTilesStatus] = useState('loading')

  const store = useCRVAStore()
  const {
    dimensionId,
    hazardIndicatorId, hazardSsp, hazardPeriod, hazardViewMode, mmSource, cxSeason,
    vulnerabilityIndicatorId, exposureIndicatorId, historicalIndicatorId,
    theme,
    setSelectedFeature,
  } = store

  useEffect(() => {
    ensurePmtiles()
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASE_STYLE,
      center: [83, 22],
      zoom: 4.5,
      maxBounds: [[55, -2], [110, 45]],
      minZoom: 3, maxZoom: 12,
      attributionControl: { compact: true },
      antialias: true,
    })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')

    popup.current = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 8, maxWidth: '240px',
    })

    m.on('error', () => {})
    m.on('style.load', () => {
      addAdminLayers(m, setSelectedFeature, popup)
      styleReady.current = true
      syncMapToState(m, store, setTilesStatus)
    })

    return () => { m.remove(); map.current = null; styleReady.current = false }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!styleReady.current || !map.current) return
    syncMapToState(map.current, useCRVAStore.getState(), setTilesStatus)
  }, [dimensionId, hazardIndicatorId, vulnerabilityIndicatorId, exposureIndicatorId, historicalIndicatorId])

  // Update color expression when SSP/period/viewMode changes without reloading tiles
  useEffect(() => {
    if (!styleReady.current || !map.current) return
    const m = map.current
    const s = useCRVAStore.getState()
    if (s.dimensionId === 'risk_score') { applyRiskState(m, s.hazardPeriod); return }
    if (s.dimensionId !== 'climate_hazard') return
    if (s.hazardIndicatorId === FHI_ID) { applyFhiState(m, s.hazardSsp, s.hazardPeriod); return }
    if (isAggregate(s.hazardIndicatorId)) { applyAggState(m, s.hazardIndicatorId, s.mmSource, s.hazardPeriod); return }
    if (isMM(s.hazardIndicatorId) || isCX(s.hazardIndicatorId)) { applyMMState(m, s); return }
    if (!m.getLayer(VEC_LAYER)) return
    const propKey = s.getHazardPropertyKey()
    const scale = hazardScale(getHazardMeta(s.hazardIndicatorId), s.hazardViewMode)
    m.setPaintProperty(VEC_LAYER, 'circle-color', buildColorExpr(propKey, scale))
  }, [hazardSsp, hazardPeriod, hazardViewMode, mmSource, cxSeason])

  useEffect(() => {
    if (!styleReady.current || !map.current) return
    const dark = theme === 'dark'
    const m = map.current
    try {
      m.setPaintProperty('background',      'background-color', dark ? '#141210' : '#E8E2D8')
      m.setPaintProperty('india-land',      'fill-color',       dark ? '#1F1C18' : '#ffffff')
      m.setPaintProperty('state-outline',   'line-color',       dark ? '#6A6258' : '#555555')
      m.setPaintProperty('district-outline','line-color',       dark ? '#5A5248' : '#666666')
      m.setPaintProperty('india-border',    'line-color',       dark ? '#7A6E64' : '#444444')
      m.setPaintProperty('district-selected', 'line-color',     dark ? '#F4EFE6' : '#1C1814')
    } catch (_) {}
  }, [theme])

  const currentDim = store.dimensionId
  const sel = store.selectedFeature
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!sel || sel.type !== 'district') { m.__clearDistSel?.(); return }
    m.__selectDist?.(sel.id)
    // picked from the state panel: bring it into view, clear of the drawer, at district zoom
    if (sel.bbox) {
      const [x0, y0, x1, y1] = sel.bbox
      const cam = m.cameraForBounds([[x0, y0], [x1, y1]], { padding: { top: 80, bottom: 80, left: 80, right: 440 }, maxZoom: 8.5 })
      if (cam) m.easeTo({ ...cam, zoom: Math.max(cam.zoom, DISTRICT_ZOOM + 0.2), duration: 900 })
    }
  }, [sel])

  return (
    <div className={styles.wrap}>
      <div ref={mapContainer} className={styles.map} />
      {tilesStatus === 'placeholder' && (
        <div className={styles.placeholder}>
          <div className={styles.placeholderInner}>
            <div className={styles.placeholderIcon}>◎</div>
            <div className={styles.placeholderTitle}>{currentDim === 'historical_hazard' ? 'Coming next' : 'No tile data yet'}</div>
            <div className={styles.placeholderBody}>
              {currentDim === 'climate_hazard' && <>Run <code>01_nc_to_geojson.py</code> then <code>02_tippecanoe_tiles.sh</code> to generate PMTiles.</>}
              {currentDim === 'historical_hazard' && <>Historical hazard is coming next: drought, flood and cyclone proneness by district.</>}
              {currentDim === 'exposure'       && <>District-level data not yet loaded. Populate <code>public/data/crva_district_stats.json</code>.</>}
              {currentDim === 'vulnerability'  && <>District-level data not yet loaded. Populate <code>public/data/crva_district_stats.json</code>.</>}
            </div>
          </div>
        </div>
      )}
      <Legend />
    </div>
  )
}

function addAdminLayers(m, setSelectedFeature, popup) {
  m.addSource('states', {
    type: 'geojson',
    data: `${import.meta.env.BASE_URL}data/india_states.geojson`,
    promoteId: 'state_id',
  })
  m.addSource('districts', {
    type: 'geojson',
    data: `${import.meta.env.BASE_URL}data/india_districts.geojson`,
    promoteId: 'district_id',
  })

  m.addLayer({ id: 'india-land',      type: 'fill', source: 'states',    paint: { 'fill-color': '#ffffff' } })
  m.addLayer({ id: 'choro-fill',      type: 'fill', source: 'districts', layout: { visibility: 'none' }, paint: { 'fill-color': '#cccccc', 'fill-opacity': 0.7 } })
  m.addLayer({ id: 'state-fill',      type: 'fill', source: 'states',    paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], 'rgba(201,169,110,0.18)', ['boolean', ['feature-state', 'hover'], false], 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0)'] } })
  m.addLayer({ id: 'state-outline',   type: 'line', source: 'states',    paint: { 'line-color': '#666666', 'line-width': 0.8 } })
  m.addLayer({ id: 'district-fill',   type: 'fill', source: 'districts', layout: { visibility: 'none' }, paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], 'rgba(201,169,110,0.18)', ['boolean', ['feature-state', 'hover'], false], 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0)'] } })
  m.addLayer({ id: 'district-outline',type: 'line', source: 'districts', layout: { visibility: 'none' }, paint: { 'line-color': '#666666', 'line-width': 0.5 } })
  m.addLayer({ id: 'india-border',    type: 'line', source: 'states',    paint: { 'line-color': '#555555', 'line-width': 1.2 } })
  // selected district: a dark outline at every zoom, so the selection is visible on any layer
  m.addLayer({ id: 'district-selected', type: 'line', source: 'districts', paint: { 'line-color': '#1C1814', 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.2, 0] } })

  let stateHovId = null, stateSelId = null
  let distHovId  = null, distSelId  = null
  // lets the component clear the district outline when the drawer moves to a state or closes
  m.__clearDistSel = () => { if (distSelId !== null) { m.setFeatureState({ source: 'districts', id: distSelId }, { selected: false }); distSelId = null } }
  // a district picked in the state panel: outline it (and clear the state's highlight)
  m.__selectDist = id => {
    if (stateSelId !== null) { m.setFeatureState({ source: 'states', id: stateSelId }, { selected: false }); stateSelId = null }
    if (distSelId === id) return
    m.__clearDistSel()
    distSelId = id
    m.setFeatureState({ source: 'districts', id }, { selected: true })
  }
  // zoomed out: states (state insights); from DISTRICT_ZOOM: districts, on every layer including risk
  const distMode = () => m.getZoom() >= DISTRICT_ZOOM

  m.on('mousemove', 'state-fill', e => {
    if (distMode()) return
    if (!e.features.length) return
    m.getCanvas().style.cursor = 'pointer'
    if (stateHovId !== null) m.setFeatureState({ source: 'states', id: stateHovId }, { hover: false })
    stateHovId = e.features[0].id
    m.setFeatureState({ source: 'states', id: stateHovId }, { hover: true })
    popup.current.setLngLat(e.lngLat).setHTML(`<strong>${e.features[0].properties.name ?? 'State'}</strong><br/><span style="font-size:10px;opacity:.55">Click for the state · zoom in for districts</span>`).addTo(m)
  })
  m.on('mouseleave', 'state-fill', () => {
    if (stateHovId !== null) m.setFeatureState({ source: 'states', id: stateHovId }, { hover: false })
    stateHovId = null; m.getCanvas().style.cursor = ''; popup.current.remove()
  })
  m.on('click', 'state-fill', e => {
    if (distMode() || !e.features.length) return
    if (stateSelId !== null) m.setFeatureState({ source: 'states', id: stateSelId }, { selected: false })
    stateSelId = e.features[0].id
    m.setFeatureState({ source: 'states', id: stateSelId }, { selected: true })
    setSelectedFeature({ type: 'state', id: stateSelId, name: e.features[0].properties.name ?? 'Unknown' })
  })

  // Districts from DISTRICT_ZOOM; the district's state is one click away in the drawer header.
  const onDist = () => distMode()
  for (const layer of ['district-fill']) {
    m.on('mousemove', layer, e => {
      if (!onDist(layer) || !e.features.length) return
      m.getCanvas().style.cursor = 'pointer'
      if (distHovId !== null) m.setFeatureState({ source: 'districts', id: distHovId }, { hover: false })
      distHovId = e.features[0].id
      m.setFeatureState({ source: 'districts', id: distHovId }, { hover: true })
      const p = e.features[0].properties
      popup.current.setLngLat(e.lngLat).setHTML(`<strong>${p.name ?? 'District'}</strong><br/><span style="opacity:.7">${p.state_name ?? ''}</span><br/><span style="font-size:10px;opacity:.55">Click to explore</span>`).addTo(m)
    })
    m.on('mouseleave', layer, () => {
      if (distHovId !== null) m.setFeatureState({ source: 'districts', id: distHovId }, { hover: false })
      distHovId = null; m.getCanvas().style.cursor = ''; popup.current.remove()
    })
    m.on('click', layer, e => {
      if (!onDist(layer) || !e.features.length) return
      if (stateSelId !== null) { m.setFeatureState({ source: 'states', id: stateSelId }, { selected: false }); stateSelId = null }
      if (distSelId !== null) m.setFeatureState({ source: 'districts', id: distSelId }, { selected: false })
      distSelId = e.features[0].id
      m.setFeatureState({ source: 'districts', id: distSelId }, { selected: true })
      const p = e.features[0].properties
      setSelectedFeature({ type: 'district', id: distSelId, name: p.name ?? 'Unknown', state_name: p.state_name ?? '' })
    })
  }

  m.on('click', e => {
    const atState = m.queryRenderedFeatures(e.point, { layers: ['state-fill'] }).length
    const atDist  = m.queryRenderedFeatures(e.point, { layers: ['district-fill'] }).length
    if (atState || atDist) return
    if (stateSelId !== null) { m.setFeatureState({ source: 'states', id: stateSelId }, { selected: false }); stateSelId = null }
    if (distSelId  !== null) { m.setFeatureState({ source: 'districts', id: distSelId }, { selected: false }); distSelId = null }
    setSelectedFeature(null)
  })

  const updateBounds = () => {
    const z = m.getZoom()
    const showDist = z >= DISTRICT_ZOOM
    ;['district-fill','district-outline'].forEach(id => m.setLayoutProperty(id, 'visibility', showDist ? 'visible' : 'none'))
    m.setLayoutProperty('state-fill',    'visibility', 'visible')
    m.setLayoutProperty('state-outline', 'visibility', 'visible')
  }
  m.on('zoom', updateBounds)
  updateBounds()
}

async function syncMapToState(m, store, setTilesStatus) {
  const { dimensionId, vulnerabilityIndicatorId } = store

  const safeHide = (id) => { try { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none') } catch (_) {} }
  safeHide(VEC_LAYER); safeHide(CHORO_LAYER)

  if (dimensionId === 'climate_hazard' && (isAggregate(store.hazardIndicatorId) || isMM(store.hazardIndicatorId) || isCX(store.hazardIndicatorId))) {
    if (m.getLayer(VEC_LAYER)) m.removeLayer(VEC_LAYER)
    if (m.getSource(VEC_ID)) m.removeSource(VEC_ID)
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.85)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
    if (isAggregate(store.hazardIndicatorId)) await applyAggState(m, store.hazardIndicatorId, store.mmSource, store.hazardPeriod)
    else await applyMMState(m, store)
    setTilesStatus('ok')

  } else if (dimensionId === 'climate_hazard' && store.hazardIndicatorId === FHI_ID) {
    if (m.getLayer(VEC_LAYER)) m.removeLayer(VEC_LAYER)
    if (m.getSource(VEC_ID)) m.removeSource(VEC_ID)
    m.setPaintProperty(CHORO_LAYER, 'fill-color', fhiColorExpr())
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.85)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
    await applyFhiState(m, store.hazardSsp, store.hazardPeriod)
    setTilesStatus('ok')

  } else if (dimensionId === 'climate_hazard') {
    const url     = store.getHazardTileUrl()
    const propKey = store.getHazardPropertyKey()
    const scale   = hazardScale(getHazardMeta(store.hazardIndicatorId), store.hazardViewMode)
    await loadVectorTiles(m, url, propKey, scale, VEC_ID, VEC_LAYER, 'state-fill', setTilesStatus)

  } else if (dimensionId === 'exposure' || dimensionId === 'historical_hazard' || dimensionId === 'vulnerability') {
    if (m.getLayer(VEC_LAYER)) m.removeLayer(VEC_LAYER)
    if (m.getSource(VEC_ID)) m.removeSource(VEC_ID)
    await applyLayerState(m, dimensionId, { exposure: store.exposureIndicatorId, historical_hazard: store.historicalIndicatorId, vulnerability: store.vulnerabilityIndicatorId }[dimensionId])
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.85)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
    setTilesStatus('ok')

  } else if (dimensionId === 'vulnerability') {
    showChoropleth(m, dimensionId, setTilesStatus)

  } else if (dimensionId === 'risk_score') {
    if (m.getLayer(VEC_LAYER)) m.removeLayer(VEC_LAYER)
    if (m.getSource(VEC_ID)) m.removeSource(VEC_ID)
    await applyRiskState(m, store.hazardPeriod)
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.85)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
    setTilesStatus('ok')
  }
}

async function loadVectorTiles(m, url, propKey, scale, sourceId, layerId, insertBefore, setTilesStatus) {
  setTilesStatus('loading')
  const exists = await tileExists(url)
  if (m.getLayer(layerId)) m.removeLayer(layerId)
  if (m.getSource(sourceId)) m.removeSource(sourceId)
  if (!exists) { setTilesStatus('placeholder'); return }

  const indicatorId = url.split('/').pop().replace('.pmtiles', '')
  m.addSource(sourceId, { type: 'vector', url: `pmtiles://${url}` })
  m.addLayer({
    id: layerId, type: 'circle', source: sourceId, 'source-layer': indicatorId,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 4, 1.8, 5, 2.5, 6, 4.5, 7, 8.0, 8, 14.0, 9, 22.0],
      'circle-color': buildColorExpr(propKey, scale),
      'circle-opacity': 0.92,
      'circle-stroke-width': 0,
    },
  }, insertBefore)
  m.setLayoutProperty(layerId, 'visibility', 'visible')
  setTilesStatus('ok')
}

async function applyAggState(m, id, source, period) {
  const mm = await loadMM()
  const p = period === 'historical' ? '2050' : period
  m.setPaintProperty(CHORO_LAYER, 'fill-color', aggColorExpr(id))
  const rows = mm.agg[source]?.[p] ?? []
  mm.admins.forEach((a, i) => {
    const k = AGG_CLASSES[id].findIndex(c => c.label === mapCategory(id, rows[i]))
    m.setFeatureState({ source: 'districts', id: a }, { agg: k >= 0 ? k : null })
  })
}

// Rama Rao indicators from individual models, as a district choropleth.
async function applyMMState(m, s) {
  const cx = isCX(s.hazardIndicatorId)
  const mm = cx ? await loadCX() : await loadMM()
  const comp = cx ? cxKey(s.hazardIndicatorId, s.cxSeason) : mmComp(s.hazardIndicatorId)
  const anomaly = s.hazardViewMode === 'anomaly' && s.hazardPeriod !== 'historical'
  const arr = anomaly
    ? mm.chg[comp]?.[s.mmSource]?.[s.hazardPeriod]
    : mm.ind[comp]?.[s.mmSource]?.[s.hazardPeriod === 'historical' ? 'base' : s.hazardPeriod]
  const meta = cx ? cxMeta(s.hazardIndicatorId, s.cxSeason) : getHazardMeta(s.hazardIndicatorId)
  const scale = hazardScale(meta, anomaly ? 'anomaly' : 'values')
  m.setPaintProperty(CHORO_LAYER, 'fill-color', mmColorExpr(scale))
  mm.admins.forEach((a, i) => {
    const v = arr?.[i]
    m.setFeatureState({ source: 'districts', id: a }, { mmv: typeof v === 'number' ? v : null })
  })
}

function mmColorExpr(scale) {
  const v = ['feature-state', 'mmv']
  const expr = buildColorExpr('__unused__', scale)
  const interp = expr[2]
  interp[2] = ['to-number', v]
  return ['case', ['==', ['typeof', v], 'number'], interp, 'rgba(0,0,0,0)']
}

async function applyFhiState(m, ssp, period) {
  const stats = await loadStats()
  for (const [key, feat] of Object.entries(stats)) {
    if (!key.startsWith('district:')) continue
    const cat = feat.climate_hazard?.future_hazard_index?.[ssp]?.[period]?.category
    const i = FHI_CLASSES.findIndex(c => c.label === cat)
    m.setFeatureState({ source: 'districts', id: key.slice(9) }, { fhi: i >= 0 ? i : null })
  }
}

// Exposure / historical hazard (Rama Rao indicators and index) as a district choropleth: feature-state `exk` = class.
async function applyLayerState(m, dim, id) {
  const ex = await loadLayer(dim)
  const colors = layerColors(dim, id)
  const k = ['feature-state', 'exk']
  const match = ['match', ['to-number', k]]
  colors.slice(0, -1).forEach((c, i) => match.push(i, c)); match.push(colors[colors.length - 1])
  m.setPaintProperty(CHORO_LAYER, 'fill-color', ['case', ['==', ['typeof', k], 'number'], match, 'rgba(0,0,0,0)'])
  // clear districts the other layer coloured but this one has no value for
  if (m.__exIds) m.__exIds.forEach(a => m.setFeatureState({ source: 'districts', id: a }, { exk: null }))
  m.__exIds = ex.ids
  ex.ids.forEach((a, i) => {
    const c = layerClass(dim, id, ex, i)
    m.setFeatureState({ source: 'districts', id: a }, { exk: typeof c === 'number' ? c : null })
  })
}

function showChoropleth(m, dimensionId, setTilesStatus) {
  const placeholderColor = {
    exposure:      '#4A90C4',
    vulnerability: '#A259C4',
    historical_hazard: '#6B7B8D',
  }[dimensionId] ?? '#cccccc'

  try {
    m.setPaintProperty(CHORO_LAYER, 'fill-color', placeholderColor)
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.25)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
  } catch (_) {}
  setTilesStatus('placeholder')
}

// Climate risk index (lib/risk.js) as a district choropleth: feature-state `exk` = class for the chosen window.
async function applyRiskState(m, period) {
  const r = await loadRisk()
  const cls = r.cls[riskWindow(period)] ?? []
  const k = ['feature-state', 'exk']
  const match = ['match', ['to-number', k]]
  EX_CLASS_COLORS.slice(0, -1).forEach((c, i) => match.push(i, c)); match.push(EX_CLASS_COLORS[EX_CLASS_COLORS.length - 1])
  m.setPaintProperty(CHORO_LAYER, 'fill-color', ['case', ['==', ['typeof', k], 'number'], match, 'rgba(0,0,0,0)'])
  if (m.__exIds) m.__exIds.forEach(a => m.setFeatureState({ source: 'districts', id: a }, { exk: null }))
  m.__exIds = r.ids
  r.ids.forEach((a, i) => m.setFeatureState({ source: 'districts', id: a }, { exk: typeof cls[i] === 'number' ? cls[i] : null }))
}
