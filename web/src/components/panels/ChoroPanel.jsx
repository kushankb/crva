import React from 'react'
import exposureIndicators from '../../data/exposure_indicators.json'
import vulnerabilityIndicators from '../../data/vulnerability_indicators.json'
import historicalIndicators from '../../data/historical_hazard_indicators.json'
import { useCRVAStore, CROP_PERIODS } from '../../store/useCRVAStore.js'
import styles from './Panel.module.css'

const CONFIG = {
  historical_hazard: {
    indicators: historicalIndicators,
    stateKey: 'historicalIndicatorId',
    setter: 'setHistoricalIndicator',
    footer: 'IMD · NDMA · CWC · Rama Rao et al. (2020) method',
    description: 'How often districts have faced drought, floods and cyclones in the past.',
    pending: 'Coming next: district drought, flood and cyclone proneness are being compiled.',
  },
  exposure: {
    indicators: exposureIndicators,
    stateKey: 'exposureIndicatorId',
    setter: 'setExposureIndicator',
    footer: 'Census 2011 · DES 2015–16 · Agriculture Census 2015–16 · Livestock Census 2019 · Rama Rao et al. (2020) method. Districts missing from the source data are set to 0.',
    description: 'Inventory of rural people and agriculture-dependent livelihoods exposed to climate change impacts.',
  },
  vulnerability: {
    indicators: vulnerabilityIndicators.filter(g => g.subgroup !== 'crop_sensitivity'),  // crops: right panel only
    stateKey: 'vulnerabilityIndicatorId',
    setter: 'setVulnerabilityIndicator',
    footer: 'IMD · CGWB · NRSC · NSSO · MoA · Soora et al.',
    description: 'Sensitivity (factors increasing susceptibility, including projected crop yield impacts) and adaptive capacity (factors enabling adjustment).',
  },
}

export default function ChoroPanel({ dimension }) {
  const { indicators, stateKey, setter, footer, description, pending } = CONFIG[dimension]
  const store = useCRVAStore()
  const selectedId = store[stateKey]
  const setIndicator = store[setter]

  const isCropIndicator = selectedId?.startsWith('crop_')
  const { cropSensitivityPeriod, setCropSensitivityPeriod } = store

  return (
    <div className={styles.root}>

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

      {!isCropIndicator && dimension !== 'exposure' && (
        <div className={styles.placeholderNote}>
          {pending ?? 'Placeholder map · District-level data pending connection'}
        </div>
      )}

      {indicators.map(group => (
        <div key={group.group} className={styles.group}>
          <div className={styles.groupLabel}>
            {group.subgroup === 'sensitivity' && <span className={styles.subTag}>Sensitivity</span>}
            {group.subgroup === 'crop_sensitivity' && <span className={styles.subTag}>Sensitivity</span>}
            {group.subgroup === 'adaptive_capacity' && <span className={styles.subTag}>Adaptive Capacity</span>}
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
                  ? null
                  : dimension === 'vulnerability' && <span className={styles.dirBadge}>
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
