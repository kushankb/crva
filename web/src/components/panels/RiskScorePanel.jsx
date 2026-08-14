import React from 'react'
import { RISK_CLASSES } from '../../store/useCRVAStore.js'
import styles from './Panel.module.css'

const FORMULA_STEPS = [
  { label: 'Future Hazard', abbr: 'H_f', dim: 'climate_hazard', color: 'var(--dim-hazard)' },
  { label: 'Historical Hazard', abbr: 'H_h', dim: 'historical_hazard', color: 'var(--dim-hist)' },
  { label: 'Exposure', abbr: 'E', dim: 'exposure', color: 'var(--dim-exposure)' },
  { label: 'Sensitivity', abbr: 'S', dim: 'vulnerability', color: 'var(--dim-vuln)' },
  { label: 'Adaptive Capacity', abbr: 'AC', dim: 'vulnerability', color: '#1A9850' },
]

// Placeholder district counts per risk class
const PLACEHOLDER_COUNTS = { 5: 108, 4: 185, 3: 220, 2: 190, 1: 115 }
const TOTAL = Object.values(PLACEHOLDER_COUNTS).reduce((a, b) => a + b, 0)

export default function RiskScorePanel() {
  return (
    <div className={styles.root}>
      <p className={styles.dimDesc}>
        Composite district-level risk score following the IPCC WG2 framework:
        Risk = f(Hazard, Exposure, Vulnerability)
      </p>

      <div className={styles.placeholderNote}>
        ⚠ Placeholder data — finalise indicator datasets to compute risk scores
      </div>

      {/* Formula */}
      <div className={styles.sectionLabel} style={{ marginTop: 12 }}>RISK FORMULA</div>
      <div className={styles.formula}>
        <div className={styles.formulaLine}>
          <span style={{ color: 'var(--dim-risk)', fontWeight: 700 }}>Risk</span>
          <span className={styles.formulaOp}>=</span>
          <span style={{ color: 'var(--dim-hazard)' }}>H_future</span>
          <span className={styles.formulaOp}>+</span>
          <span style={{ color: 'var(--dim-hist)' }}>H_hist</span>
          <span className={styles.formulaOp}>+</span>
          <span style={{ color: 'var(--dim-exposure)' }}>E</span>
          <span className={styles.formulaOp}>+</span>
          <span style={{ color: 'var(--dim-vuln)' }}>S</span>
          <span className={styles.formulaOp}>−</span>
          <span style={{ color: '#1A9850' }}>AC</span>
        </div>
        <div className={styles.formulaNote}>
          Equal weights by default; sensitivity analysis to alternate weights documented separately.
        </div>
      </div>

      {/* Risk distribution */}
      <div className={styles.sectionLabel} style={{ marginTop: 14 }}>DISTRICT DISTRIBUTION</div>
      <div className={styles.riskDist}>
        {RISK_CLASSES.map(cls => {
          const count = PLACEHOLDER_COUNTS[cls.id]
          const pct = (count / TOTAL * 100).toFixed(0)
          return (
            <div key={cls.id} className={styles.riskRow}>
              <span className={styles.riskDot} style={{ background: cls.color }} />
              <span className={styles.riskLabel}>{cls.label}</span>
              <div className={styles.riskBar}>
                <div className={styles.riskBarFill} style={{ width: `${pct}%`, background: cls.color }} />
              </div>
              <span className={styles.riskCount}>{count}</span>
            </div>
          )
        })}
        <div className={styles.riskTotal}>Total: {TOTAL} districts (placeholder)</div>
      </div>

      {/* Weighting */}
      <div className={styles.sectionLabel} style={{ marginTop: 14 }}>COMPONENT WEIGHTS</div>
      {FORMULA_STEPS.map(s => (
        <div key={s.abbr} className={styles.weightRow}>
          <span className={styles.weightDot} style={{ background: s.color }} />
          <span className={styles.weightLabel}>{s.label}</span>
          <span className={styles.weightVal}>25%</span>
        </div>
      ))}
      <div className={styles.formulaNote} style={{ marginTop: 6 }}>
        Weights to be confirmed through stakeholder consultation (Rama Rao et al., 2019).
      </div>

      <div className={styles.footer}>IPCC WG2 · CRIDA methodology · TCP/IND/4005</div>
    </div>
  )
}
