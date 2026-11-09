import React from 'react'
import exposureIndicators from '../../data/exposure_indicators.json'
import vulnerabilityIndicators from '../../data/vulnerability_indicators.json'
import historicalIndicators from '../../data/historical_hazard_indicators.json'
import { useCRVAStore } from '../../store/useCRVAStore.js'
import styles from './Panel.module.css'

const CONFIG = {
  historical_hazard: {
    indicators: historicalIndicators,
    stateKey: 'historicalIndicatorId',
    setter: 'setHistoricalIndicator',
    footer: 'IMD rainfall 1981–2020 · NRSC flood atlas 1998–2022 · IMD cyclone tracks 1982–2020 · Rama Rao et al. (2020) method',
    description: 'How often districts have faced drought, floods and cyclones in the past.',
  },
  exposure: {
    indicators: exposureIndicators,
    stateKey: 'exposureIndicatorId',
    setter: 'setExposureIndicator',
    footer: 'Census 2011 · DES 2015–16 · Agriculture Census 2015–16 · Livestock Census 2019 · Rama Rao et al. (2020) method. Where a district lacks an indicator, its weight is shared among the others.',
    description: 'Inventory of rural people and agriculture-dependent livelihoods exposed to climate change impacts.',
  },
  vulnerability: {
    indicators: vulnerabilityIndicators,
    stateKey: 'vulnerabilityIndicatorId',
    setter: 'setVulnerabilityIndicator',
    footer: 'Rama Rao et al. (2020) indicators and weights. Per-capita income is not available; its 4 % weight is added to low-income households (12 %). SHG density, market density and low-income households replace the Atlas definitions.',
    description: 'How well districts can absorb and adapt to climate shocks: natural, human, social, physical and financial capital.',
  },
}

export default function ChoroPanel({ dimension }) {
  const { indicators, stateKey, setter, footer, description, pending } = CONFIG[dimension]
  const store = useCRVAStore()
  const selectedId = store[stateKey]
  const setIndicator = store[setter]
  // Hover or focus an indicator for what it measures and why it matters (as in the future hazard panel)
  const [tip, setTip] = React.useState(null)
  const showTip = (e, ind) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ definition: ind.definition, rationale: ind.rationale, left: r.right + 10, top: r.top })
  }


  return (
    <div className={styles.root}>

      {false && (
        <div className={styles.placeholderNote}>
          {pending ?? 'Placeholder map · District-level data pending connection'}
        </div>
      )}

      {indicators.map(group => (
        <div key={group.group} className={styles.group}>
          <div className={styles.groupLabel}>
            {group.subgroup === 'sensitivity' && <span className={styles.subTag}>Sensitivity</span>}
            {group.subgroup === 'adaptive_capacity' && <span className={styles.subTag}>Adaptive Capacity</span>}
            {group.group}
          </div>
          {group.indicators.map(ind => (
            <button
              key={ind.id}
              className={`${styles.indicator} ${selectedId === ind.id ? styles.indicatorActive : ''}`}
              onClick={() => setIndicator(ind.id)}
              onMouseEnter={e => showTip(e, ind)}
              onMouseLeave={() => setTip(null)}
              onFocus={e => showTip(e, ind)}
              onBlur={() => setTip(null)}
              aria-describedby={tip ? 'choro-tip' : undefined}
            >
              <div className={styles.indicatorTop}>
                <span className={styles.indicatorLabel}>{ind.label}</span>
                {ind.mapType === 'grid'
                  ? null
                  : dimension === 'vulnerability' && ind.weight && <span className={styles.dirBadge}>
                      {ind.direction === '-' ? 'lowers' : 'raises'}
                    </span>
                }
              </div>
              <span className={styles.indicatorUnit}>{ind.unit} · {ind.source}</span>
            </button>
          ))}
        </div>
      ))}

      <div className={styles.footer}>{footer}</div>

      {(tip?.definition || tip?.rationale) && (
        <div id="choro-tip" role="tooltip" className={styles.tooltip}
          style={{ left: tip.left, top: Math.min(tip.top, window.innerHeight - 160) }}>
          {tip.definition && <div>{tip.definition}</div>}
          {tip.rationale && <div className={tip.definition ? styles.tooltipWhy : undefined}>{tip.definition ? <><strong>Why it matters:</strong> {tip.rationale}</> : tip.rationale}</div>}
        </div>
      )}
    </div>
  )
}
