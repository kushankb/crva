import React from 'react'
import { useCRVAStore, RISK_CLASSES, HAZARD_PERIODS } from '../../store/useCRVAStore.js'
import { loadRisk, riskCounts, riskWindow, RISK_PARTS_W } from '../../lib/risk.js'
import styles from './Panel.module.css'

// Left panel for the climate risk index: what it combines (weights drawn to scale), how districts fall into classes
// for the chosen period, and how to read it.
export default function RiskScorePanel() {
  const { hazardPeriod } = useCRVAStore()
  const w = riskWindow(hazardPeriod)
  const [data, setData] = React.useState(null)
  React.useEffect(() => { loadRisk().then(setData) }, [])
  const counts = data ? riskCounts(data, w) : null          // Very low … Very high
  const total = counts ? counts.reduce((a, b) => a + b, 0) : 0
  const period = HAZARD_PERIODS.find(p => p.id === w)   // label only; the range is in the bottom bar

  return (
    <div className={styles.root}>
      <div className={styles.sectionLabel} style={{ marginTop: 4 }}>WHAT GOES INTO RISK</div>
      <div className={styles.weightStack} role="img" aria-label={RISK_PARTS_W.map(p => `${p.label} ${p.weight}%`).join(', ')}>
        {RISK_PARTS_W.map(p => <span key={p.id} style={{ flex: p.weight, background: p.color }} title={`${p.label}: ${p.weight}%`} />)}
      </div>
      {RISK_PARTS_W.map(p => (
        <div key={p.id} className={styles.weightRow}>
          <span className={styles.weightDot} style={{ background: p.color }} />
          <span className={styles.weightLabel}>{p.label}</span>
          <span className={styles.weightVal}>{p.weight}%</span>
        </div>
      ))}
      <div className={styles.formulaNote} style={{ marginTop: 6 }}>
        Atlas Table 6. Where a district has no data for a part, its weight is shared among the other parts.
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 16 }}>DISTRICTS BY CLASS · {period?.label}</div>
      <div className={styles.riskDist}>
        {RISK_CLASSES.map(cls => {
          const n = counts ? counts[['Very low', 'Low', 'Medium', 'High', 'Very high'].indexOf(cls.id)] : null
          const pct = total ? (n / total) * 100 : 0
          return (
            <div key={cls.id} className={styles.riskRow}>
              <span className={styles.riskDot} style={{ background: cls.color }} />
              <span className={styles.riskLabel}>{cls.label}</span>
              <div className={styles.riskBar}><div className={styles.riskBarFill} style={{ width: `${pct}%`, background: cls.color }} /></div>
              <span className={styles.riskCount}>{n ?? '…'}</span>
            </div>
          )
        })}
        <div className={styles.riskTotal}>{total ? `${total} districts with a risk index` : 'Loading…'}</div>
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 16 }}>HOW TO READ IT</div>
      <ul className={styles.readList}>
        <li><strong>Relative, not absolute.</strong> Classes compare each district with the national average: Medium is within ±0.5 SD, Very high more than 1.5 SD above (Atlas Table 7).</li>
        <li><strong>Click a state</strong> to see its districts: where they rank in India and what drives them. <strong>Zoom in</strong> to select a single district.</li>
        <li><strong>The period</strong> changes only the future-hazard part. Its index varies far less than the other parts, so few districts change class between periods.</li>
      </ul>

      <div className={styles.footer}>Rama Rao et al. (2020) ICAR-CRIDA Atlas · FAO TCP/IND/4005</div>
    </div>
  )
}
