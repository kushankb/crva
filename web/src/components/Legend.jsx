import React from 'react'
import { useCRVAStore, RISK_CLASSES } from '../store/useCRVAStore.js'
import dimensions from '../data/dimensions.json'
import { getHazardMeta, hazardScale, cssGradient, fmt } from '../lib/hazardScale.js'
import { FHI_ID, FHI_CLASSES } from '../lib/hazardIndex.js'
import vulnerabilityIndicators from '../data/vulnerability_indicators.json'
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
}

export default function Legend() {
  const { dimensionId, hazardIndicatorId, vulnerabilityIndicatorId, cropSensitivityPeriod, hazardViewMode } = useCRVAStore()
  const dim = dimensions.find(d => d.id === dimensionId)

  if (dimensionId === 'climate_hazard') {
    const ind = getHazardMeta(hazardIndicatorId)
    if (!ind) return null
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
    const scale = hazardScale(ind, hazardViewMode)
    const sign = v => (anomaly && v > 0 ? '+' : '') + fmt(v)
    return (
      <div className={styles.box}>
        <div className={styles.title}>{ind.label}</div>
        <div className={styles.subLabel}>INDRA-CMIP6 · {anomaly ? 'Change vs 1985–2014' : 'Absolute value'} · {ind.unit}</div>
        <div className={styles.band} style={{ background: cssGradient(scale.cmap) }} />
        <div className={styles.rangeRow}>
          <span>≤ {sign(scale.vmin)}</span>
          {anomaly && <span>0</span>}
          <span>≥ {sign(scale.vmax)}</span>
        </div>
      </div>
    )
  }

  if (dimensionId === 'vulnerability' && vulnerabilityIndicatorId?.startsWith('crop_')) {
    const allVuln = vulnerabilityIndicators.flatMap(g => g.indicators)
    const ind = allVuln.find(i => i.id === vulnerabilityIndicatorId)
    return (
      <div className={styles.box}>
        <div className={styles.title}>{ind?.label ?? 'Crop Yield Sensitivity'}</div>
        <div className={styles.subLabel}>Soora et al. · RCP 4.5 · {cropSensitivityPeriod === '2020' ? '~2020' : cropSensitivityPeriod === '2050' ? '~2050' : '~2080'}</div>
        <div className={styles.band} style={{ background: GRADIENT.RdYlGn }} />
        <div className={styles.rangeRow}>
          <span>–50% loss</span>
          <span style={{ color: 'var(--text-muted)' }}>0</span>
          <span>+50% gain</span>
        </div>
        <div className={styles.source}>% yield change vs baseline · grey = crop not grown · RCP 4.5</div>
      </div>
    )
  }

  if (dimensionId === 'risk_score') {
    return (
      <div className={styles.box}>
        <div className={styles.title}>Composite Risk Score</div>
        <div className={styles.subLabel}>IPCC WG2 · Hazard × Exposure × Vulnerability</div>
        <div className={styles.riskRow}>
          {RISK_CLASSES.slice().reverse().map(c => (
            <div key={c.id} className={styles.riskItem}>
              <div className={styles.riskSwatch} style={{ background: c.color }} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Placeholder for exposure / vulnerability (non-crop)
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
