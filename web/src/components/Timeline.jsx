import React from 'react'
import { useCRVAStore, HAZARD_PERIODS, CROP_PERIODS } from '../store/useCRVAStore.js'
import { isAggregate } from '../lib/aggregate.js'
import { isMM, MODELS } from '../lib/multimodel.js'
import { isCX } from '../lib/compound.js'
import styles from './Timeline.module.css'

export default function Timeline() {
  const {
    dimensionId,
    hazardPeriod, setHazardPeriod,
    hazardIndicatorId, hazardViewMode, setHazardViewMode,
    cropPeriod, setCropPeriod,
  } = useCRVAStore()

  if (dimensionId === 'climate_hazard') {
    return (
      <footer className={styles.bar}>
        <span className={styles.label}>PERIOD</span>
        <div className={styles.periods}>
          {HAZARD_PERIODS.map(p => (
            <button key={p.id} className={`${styles.period} ${hazardPeriod === p.id ? styles.active : ''}`} onClick={() => setHazardPeriod(p.id)}>
              <span className={styles.periodLabel}>{p.label}</span>
              <span className={styles.periodRange}>{p.range}</span>
            </button>
          ))}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.label}>SHOW</span>
        <div className={styles.periods} role="group" aria-label="Show projected value or change">
          {[['values', 'Projected', 'value'], ['anomaly', 'Change', 'from 1985–2014']].map(([id, label, sub]) => {
            const locked = isAggregate(hazardIndicatorId)
            const on = locked ? id === 'anomaly' : hazardViewMode === id
            return (
              <button key={id} disabled={locked && !on}
                title={locked ? 'Overall future hazard indices are always a change from 1985–2014' : undefined}
                className={`${styles.period} ${on ? styles.active : ''}`}
                aria-pressed={on}
                onClick={() => !locked && setHazardViewMode(id)}>
                <span className={styles.periodLabel}>{label}</span>
                <span className={styles.periodRange}>{sub}</span>
              </button>
            )
          })}
        </div>
        {(isAggregate(hazardIndicatorId) || isMM(hazardIndicatorId) || isCX(hazardIndicatorId)) && (
          <>
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.label}>MODEL</span>
            <ModelMenu />
          </>
        )}
      </footer>
    )
  }

  if (dimensionId === 'crop_impact') {
    return (
      <footer className={styles.bar}>
        <span className={styles.label}>PERIOD</span>
        <div className={styles.periods}>
          {CROP_PERIODS.map(p => (
            <button key={p.id} className={`${styles.period} ${cropPeriod === p.id ? styles.active : ''}`} onClick={() => setCropPeriod(p.id)}>
              <span className={styles.periodLabel}>{p.label}</span>
              <span className={styles.periodRange}>{p.range}</span>
            </button>
          ))}
        </div>
        <div className={styles.note}>RCP 4.5 · Soora et al.</div>
      </footer>
    )
  }

  // Static dimensions — minimal footer
  return (
    <footer className={styles.bar}>
      <span className={styles.label}>STATIC</span>
      <span className={styles.note}>
        {dimensionId === 'exposure' && 'Exposure indicators — most recent census / administrative data'}
        {dimensionId === 'vulnerability' && 'Vulnerability indicators — sensitivity & adaptive capacity'}
        {dimensionId === 'historical_hazard' && 'Historical hazard — observed disaster proneness layers'}
        {dimensionId === 'risk_score' && 'Composite risk score — IPCC WG2 framework (Risk = Hazard × Exposure × Vulnerability)'}
      </span>
    </footer>
  )
}

const MODEL_OPTIONS = [{ id: 'median', label: 'Median of 6 models', sub: 'default' }, ...MODELS.map(m => ({ id: m, label: m, sub: 'single model' }))]

// Climate model picker that opens upwards from the bottom bar.
function ModelMenu() {
  const { mmSource, setMmSource } = useCRVAStore()
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState(null)
  const ref = React.useRef(null)
  const toggle = () => {
    const r = ref.current.getBoundingClientRect()
    setPos({ right: Math.max(8, window.innerWidth - r.right), bottom: window.innerHeight - r.top + 6 })
    setOpen(!open)
  }
  React.useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const cur = MODEL_OPTIONS.find(o => o.id === mmSource) ?? MODEL_OPTIONS[0]
  return (
    <div className={styles.menuWrap} ref={ref}>
      <button className={`${styles.period} ${styles.menuBtn}`} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
        <span className={styles.periodLabel}>{cur.label} <span aria-hidden="true">▴</span></span>
        <span className={styles.periodRange}>SSP2-4.5</span>
      </button>
      {open && (
        <ul className={styles.menu} style={pos ?? undefined} role="listbox" aria-label="Climate model">
          {MODEL_OPTIONS.map(o => (
            <li key={o.id} role="option" aria-selected={o.id === mmSource} tabIndex={0}
              className={`${styles.menuItem} ${o.id === mmSource ? styles.menuItemActive : ''}`}
              onClick={() => { setMmSource(o.id); setOpen(false) }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMmSource(o.id); setOpen(false) } }}>
              <span>{o.label}</span><span className={styles.menuSub}>{o.sub}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
