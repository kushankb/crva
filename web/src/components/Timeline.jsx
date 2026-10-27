import React from 'react'
import { useCRVAStore, HAZARD_PERIODS, CROP_PERIODS } from '../store/useCRVAStore.js'
import { isAggregate } from '../lib/aggregate.js'
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
        <span className={styles.label}>TIME PERIOD</span>
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
          {[['values', 'Projected value', 'for the selected period'], ['anomaly', 'Change', 'from 1985–2014']].map(([id, label, sub]) => {
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
      </footer>
    )
  }

  if (dimensionId === 'crop_impact') {
    return (
      <footer className={styles.bar}>
        <span className={styles.label}>TIME PERIOD</span>
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
