let cache = null
export async function loadStats() {
  if (cache) return cache
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/crva_stats.json`)
    cache = await res.json()
  } catch { cache = {} }
  return cache
}
