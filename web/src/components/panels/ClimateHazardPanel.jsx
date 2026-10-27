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
// The 14-model ensemble-mean grids stay in the app but are hidden for now.
export const SHOW_ENSEMBLE_GRIDS = false
const MAIN = groups.filter(g => !g.group.startsWith('Additional'))
const MORE = SHOW_ENSEMBLE_GRIDS ? groups.filter(g => g.group.startsWith('Additional')) : []
const GROUP_TITLES = { 'Aggregate future hazard': 'Overall future hazard' }

// Settings for the selected indicator, shown right under it and only when they apply.
function IndicatorOptions({ id }) {
  const {
    hazardSsp, setHazardSsp, hazardViewMode, setHazardViewMode,
    mmSource, setMmSource, cxSeason, setCxSeason,
  } = useCRVAStore()
  const agg = isAggregate(id), mm = isMM(id), cx = isCX(id)
  const grid = !agg && !mm && !cx && id !== FHI_ID
  if (!cx && !grid) return null

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
      <p className={styles.hint}>Pick an indicator, then the period, what to show and the climate model in the bar below the map.</p>
      {MAIN.map(renderGroup)}

      {MORE.length > 0 && (
        <details className={styles.more} open={inMore}>
          <summary>More climate indicators · ensemble mean, all scenarios</summary>
          {MORE.map(renderGroup)}
        </details>
      )}

      <div className={styles.footer}>INDRA-CMIP6 · SSP2-4.5 · 6 individual models, district level</div>

      {tip?.text && (
        <div id="hazard-tip" role="tooltip" className={styles.tooltip}
          style={{ left: tip.left, top: Math.min(tip.top, window.innerHeight - 140) }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}
