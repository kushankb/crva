import React from 'react'
import allIndicators from '../../data/climate_hazard_indicators.json'
import { FHI_ID, FHI_ENABLED } from '../../lib/hazardIndex.js'

const indicators = allIndicators
  .map(g => ({ ...g, indicators: g.indicators.filter(i => FHI_ENABLED || i.id !== FHI_ID) }))
  .filter(g => g.indicators.length)
import { useCRVAStore, SSPS, SSP_LABELS } from '../../store/useCRVAStore.js'
import { isAggregate } from '../../lib/aggregate.js'
import { isMM, MODELS, sourceLabel } from '../../lib/multimodel.js'
import { isCX, SEASONS } from '../../lib/compound.js'
import styles from './Panel.module.css'

export default function ClimateHazardPanel() {
  const {
    hazardIndicatorId, setHazardIndicator,
    hazardSsp, setHazardSsp,
    hazardViewMode, setHazardViewMode,
    mmSource, setMmSource,
    cxSeason, setCxSeason,
  } = useCRVAStore()
  const modelView = isAggregate(hazardIndicatorId) || isMM(hazardIndicatorId) || isCX(hazardIndicatorId)
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
          <button key={s} className={`${styles.sspBtn} ${hazardSsp === s ? styles.sspActive : ''}`} onClick={() => setHazardSsp(s)}
            disabled={modelView && s !== 'SSP245'} title={modelView && s !== 'SSP245' ? 'Individual models are available for SSP2-4.5 only' : undefined}>
            {SSP_LABELS[s]}
          </button>
        ))}
      </div>
      {modelView && <div className={styles.note}>Individual-model views use SSP2-4.5.</div>}

      <label className={styles.sectionLabel} style={{ marginTop: 12, display: 'block' }} htmlFor="mm-source">CLIMATE MODELS</label>
      <select id="mm-source" className={styles.select} value={mmSource} onChange={e => setMmSource(e.target.value)} disabled={!modelView}>
        <option value="median">{sourceLabel('median')}</option>
        {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {!modelView && <div className={styles.note}>This indicator uses the 14-model ensemble-mean grid.</div>}

      {isCX(hazardIndicatorId) && (
        <>
          <div className={styles.sectionLabel} style={{ marginTop: 12 }}>SEASON</div>
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
              <span className={styles.indicatorUnit}>
                {ind.rr_weight != null ? `weight ${ind.rr_weight}% · ` : ''}{ind.unit}
              </span>
            </button>
          ))}
        </div>
      ))}

      <div className={styles.footer}>INDRA-CMIP6 · Rama Rao views: 6 individual models, district level · additional: 14-model ensemble mean, 0.1°</div>

      {tip?.text && (
        <div id="hazard-tip" role="tooltip" className={styles.tooltip}
          style={{ left: tip.left, top: Math.min(tip.top, window.innerHeight - 140) }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}
