import React from 'react'
import indicators from '../../data/climate_hazard_indicators.json'
import { useCRVAStore, SSPS, SSP_LABELS } from '../../store/useCRVAStore.js'
import styles from './Panel.module.css'

export default function ClimateHazardPanel() {
  const {
    hazardIndicatorId, setHazardIndicator,
    hazardSsp, setHazardSsp,
    hazardViewMode, setHazardViewMode,
  } = useCRVAStore()

  return (
    <div className={styles.root}>
      <div className={styles.sectionLabel}>VIEW</div>
      <div className={styles.toggleRow}>
        <button className={`${styles.toggle} ${hazardViewMode === 'values' ? styles.active : ''}`} onClick={() => setHazardViewMode('values')}>Values</button>
        <button className={`${styles.toggle} ${hazardViewMode === 'anomaly' ? styles.active : ''}`} onClick={() => setHazardViewMode('anomaly')}>Change</button>
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 12 }}>SCENARIO</div>
      <div className={styles.sspRow}>
        {SSPS.map(s => (
          <button key={s} className={`${styles.sspBtn} ${hazardSsp === s ? styles.sspActive : ''}`} onClick={() => setHazardSsp(s)}>
            {SSP_LABELS[s]}
          </button>
        ))}
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 12 }}>INDICATOR</div>
      {indicators.map(group => (
        <div key={group.group} className={styles.group}>
          <div className={styles.groupLabel}>{group.group}</div>
          {group.indicators.map(ind => (
            <button
              key={ind.id}
              className={`${styles.indicator} ${hazardIndicatorId === ind.id ? styles.indicatorActive : ''}`}
              onClick={() => setHazardIndicator(ind.id)}
            >
              <span className={styles.indicatorLabel}>{ind.label}</span>
              <span className={styles.indicatorUnit}>{ind.unit}</span>
            </button>
          ))}
        </div>
      ))}

      <div className={styles.footer}>INDRA-CMIP6 · 0.1° · 14-model ensemble</div>
    </div>
  )
}
