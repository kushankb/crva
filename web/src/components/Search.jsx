import React from 'react'
import { useCRVAStore } from '../store/useCRVAStore.js'
import styles from './Search.module.css'

// Search states and districts by name. Picking one selects it as a map click would, and the map zooms to it.
// Data: public/data/search.json {s: [[id, name, bbox]], d: [[id, name, state, stateId, bbox]]} (16_drivers_web.py)
let cache
const loadIndex = () => (cache ??= fetch(`${import.meta.env.BASE_URL}data/search.json`).then(r => r.json()).then(j => [
  ...j.s.map(([id, name, bbox]) => ({ type: 'state', id, name, bbox, key: norm(name) })),
  ...j.d.map(([id, name, state, stateId, bbox]) => ({ type: 'district', id, name, state_name: state, stateId, bbox, key: norm(name) })),
]))
// letters only, so "Tehri-Garhwal", "tehri garhwal" and "Tehri Garhwal" all match
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

function find(items, q) {
  const k = norm(q)
  if (!k) return []
  const score = it => (it.key === k ? 0 : it.key.startsWith(k) ? 1 : it.key.includes(k) ? 2 : 9) + (it.type === 'state' ? 0 : 0.5)
  return items.map(it => [score(it), it]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 8).map(([, it]) => it)
}

export default function Search() {
  const setSelectedFeature = useCRVAStore(s => s.setSelectedFeature)
  const [items, setItems] = React.useState(null)
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef(null)
  const results = items ? find(items, q) : []

  React.useEffect(() => {
    // "/" focuses the search, as on most map sites
    const onKey = e => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); inputRef.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = it => {
    setSelectedFeature(it.type === 'state'
      ? { type: 'state', id: it.id, name: it.name, bbox: it.bbox }
      : { type: 'district', id: it.id, name: it.name, state_name: it.state_name, bbox: it.bbox })
    setQ(''); setOpen(false); inputRef.current?.blur()
  }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); inputRef.current?.blur() }
  }

  return (
    <div className={styles.wrap} role="search">
      <span className={styles.icon} aria-hidden="true">⌕</span>
      <input ref={inputRef} className={styles.input} type="search" value={q} placeholder="Search a state or district"
        aria-label="Search a state or district" aria-autocomplete="list" aria-controls="search-results" aria-expanded={open && results.length > 0}
        onFocus={() => { setOpen(true); loadIndex().then(setItems) }} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { setQ(e.target.value); setActive(0); setOpen(true) }} onKeyDown={onKeyDown} />
      {!q && <kbd className={styles.kbd} aria-hidden="true">/</kbd>}
      {open && q && (
        <ul id="search-results" className={styles.list} role="listbox">
          {results.length ? results.map((it, i) => (
            <li key={`${it.type}:${it.id}`} role="option" aria-selected={i === active}
              className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(it) }} onMouseEnter={() => setActive(i)}>
              <span className={styles.name}>{it.name}</span>
              <span className={styles.meta}>{it.type === 'state' ? 'State' : it.state_name}</span>
            </li>
          )) : <li className={styles.empty}>{items ? `No state or district matches “${q}”` : 'Loading…'}</li>}
        </ul>
      )}
    </div>
  )
}
