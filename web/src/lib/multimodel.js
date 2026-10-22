// Per-model Rama Rao indicators and aggregates (data-pipeline/scripts/12_multimodel_web.py).
let cache = null
export async function loadMM() {
  if (cache) return cache
  const res = await fetch(`${import.meta.env.BASE_URL}data/multimodel.json`)
  cache = await res.json()
  return cache
}

export const MM_PREFIX = 'mm_'
export const isMM = id => typeof id === 'string' && id.startsWith(MM_PREFIX)
export const mmComp = id => id.slice(MM_PREFIX.length)
export const MODEL_SSP = 'SSP245'
export const sourceLabel = s => (s === 'median' ? 'All 6 models (median)' : s)
export const MODELS = ['BCC-CSM2-MR', 'GFDL-ESM4', 'INM-CM5-0', 'MIROC6', 'MPI-ESM1-2-LR', 'NorESM2-MM']
