import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useCRVAStore, RISK_CLASSES } from '../store/useCRVAStore.js'
import Legend from './Legend.jsx'
import { getHazardMeta, hazardScale, buildColorExpr } from '../lib/hazardScale.js'
import { FHI_ID, FHI_CLASSES, fhiColorExpr } from '../lib/hazardIndex.js'
import { loadStats } from '../lib/stats.js'
import styles from './Map.module.css'

let pmRegistered = false
function ensurePmtiles() {
  if (!pmRegistered) {
    const p = new Protocol()
    maplibregl.addProtocol('pmtiles', p.tile.bind(p))
    pmRegistered = true
  }
}

function buildRiskColorExpr() {
  return ['match', ['get', 'risk_class'],
    5, '#D73027', 4, '#F46D43', 3, '#FEE08B', 2, '#A6D96A', 1, '#1A9850', '#cccccc']
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
const CROP_ID    = 'crop-grid'
const CROP_LAYER = 'crop-grid-fill'
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
    hazardIndicatorId, hazardSsp, hazardPeriod, hazardViewMode,
    vulnerabilityIndicatorId, cropSensitivityPeriod,
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
  }, [dimensionId, hazardIndicatorId, vulnerabilityIndicatorId, cropSensitivityPeriod])

  // Update color expression when SSP/period/viewMode changes without reloading tiles
  useEffect(() => {
    if (!styleReady.current || !map.current) return
    const m = map.current
    const s = useCRVAStore.getState()
    if (!m.getLayer(VEC_LAYER) && s.hazardIndicatorId !== FHI_ID) return
    if (s.dimensionId !== 'climate_hazard') return
    if (s.hazardIndicatorId === FHI_ID) { applyFhiState(m, s.hazardSsp, s.hazardPeriod); return }
    const propKey = s.getHazardPropertyKey()
    const scale = hazardScale(getHazardMeta(s.hazardIndicatorId), s.hazardViewMode)
    m.setPaintProperty(VEC_LAYER, 'circle-color', buildColorExpr(propKey, scale))
  }, [hazardSsp, hazardPeriod, hazardViewMode])

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
    } catch (_) {}
  }, [theme])

  const currentDim = store.dimensionId

  return (
    <div className={styles.wrap}>
      <div ref={mapContainer} className={styles.map} />
      {tilesStatus === 'placeholder' && (
        <div className={styles.placeholder}>
          <div className={styles.placeholderInner}>
            <div className={styles.placeholderIcon}>◎</div>
            <div className={styles.placeholderTitle}>No tile data yet</div>
            <div className={styles.placeholderBody}>
              {currentDim === 'climate_hazard' && <>Run <code>01_nc_to_geojson.py</code> then <code>02_tippecanoe_tiles.sh</code> to generate PMTiles.</>}
              {currentDim === 'exposure'       && <>District-level data not yet loaded. Populate <code>public/data/crva_district_stats.json</code>.</>}
              {currentDim === 'vulnerability'  && <>District-level data not yet loaded. Populate <code>public/data/crva_district_stats.json</code>.</>}
              {currentDim === 'risk_score'     && <>Risk score pending. Run <code>08_risk_score.py</code> once all indicator data are available.</>}
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

  let stateHovId = null, stateSelId = null
  let distHovId  = null, distSelId  = null

  m.on('mousemove', 'state-fill', e => {
    if (m.getZoom() >= DISTRICT_ZOOM) return
    if (!e.features.length) return
    m.getCanvas().style.cursor = 'pointer'
    if (stateHovId !== null) m.setFeatureState({ source: 'states', id: stateHovId }, { hover: false })
    stateHovId = e.features[0].id
    m.setFeatureState({ source: 'states', id: stateHovId }, { hover: true })
    popup.current.setLngLat(e.lngLat).setHTML(`<strong>${e.features[0].properties.name ?? 'State'}</strong><br/><span style="font-size:10px;opacity:.55">Click to explore</span>`).addTo(m)
  })
  m.on('mouseleave', 'state-fill', () => {
    if (stateHovId !== null) m.setFeatureState({ source: 'states', id: stateHovId }, { hover: false })
    stateHovId = null; m.getCanvas().style.cursor = ''; popup.current.remove()
  })
  m.on('click', 'state-fill', e => {
    if (m.getZoom() >= DISTRICT_ZOOM || !e.features.length) return
    if (stateSelId !== null) m.setFeatureState({ source: 'states', id: stateSelId }, { selected: false })
    stateSelId = e.features[0].id
    m.setFeatureState({ source: 'states', id: stateSelId }, { selected: true })
    setSelectedFeature({ type: 'state', id: stateSelId, name: e.features[0].properties.name ?? 'Unknown' })
  })

  m.on('mousemove', 'district-fill', e => {
    if (m.getZoom() < DISTRICT_ZOOM || !e.features.length) return
    m.getCanvas().style.cursor = 'pointer'
    if (distHovId !== null) m.setFeatureState({ source: 'districts', id: distHovId }, { hover: false })
    distHovId = e.features[0].id
    m.setFeatureState({ source: 'districts', id: distHovId }, { hover: true })
    const p = e.features[0].properties
    popup.current.setLngLat(e.lngLat).setHTML(`<strong>${p.name ?? 'District'}</strong><br/><span style="opacity:.7">${p.state_name ?? ''}</span><br/><span style="font-size:10px;opacity:.55">Click to explore</span>`).addTo(m)
  })
  m.on('mouseleave', 'district-fill', () => {
    if (distHovId !== null) m.setFeatureState({ source: 'districts', id: distHovId }, { hover: false })
    distHovId = null; m.getCanvas().style.cursor = ''; popup.current.remove()
  })
  m.on('click', 'district-fill', e => {
    if (m.getZoom() < DISTRICT_ZOOM || !e.features.length) return
    if (distSelId !== null) m.setFeatureState({ source: 'districts', id: distSelId }, { selected: false })
    distSelId = e.features[0].id
    m.setFeatureState({ source: 'districts', id: distSelId }, { selected: true })
    const p = e.features[0].properties
    setSelectedFeature({ type: 'district', id: distSelId, name: p.name ?? 'Unknown', state_name: p.state_name ?? '' })
  })

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
  safeHide(VEC_LAYER); safeHide(CROP_LAYER); safeHide(CHORO_LAYER)

  if (dimensionId === 'climate_hazard' && store.hazardIndicatorId === FHI_ID) {
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

  } else if (dimensionId === 'vulnerability' && vulnerabilityIndicatorId?.startsWith('crop_')) {
    const propKey = store.getCropPropKey()
    await loadCropGrid(m, propKey, setTilesStatus)

  } else if (dimensionId === 'exposure' || dimensionId === 'vulnerability') {
    showChoropleth(m, dimensionId, setTilesStatus)

  } else if (dimensionId === 'risk_score') {
    showRiskScore(m, setTilesStatus)
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

let cropCentroidsCache = null

function polygonCentroid(coords) {
  const ring = coords[0]
  const n = ring.length - 1
  let x = 0, y = 0
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1] }
  return [x / n, y / n]
}

// Expand each 0.5° cell into a 5×5 grid of 0.1° sub-points so the
// crop layer matches the visual density of the 0.1° hazard tiles.
const OFFSETS = [-0.2, -0.1, 0, 0.1, 0.2]

async function loadCropGrid(m, propKey, setTilesStatus) {
  setTilesStatus('loading')
  if (m.getLayer(CROP_LAYER)) m.removeLayer(CROP_LAYER)
  if (m.getSource(CROP_ID))   m.removeSource(CROP_ID)

  if (!cropCentroidsCache) {
    const dataUrl = `${import.meta.env.BASE_URL}data/cc_impacts_rcp45.geojson`
    const res  = await fetch(dataUrl)
    const geoj = await res.json()
    const features = []
    for (const f of geoj.features) {
      const [cx, cy] = polygonCentroid(f.geometry.coordinates)
      for (const dx of OFFSETS) {
        for (const dy of OFFSETS) {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [cx + dx, cy + dy] },
            properties: f.properties,
          })
        }
      }
    }
    cropCentroidsCache = { type: 'FeatureCollection', features }
  }

  m.addSource(CROP_ID, { type: 'geojson', data: cropCentroidsCache })
  m.addLayer({
    id: CROP_LAYER, type: 'circle', source: CROP_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 4, 1.8, 5, 2.5, 6, 4.5, 7, 8.0, 8, 14.0, 9, 22.0],
      'circle-color': propKey
        ? buildColorExpr(propKey, { cmap: 'RdYlGn', vmin: -50, vmax: 50 })
        : '#cccccc',
      // Hide circles where this crop has no data (null = crop not grown here)
      'circle-opacity': propKey
        ? ['case', ['!=', ['get', propKey], null], 0.92, 0]
        : 0.92,
      'circle-stroke-width': 0,
    },
  }, 'state-fill')
  m.setLayoutProperty(CROP_LAYER, 'visibility', 'visible')
  setTilesStatus('ok')
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

function showChoropleth(m, dimensionId, setTilesStatus) {
  const placeholderColor = {
    exposure:      '#4A90C4',
    vulnerability: '#A259C4',
  }[dimensionId] ?? '#cccccc'

  try {
    m.setPaintProperty(CHORO_LAYER, 'fill-color', placeholderColor)
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.25)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
  } catch (_) {}
  setTilesStatus('placeholder')
}

function showRiskScore(m, setTilesStatus) {
  try {
    m.setPaintProperty(CHORO_LAYER, 'fill-color', buildRiskColorExpr())
    m.setPaintProperty(CHORO_LAYER, 'fill-opacity', 0.6)
    m.setLayoutProperty(CHORO_LAYER, 'visibility', 'visible')
  } catch (_) {}
  setTilesStatus('placeholder')
}
