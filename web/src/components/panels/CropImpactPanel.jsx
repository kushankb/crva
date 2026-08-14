import React from 'react'
import indicators from '../../data/crop_impact_indicators.json'
import { useCRVAStore, CROP_PERIODS } from '../../store/useCRVAStore.js'
import styles from './Panel.module.css'

export default function CropImpactPanel() {
  const { cropIndicatorId, setCropIndicator, cropPeriod, setCropPeriod } = useCRVAStore()

  return (
    <div className={styles.root}>
      <div className={styles.sectionLabel}>TIME PERIOD</div>
      <div className={styles.toggleRow}>
        {CROP_PERIODS.map(p => (
          <button key={p.id} className={`${styles.toggle} ${cropPeriod === p.id ? styles.active : ''}`} onClick={() => setCropPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className={styles.note} style={{ marginTop: 8 }}>
        RCP 4.5 · % yield change from baseline
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 12 }}>CROP</div>
      {indicators.map(group => (
        <div key={group.group} className={styles.group}>
          <div className={styles.groupLabel}>{group.group}</div>
          {group.indicators.map(ind => (
            <button
              key={ind.id}
              className={`${styles.indicator} ${cropIndicatorId === ind.id ? styles.indicatorActive : ''}`}
              onClick={() => setCropIndicator(ind.id)}
            >
              <span className={styles.indicatorLabel}>{ind.label}</span>
              <span className={styles.indicatorUnit}>{ind.unit}</span>
            </button>
          ))}
        </div>
      ))}

      <div className={styles.footer}>Soora et al. · RCP 4.5 · CMIP5 RCM</div>
    </div>
  )
}
