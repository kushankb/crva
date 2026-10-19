import { create } from 'zustand'

const TILES_BASE = import.meta.env.VITE_TILES_BASE ?? 'https://kushankbajaj.com/india-climate-hazards-tiles'

export const SSPS = ['SSP126', 'SSP245', 'SSP370', 'SSP585']
export const SSP_LABELS = { SSP126: 'SSP1-2.6', SSP245: 'SSP2-4.5', SSP370: 'SSP3-7.0', SSP585: 'SSP5-8.5' }
export const HAZARD_PERIODS = [
  { id: 'historical', label: 'Historical', range: '1985–2014' },
  { id: '2047',      label: '~2047',     range: '2033–2062' },
  { id: '2050',      label: '~2050',     range: '2036–2065' },
  { id: '2100',      label: '~2100',     range: '2071–2100' },
]

export const CROP_PERIODS = [
  { id: '2020', label: '~2020' },
  { id: '2050', label: '~2050' },
  { id: '2080', label: '~2080' },
]

export const RISK_CLASSES = [
  { id: 5, label: 'Very High', color: '#D73027' },
  { id: 4, label: 'High',      color: '#F46D43' },
  { id: 3, label: 'Moderate',  color: '#FEE08B' },
  { id: 2, label: 'Low',       color: '#A6D96A' },
  { id: 1, label: 'Very Low',  color: '#1A9850' },
]

export const useCRVAStore = create((set, get) => ({
  // Active dimension
  dimensionId: 'climate_hazard',
  setDimension: (id) => set({ dimensionId: id, selectedFeature: null }),

  // Climate hazard
  hazardIndicatorId: 'cdd',
  setHazardIndicator: (id) => set({ hazardIndicatorId: id }),
  hazardSsp: 'SSP245',
  setHazardSsp: (s) => set({ hazardSsp: s }),
  hazardPeriod: 'historical',
  setHazardPeriod: (p) => set(s => ({ hazardPeriod: p, hazardViewMode: p === 'historical' ? 'values' : s.hazardViewMode })),
  hazardViewMode: 'values',
  setHazardViewMode: (m) => set(s => ({ hazardViewMode: m, hazardPeriod: m === 'anomaly' && s.hazardPeriod === 'historical' ? '2050' : s.hazardPeriod })),

  // Exposure
  exposureIndicatorId: 'net_sown_area_pct',
  setExposureIndicator: (id) => set({ exposureIndicatorId: id }),

  // Vulnerability (incl. crop sensitivity)
  vulnerabilityIndicatorId: 'rainfed_area_pct',
  setVulnerabilityIndicator: (id) => set({ vulnerabilityIndicatorId: id }),
  cropSensitivityPeriod: '2050',
  setCropSensitivityPeriod: (p) => set({ cropSensitivityPeriod: p }),

  // Map interaction
  selectedFeature: null,
  setSelectedFeature: (f) => set({ selectedFeature: f }),

  // Theme
  theme: 'light',
  toggleTheme: () => set(s => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

  // Helpers
  getHazardTileUrl: () => {
    const { hazardIndicatorId } = get()
    return `${TILES_BASE}/vector_v2/${hazardIndicatorId}.pmtiles`
  },
  getHazardPropertyKey: () => {
    const { hazardSsp, hazardPeriod, hazardViewMode } = get()
    if (hazardPeriod === 'historical') return 'hist'
    const sspKey = hazardSsp.toLowerCase()
    const prefix = hazardViewMode === 'anomaly' ? 'delta_' : ''
    return `${prefix}${sspKey}_${hazardPeriod}`
  },
  getCropPropKey: () => {
    const { vulnerabilityIndicatorId, cropSensitivityPeriod } = get()
    if (!vulnerabilityIndicatorId.startsWith('crop_')) return null
    const base = vulnerabilityIndicatorId.replace('crop_', '')
    return `${base}_${cropSensitivityPeriod}`
  },
}))
