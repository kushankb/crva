import React from 'react'
import { useCRVAStore, HAZARD_PERIODS, CROP_PERIODS } from '../store/useCRVAStore.js'
import styles from './Timeline.module.css'

export default function Timeline() {
  const {
    dimensionId,
    hazardPeriod, setHazardPeriod,
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
