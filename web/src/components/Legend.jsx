import React from 'react'
import { useCRVAStore, RISK_CLASSES, HAZARD_PERIODS } from '../store/useCRVAStore.js'
import { riskWindow } from '../lib/risk.js'
import dimensions from '../data/dimensions.json'
import { getHazardMeta, hazardScale, cssGradient, fmt } from '../lib/hazardScale.js'
import { FHI_ID, FHI_CLASSES } from '../lib/hazardIndex.js'
import { isAggregate, AGG_CLASSES, AGG_ABS, AGG_RR } from '../lib/aggregate.js'
import { isMM, sourceLabel } from '../lib/multimodel.js'
import { isCX, cxMeta, SEASONS } from '../lib/compound.js'
import vulnerabilityIndicators from '../data/vulnerability_indicators.json'
import { layerMeta, layerLegend, isLayerIndex } from '../lib/exposure.js'
import styles from './Legend.module.css'

const GRADIENT = {
  YlOrRd:  'linear-gradient(to right, #ffffcc, #fed976, #fd8d3c, #e31a1c, #800026)',
  RdYlGn:  'linear-gradient(to right, #d73027, #fdae61, #ffffbf, #a6d96a, #1a9850)',
  Blues:   'linear-gradient(to right, #f7fbff, #6baed6, #08306b)',
  PuBu:    'linear-gradient(to right, #fff7fb, #74a9cf, #023858)',
  YlOrBr:  'linear-gradient(to right, #ffffe5, #fe9929, #662506)',
  RdBu:    'linear-gradient(to right, #d73027, #f7f7f7, #2166ac)',
  BrBG:    'linear-gradient(to right, #543005, #f6e8c3, #01665e)',
}

const DIM_COLORS = {
  exposure:      'var(--dim-exposure)',
  vulnerability: 'var(--dim-vuln)',
  historical_hazard: 'var(--dim-hist)',
}

