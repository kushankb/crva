import React from 'react'
import exposureIndicators from '../../data/exposure_indicators.json'
import vulnerabilityIndicators from '../../data/vulnerability_indicators.json'
import { useCRVAStore, CROP_PERIODS } from '../../store/useCRVAStore.js'
import styles from './Panel.module.css'

const CONFIG = {
  exposure: {
    indicators: exposureIndicators,
    stateKey: 'exposureIndicatorId',
    setter: 'setExposureIndicator',
    footer: 'Census · Agriculture Census · Livestock Census',
    description: 'Inventory of rural people and agriculture-dependent livelihoods exposed to climate change impacts.',
  },
  vulnerability: {
    indicators: vulnerabilityIndicators,
    stateKey: 'vulnerabilityIndicatorId',
    setter: 'setVulnerabilityIndicator',
    footer: 'IMD · CGWB · NRSC · NSSO · MoA · Soora et al.',
    description: 'Sensitivity (factors increasing susceptibility, including projected crop yield impacts) and adaptive capacity (factors enabling adjustment).',
  },
}

export default function ChoroPanel({ dimension }) {
  const { indicators, stateKey, setter, footer, description } = CONFIG[dimension]
  const store = useCRVAStore()
  const selectedId = store[stateKey]
  const setIndicator = store[setter]

  const isCropIndicator = selectedId?.startsWith('crop_')
  const { cropSensitivityPeriod, setCropSensitivityPeriod } = store

  return (
    <div className={styles.root}>
      <p className={styles.dimDesc}>{description}</p>

      {/* Crop period selector — only when a crop indicator is selected */}
      {isCropIndicator && (
        <div>
          <div className={styles.sectionLabel} style={{ marginTop: 8 }}>TIME PERIOD</div>
          <div className={styles.toggleRow}>
            {CROP_PERIODS.map(p => (
              <button
                key={p.id}
                className={`${styles.toggle} ${cropSensitivityPeriod === p.id ? styles.active : ''}`}
                onClick={() => setCropSensitivityPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isCropIndicator && (
        <div className={styles.placeholderNote}>
          Placeholder map · District-level data pending connection
        </div>
      )}

      <div className={styles.sectionLabel} style={{ marginTop: 12 }}>INDICATOR</div>
      {indicators.map(group => (
        <div key={group.group} className={styles.group}>
          <div className={styles.groupLabel}>
            {group.subgroup === 'sensitivity' && <span className={styles.subTag}>Sensitivity</span>}
            {group.subgroup === 'crop_sensitivity' && <span className={styles.subTag} style={{ background: 'rgba(180,83,9,0.1)', color: '#b45309' }}>Crop Sensitivity · Soora RCP4.5</span>}
            {group.subgroup === 'adaptive_capacity' && <span className={styles.subTag} style={{ background: 'rgba(26,152,80,0.12)', color: '#1A9850' }}>Adaptive Capacity</span>}
            {group.group}
          </div>
          {group.indicators.map(ind => (
            <button
              key={ind.id}
              className={`${styles.indicator} ${selectedId === ind.id ? styles.indicatorActive : ''}`}
              onClick={() => setIndicator(ind.id)}
              title={ind.rationale}
            >
              <div className={styles.indicatorTop}>
                <span className={styles.indicatorLabel}>{ind.label}</span>
                {ind.mapType === 'grid'
                  ? <span className={`${styles.dirBadge}`} style={{ background: 'rgba(180,83,9,0.1)', color: '#b45309' }}>grid · Soora</span>
                  : <span className={`${styles.dirBadge} ${ind.direction === '-' ? styles.dirGood : styles.dirBad}`}>
                      {ind.direction === '-' ? '▲ adaptive' : '▼ risk'}
                    </span>
                }
              </div>
              <span className={styles.indicatorUnit}>{ind.unit} · {ind.source}</span>
            </button>
          ))}
        </div>
      ))}

      <div className={styles.footer}>{footer}</div>
    </div>
  )
}
