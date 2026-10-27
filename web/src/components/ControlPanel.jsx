import React from 'react'
import { useCRVAStore } from '../store/useCRVAStore.js'
import ClimateHazardPanel from './panels/ClimateHazardPanel.jsx'
import ChoroPanel from './panels/ChoroPanel.jsx'
import RiskScorePanel from './panels/RiskScorePanel.jsx'
import styles from './ControlPanel.module.css'

export default function ControlPanel() {
  const dimensionId = useCRVAStore(s => s.dimensionId)

  return (
    <div className={styles.panel}>
      {dimensionId === 'climate_hazard' && <ClimateHazardPanel />}
      {dimensionId === 'historical_hazard' && <ChoroPanel dimension="historical_hazard" />}
      {dimensionId === 'exposure'       && <ChoroPanel dimension="exposure" />}
      {dimensionId === 'vulnerability'  && <ChoroPanel dimension="vulnerability" />}
      {dimensionId === 'risk_score'     && <RiskScorePanel />}
    </div>
  )
}