export default function Legend() {
  const { dimensionId, exposureIndicatorId, historicalIndicatorId, hazardIndicatorId, vulnerabilityIndicatorId, hazardViewMode, hazardPeriod, mmSource, cxSeason } = useCRVAStore()
  const dim = dimensions.find(d => d.id === dimensionId)

  if (dimensionId === 'climate_hazard') {
    const ind = getHazardMeta(hazardIndicatorId)
    if (!ind) return null
    if (isAggregate(hazardIndicatorId)) {
      return (
        <div className={styles.box}>
          <div className={styles.title}>{ind.label}</div>
          <div className={styles.subLabel}>
            {hazardIndicatorId === AGG_RR
              ? `Rama Rao index · relative to other districts · ${sourceLabel(mmSource)} · SSP2-4.5`
              : hazardIndicatorId === AGG_ABS
                ? `Share of indicator weight past its worsening threshold · ${sourceLabel(mmSource)}`
                : `Rank among districts · fifths · ${sourceLabel(mmSource)}`}
          </div>
          {AGG_CLASSES[hazardIndicatorId].map(c => (
            <div key={c.label} className={styles.rangeRow} style={{ justifyContent: 'flex-start', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: c.color, border: '1px solid var(--border)', display: 'inline-block' }} />
              <span>{c.label}{c.note ? ` · ${c.note}` : ''}</span>
            </div>
          ))}
        </div>
      )
    }
    if (hazardIndicatorId === FHI_ID) {
      return (
        <div className={styles.box}>
          <div className={styles.title}>{ind.label}</div>
          <div className={styles.subLabel}>Rama Rao et al. (2020) weights · change vs 1985–2014 · by district</div>
          {FHI_CLASSES.map(c => (
            <div key={c.label} className={styles.rangeRow} style={{ justifyContent: 'flex-start', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: c.color, border: '1px solid var(--border)', display: 'inline-block' }} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      )
    }
    const anomaly = hazardViewMode === 'anomaly'
    const scale = hazardScale(isCX(hazardIndicatorId) ? cxMeta(hazardIndicatorId, cxSeason) : ind, hazardViewMode)
    const sign = v => (anomaly && v > 0 ? '+' : '') + fmt(v)
    return (
      <div className={styles.box}>
        <div className={styles.title}>{ind.label}</div>
        <div className={styles.subLabel}>
          {isCX(hazardIndicatorId) ? `${sourceLabel(mmSource)} · ${SEASONS.find(x => x.id === cxSeason)?.label} · SSP2-4.5 · by district` : isMM(hazardIndicatorId) ? `${sourceLabel(mmSource)} · SSP2-4.5 · by district` : 'INDRA-CMIP6 ensemble mean · 0.1°'} · {anomaly ? 'Change vs 1985–2014' : 'Absolute value'} · {anomaly && isMM(hazardIndicatorId) && ['mm_annual_rain', 'mm_june_rain', 'mm_july_rain', 'mm_rainy_days'].includes(hazardIndicatorId) ? '%' : ind.unit}
        </div>
        <div className={styles.band} style={{ background: cssGradient(scale.cmap) }} />
        <div className={styles.rangeRow}>
          <span>≤ {sign(scale.vmin)}</span>
          {anomaly && <span>0</span>}
          <span>≥ {sign(scale.vmax)}</span>
        </div>
        {anomaly && (isMM(hazardIndicatorId) || isCX(hazardIndicatorId)) && <div className={styles.source}>Brown or red = more hazard, in the Atlas's direction (less rain, more heat, drought or extreme rain)</div>}
      </div>
    )
  }

  if (dimensionId === 'exposure' || dimensionId === 'historical_hazard' || dimensionId === 'vulnerability') {
    const id = { exposure: exposureIndicatorId, historical_hazard: historicalIndicatorId, vulnerability: vulnerabilityIndicatorId }[dimensionId]
    const ind = layerMeta(dimensionId, id)
    const items = layerLegend(dimensionId, id)
    const isIdx = isLayerIndex(dimensionId, id)
    return (
      <div className={styles.box}>
        <div className={styles.title}>{ind?.label}</div>
        <div className={styles.subLabel}>
          {isIdx
            ? 'Rama Rao et al. (2020) · relative to the national mean'
            : `${ind?.unit} · ${dimensionId === 'historical_hazard' ? 'classes of the source data' : dimensionId === 'exposure' ? 'Atlas class bands' : 'value bands'}`}
        </div>
        {!isIdx && (
          <div className={styles.dirNote}>
            Darker = {{ vulnerability: 'more vulnerable', exposure: 'more exposed', historical_hazard: 'more hazard' }[dimensionId]}
            {ind?.direction === '-' && <> · <strong>higher values lower it</strong>, so the lowest values are darkest</>}
          </div>
        )}
        <div className={styles.riskRow}>
          {items.slice().reverse().map(c => (
            <div key={c.label} className={styles.riskItem}>
              <div className={styles.riskSwatch} style={{ background: c.color }} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.source}>{dimensionId === 'vulnerability' ? '14 of 15 Atlas indicators · urban districts, islands and Ladakh not assessed' : dimensionId === 'exposure'
          ? 'Rural districts · urban districts, islands and Ladakh not assessed · no colour = no data'
          : 'Rural districts · urban districts, islands and Ladakh not assessed'}</div>
      </div>
    )
  }

  if (dimensionId === 'risk_score') {
    return (
      <div className={styles.box}>
        <div className={styles.title}>Climate risk index</div>
        <div className={styles.subLabel}>Rama Rao et al. (2020) · {HAZARD_PERIODS.find(p => p.id === riskWindow(hazardPeriod))?.label} · relative to the national mean</div>
        <div className={styles.riskRow}>
          {RISK_CLASSES.map(c => (
            <div key={c.id} className={styles.riskItem}>
              <div className={styles.riskSwatch} style={{ background: c.color }} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.source}>No colour: not assessed (urban districts, islands, Ladakh, or less than half the risk weight has data)</div>
      </div>
    )
  }

  // Placeholder for dimensions without data
  const color = DIM_COLORS[dimensionId] ?? '#888'
  return (
    <div className={styles.box}>
      <div className={styles.title}>{dim?.label}</div>
      <div className={styles.subLabel}>Placeholder · District-level data pending</div>
      <div className={styles.choroBand} style={{ background: `linear-gradient(to right, #f7f7f7, ${color})` }} />
      <div className={styles.rangeRow}><span>Low</span><span>High</span></div>
    </div>
  )
}
