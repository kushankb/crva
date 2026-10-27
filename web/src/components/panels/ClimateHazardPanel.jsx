import React from 'react'
import allIndicators from '../../data/climate_hazard_indicators.json'
import { FHI_ID, FHI_ENABLED } from '../../lib/hazardIndex.js'
import { useCRVAStore, SSPS, SSP_LABELS } from '../../store/useCRVAStore.js'
import { isAggregate } from '../../lib/aggregate.js'
import { isMM, MODELS, sourceLabel } from '../../lib/multimodel.js'
import { isCX, SEASONS } from '../../lib/compound.js'
import styles from './Panel.module.css'

const groups = allIndicators
  .map(g => ({ ...g, indicators: g.indicators.filter(i => FHI_ENABLED || i.id !== FHI_ID) }))
  .filter(g => g.indicators.length)
// Main views first; the ensemble-mean grids sit behind "More climate indicators".
const MAIN = groups.filter(g => !g.group.startsWith('Additional'))
const MORE = groups.filter(g => g.group.startsWith('Additional'))
const GROUP_TITLES = { 'Aggregate future hazard': 'Overall future hazard' }

// Settings for the selected indicator, shown right under it and only when they apply.
function IndicatorOptions({ id }) {
  const {
    hazardSsp, setHazardSsp, hazardViewMode, setHazardViewMode,
    mmSource, setMmSource, cxSeason, setCxSeason,
  } = useCRVAStore()
  const agg = isAggregate(id), mm = isMM(id), cx = isCX(id)
  const grid = !agg && !mm && !cx && id !== FHI_ID
  const models = agg || mm || cx

  return (
    <div className={styles.optionsBox}>
      {cx && (
        <>
          <div className={styles.optionLabel}>Season</div>
          <div className={styles.sspRow}>
            {SEASONS.map(x => (
              <button key={x.id} className={`${styles.sspBtn} ${cxSeason === x.id ? styles.sspActive : ''}`} onClick={() => setCxSeason(x.id)} title={x.months}>
                {x.label}
              </button>
            ))}
          </div>
          <div className={styles.note}>{SEASONS.find(x => x.id === cxSeason)?.months} · days per year</div>
        </>
      )}

      {!agg && (
        <>
          <div className={styles.optionLabel}>Show</div>
          <div className={styles.toggleRow}>
            <button className={`${styles.toggle} ${hazardViewMode === 'values' ? styles.active : ''}`} onClick={() => setHazardViewMode('values')}>Projected value</button>
            <button className={`${styles.toggle} ${hazardViewMode === 'anomaly' ? styles.active : ''}`} onClick={() => setHazardViewMode('anomaly')}>Change from 1985–2014</button>
          </div>
        </>
      )}

      {grid && (
        <>
          <div className={styles.optionLabel}>Scenario</div>
          <div className={styles.sspRow}>
            {SSPS.map(s => (
              <button key={s} className={`${styles.sspBtn} ${hazardSsp === s ? styles.sspActive : ''}`} onClick={() => setHazardSsp(s)}>
                {SSP_LABELS[s]}
              </button>
            ))}
          </div>
          <div className={styles.note}>14-model ensemble mean, 0.1° grid</div>
        </>
      )}

      {models && (
        <details className={styles.advanced} open={mmSource !== 'median'}>
          <summary>Advanced · climate model: <strong>{mmSource === 'median' ? 'median of 6' : mmSource}</strong></summary>
          <select aria-label="Climate model" className={styles.select} value={mmSource} onChange={e => setMmSource(e.target.value)}>
            <option value="median">{sourceLabel('median')}</option>
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className={styles.note}>SSP2-4.5 · six INDRA-CMIP6 models</div>
        </details>
      )}
    </div>
  )
}

export default function ClimateHazardPanel() {
  const { hazardIndicatorId, setHazardIndicator } = useCRVAStore()
  const [tip, setTip] = React.useState(null)
  const inMore = MORE.some(g => g.indicators.some(i => i.id === hazardIndicatorId))
  const showTip = (e, ind) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ text: ind.description, left: r.right + 10, top: r.top })
  }

  const renderGroup = group => (
    <div key={group.group} className={styles.group}>
      <div className={styles.groupLabel}>{GROUP_TITLES[group.group] ?? group.group}</div>
      {group.indicators.map(ind => (
        <React.Fragment key={ind.id}>
          <button
            className={`${styles.indicator} ${hazardIndicatorId === ind.id ? styles.indicatorActive : ''}`}
            onClick={() => setHazardIndicator(ind.id)}
            onMouseEnter={e => showTip(e, ind)}
            onMouseLeave={() => setTip(null)}
            onFocus={e => showTip(e, ind)}
            onBlur={() => setTip(null)}
            aria-describedby={tip ? 'hazard-tip' : undefined}
            aria-expanded={hazardIndicatorId === ind.id}
          >
            <span className={styles.indicatorLabel}>{ind.label}</span>
            <span className={styles.indicatorUnit}>
              {ind.rr_weight != null ? `weight ${ind.rr_weight}% · ` : ''}{ind.unit}
            </span>
          </button>
          {hazardIndicatorId === ind.id && <IndicatorOptions id={ind.id} />}
        </React.Fragment>
      ))}
    </div>
  )

  return (
    <div className={styles.root}>
      <p className={styles.dimDesc}>Pick an indicator, then the period at the bottom of the map.</p>
      <div className={styles.sectionLabel}>INDICATOR</div>
      {MAIN.map(renderGroup)}

      <details className={styles.more} open={inMore}>
        <summary>More climate indicators · ensemble-mean grids, all scenarios</summary>
        {MORE.map(renderGroup)}
      </details>

      <div className={styles.footer}>INDRA-CMIP6 · main views: 6 individual models, district level · more indicators: 14-model ensemble mean, 0.1°</div>

      {tip?.text && (
        <div id="hazard-tip" role="tooltip" className={styles.tooltip}
          style={{ left: tip.left, top: Math.min(tip.top, window.innerHeight - 140) }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}
