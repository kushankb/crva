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
  const [tip, setTip] = React.useState(null)
  const showTip = (e, ind) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ text: ind.description, left: r.right + 10, top: r.top })
  }

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
              onMouseEnter={e => showTip(e, ind)}
              onMouseLeave={() => setTip(null)}
              onFocus={e => showTip(e, ind)}
              onBlur={() => setTip(null)}
              aria-describedby={tip ? 'hazard-tip' : undefined}
            >
              <span className={styles.indicatorLabel}>{ind.label}</span>
              <span className={styles.indicatorUnit}>{ind.unit}</span>
            </button>
          ))}
        </div>
      ))}

      <div className={styles.footer}>INDRA-CMIP6 · 0.1° · 14-model ensemble</div>

      {tip?.text && (
        <div id="hazard-tip" role="tooltip" className={styles.tooltip}
          style={{ left: tip.left, top: Math.min(tip.top, window.innerHeight - 140) }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}
