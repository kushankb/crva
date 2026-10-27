import React from 'react'
import dimensions from '../data/dimensions.json'
import { useCRVAStore } from '../store/useCRVAStore.js'
import styles from './DimensionTabs.module.css'

const MAIN_DIMS  = ['climate_hazard', 'historical_hazard', 'exposure', 'vulnerability']
const RISK_DIM   = 'risk_score'

export default function DimensionTabs() {
  const { dimensionId, setDimension } = useCRVAStore()
  const activeDim = dimensions.find(d => d.id === dimensionId)
  const riskDim   = dimensions.find(d => d.id === RISK_DIM)

  return (
    <div className={styles.wrapper}>
      {/* Risk Score — full-width composite row */}
      <button
        className={`${styles.riskBtn} ${dimensionId === RISK_DIM ? styles.riskBtnActive : ''}`}
        onClick={() => setDimension(RISK_DIM)}
      >
        {riskDim.label}
      </button>

      {/* Component dimensions row */}
      <div className={styles.tabs}>
        {MAIN_DIMS.map(id => {
          const dim = dimensions.find(d => d.id === id)
          return (
            <button
              key={id}
              className={`${styles.tab} ${dimensionId === id ? styles.tabActive : ''}`}
              onClick={() => setDimension(id)}
            >
              {dim.label}
            </button>
          )
        })}
      </div>

      {activeDim && (
        <p className={styles.desc}>{activeDim.description}</p>
      )}
    </div>
  )
}
