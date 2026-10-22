import React from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts'
import { useCRVAStore, RISK_CLASSES, SSPS, SSP_LABELS, HAZARD_PERIODS } from '../store/useCRVAStore.js'
import hazardIndicators from '../data/climate_hazard_indicators.json'
import { fmt } from '../lib/hazardScale.js'
import { loadStats } from '../lib/stats.js'
import { FHI_ID, FHI_ENABLED, FHI_COMPONENTS, fhiClassOf } from '../lib/hazardIndex.js'
import { AGG_RR, AGG_ABS, AGG_REL, AGG_TITLES, isAggregate, statsCategory, aggClass, COMPONENT_LABELS as AGG_LABELS, THRESHOLD_TEXT } from '../lib/aggregate.js'
import { isMM, mmComp } from '../lib/multimodel.js'
import styles from './DetailDrawer.module.css'

function getIndicatorMeta(id) {
  for (const g of hazardIndicators) {
    const ind = g.indicators.find(i => i.id === id)
    if (ind) return ind
  }
  return null
}

const DIM_COLORS = {
  climate_hazard: '#E05A3A',
  exposure: '#4A90C4',
  vulnerability: '#A259C4',
  risk_score: '#D73027',
}

const SSP_COLORS = { SSP126: '#1A9850', SSP245: '#80C97A', SSP370: '#F46D43', SSP585: '#D73027' }

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'hazard',       label: 'Climate Hazard' },
  { id: 'crop',         label: 'Crop Sensitivity' },
  { id: 'exposure',     label: 'Exposure' },
  { id: 'vulnerability',label: 'Vulnerability' },
]

export default function DetailDrawer() {
  const { selectedFeature, setSelectedFeature } = useCRVAStore()
  const [stats, setStats] = React.useState(null)
  const { drawerTab: activeTab, setDrawerTab: setActiveTab } = useCRVAStore()

  React.useEffect(() => {
    if (!selectedFeature) { setStats(null); return }
    loadStats().then(data => {
      const key = `${selectedFeature.type}:${selectedFeature.id}`
      setStats(data[key] ?? null)
    })
  }, [selectedFeature])

  if (!selectedFeature) return null

  const riskClass = stats?.risk_score?.class ?? null
  const riskInfo  = RISK_CLASSES.find(r => r.id === riskClass)

  const radarData = [
    { axis: 'Climate Hazard',  value: stats?.climate_hazard?.composite_score ?? 0 },
    { axis: 'Exposure',        value: stats?.exposure?.composite_score ?? 0 },
    { axis: 'Vulnerability',   value: stats?.vulnerability?.composite_score ?? 0 },
  ]

  const hasHazardData = !!(stats?.climate_hazard?.indicators)

  return (
    <aside className={styles.drawer}>
      <header className={styles.header}>
        <div>
          <div className={styles.featureType}>{selectedFeature.type}</div>
          <div className={styles.featureName}>{selectedFeature.name}</div>
          {selectedFeature.state_name && <div className={styles.stateName}>{selectedFeature.state_name}</div>}
        </div>
        <div className={styles.headerRight}>
          {riskInfo && (
            <div className={styles.riskBadge} style={{ background: riskInfo.color + '22', color: riskInfo.color, borderColor: riskInfo.color + '44' }}>
              {riskInfo.label} Risk
            </div>
          )}
          <button className={styles.close} onClick={() => setSelectedFeature(null)}>✕</button>
        </div>
      </header>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {!stats && !hasHazardData && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◎</div>
            <div>No CRVA data for this {selectedFeature.type}.</div>
            <div className={styles.emptyNote}>Exposure, Vulnerability and Risk Score data pending.</div>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab stats={stats} riskInfo={riskInfo} radarData={radarData} hasHazardData={hasHazardData} />
        )}
        {activeTab === 'hazard' && <HazardTab stats={stats} />}
        {activeTab === 'crop' && <CropTab stats={stats} />}
        {activeTab === 'exposure' && <IndicatorTab data={stats?.exposure} label="Exposure" color={DIM_COLORS.exposure} note="Agricultural exposure of rural livelihoods" />}
        {activeTab === 'vulnerability' && <IndicatorTab data={stats?.vulnerability} label="Vulnerability" color={DIM_COLORS.vulnerability} note="Sensitivity factors and adaptive capacity" />}
      </div>

      <div className={styles.source}>TCP/IND/4005 · IPCC WG2 AR6 · CRIDA · INDRA-CMIP6</div>
    </aside>
  )
}

function OverviewTab({ stats, riskInfo, radarData, hasHazardData }) {
  const { hazardSsp, hazardPeriod } = useCRVAStore()
  if (!hasHazardData && !stats) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>◎</div>
        <div>No data available.</div>
        <div className={styles.emptyNote}>Exposure, Vulnerability and Risk Score data pending.</div>
      </div>
    )
  }

  // If we have hazard data, show a summary of key indicators
  if (hasHazardData) {
    const inds = stats.climate_hazard.indicators
    const KEY_INDS = ['tmean', 'heat_stress_35', 'summer_tmean', 'prcptot', 'june_precip', 'cdd', 'rx3day']
    // Historical has no future to compare against, so default the comparison to ~2050.
    const period = hazardPeriod === 'historical' ? '2050' : hazardPeriod
    const futLabel = `${SSP_LABELS[hazardSsp]} ${HAZARD_PERIODS.find(p => p.id === period)?.label ?? period}`
    const summaryRows = KEY_INDS.filter(id => inds[id]).map(id => {
      const meta = getIndicatorMeta(id)
      const hist = inds[id]?.historical?.mean
      const fut585 = inds[id]?.[hazardSsp]?.[period]?.mean
      const delta = (hist != null && fut585 != null) ? (fut585 - hist) : null
      return { id, label: meta?.label ?? id, unit: meta?.unit ?? '', hist, fut585, delta }
    })

    return (
      <>
        {stats.climate_hazard.multimodel?.aggregate?.[period] && (() => {
          const cur = stats.climate_hazard.multimodel.aggregate[period]
          const n = stats.climate_hazard.multimodel.n_models
          return (
            <>
              <div className={styles.sectionTitle}>Future hazard · SSP2-4.5 {HAZARD_PERIODS.find(p => p.id === period)?.label} · {n} models</div>
              {[AGG_RR, AGG_ABS, AGG_REL].map(id => {
                const cat = statsCategory(id, cur), c = aggClass(id, cat)
                return (
                  <div key={id} className={styles.riskSummary} style={{ borderColor: c?.color, marginTop: 6 }}>
                    <span className={styles.riskDot} style={{ background: c?.color }} />
                    <span style={{ fontWeight: id === AGG_RR ? 700 : 600 }}>{AGG_TITLES[id]}</span>
                    <span className={styles.riskScore} style={{ fontWeight: 700 }}>{cat ?? '—'}</span>
                  </div>
                )
              })}
              {cur.atlas && <div className={styles.summaryNote}>Rama Rao index: {cur.atlas.n_unfav} of {n} models unfavourable, {cur.atlas.n_fav} favourable.</div>}
              <div style={{ marginBottom: 14 }} />
            </>
          )
        })()}
        {FHI_ENABLED && stats.climate_hazard.future_hazard_index?.[hazardSsp]?.[period] && (() => {
          const cur = stats.climate_hazard.future_hazard_index[hazardSsp][period]
          const c = fhiClassOf(cur.category)
          return (
            <>
              <div className={styles.sectionTitle}>Future hazard index · {futLabel}</div>
              <div className={styles.riskSummary} style={{ borderColor: c.color, marginTop: 0, marginBottom: 14 }}>
                <span className={styles.riskDot} style={{ background: c.color }} />
                <span style={{ fontWeight: 700 }}>{cur.category}</span>
                <span className={styles.riskScore}>index {cur.value > 0 ? '+' : ''}{cur.value.toFixed(3)}</span>
              </div>
            </>
          )
        })()}
        <div className={styles.sectionTitle}>Key Climate Hazard Indicators</div>
        <div className={styles.summaryNote}>Historical baseline (1985–2014) vs {futLabel} · set scenario and period on the left</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Indicator</th>
              <th style={{ textAlign: 'right' }}>Historical</th>
              <th style={{ textAlign: 'right' }}>{futLabel}</th>
              <th style={{ textAlign: 'right' }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(r => (
              <tr key={r.id}>
                <td style={{ fontSize: 10.5 }}>{r.label}</td>
                <td style={{ textAlign: 'right' }}>{r.hist != null ? fmt(r.hist) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.fut585 != null ? fmt(r.fut585) : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {r.delta != null ? `${r.delta > 0 ? '+' : ''}${fmt(r.delta)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.summaryNote} style={{ marginTop: 8 }}>→ Switch to Climate Hazard tab for full projections by indicator and scenario.</div>

        {stats?.risk_score && (
          <>
            <div className={styles.sectionTitle} style={{ marginTop: 14 }}>CRVA Summary Scores</div>
            <div className={styles.scoreGrid}>
              {[
                { id: 'climate_hazard', label: 'Climate Hazard', score: stats?.climate_hazard?.composite_score },
                { id: 'exposure',       label: 'Exposure',       score: stats?.exposure?.composite_score },
                { id: 'vulnerability',  label: 'Vulnerability',  score: stats?.vulnerability?.composite_score },
                { id: 'risk_score',     label: 'Risk Score',     score: stats?.risk_score?.score },
              ].map(d => (
                <div key={d.id} className={styles.scoreCard}>
                  <div className={styles.scoreDimLabel}>{d.label}</div>
                  <div className={styles.scoreVal} style={{ color: DIM_COLORS[d.id] }}>
                    {d.score != null ? d.score.toFixed(1) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )
  }

  // Fallback: full CRVA overview (for when all dimension data exists)
  return (
    <>
      <div className={styles.sectionTitle}>CRVA Summary Scores</div>
      <div className={styles.scoreGrid}>
        {[
          { id: 'climate_hazard', label: 'Climate Hazard', score: stats?.climate_hazard?.composite_score },
          { id: 'exposure',       label: 'Exposure',        score: stats?.exposure?.composite_score },
          { id: 'vulnerability',  label: 'Vulnerability',   score: stats?.vulnerability?.composite_score },
          { id: 'risk_score',     label: 'Risk Score',      score: stats?.risk_score?.score },
        ].map(d => (
          <div key={d.id} className={styles.scoreCard}>
            <div className={styles.scoreDimLabel}>{d.label}</div>
            <div className={styles.scoreVal} style={{ color: DIM_COLORS[d.id] }}>
              {d.score != null ? d.score.toFixed(1) : '—'}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sectionTitle} style={{ marginTop: 14 }}>Risk Profile</div>
      <div className={styles.radarWrap}>
        <ResponsiveContainer width="100%" height={200}>
          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
            <Radar name="Score" dataKey="value" stroke="#E05A3A" fill="#E05A3A" fillOpacity={0.25} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {riskInfo && (
        <div className={styles.riskSummary} style={{ borderColor: riskInfo.color + '44', background: riskInfo.color + '11' }}>
          <span className={styles.riskDot} style={{ background: riskInfo.color }} />
          <span style={{ color: riskInfo.color, fontWeight: 700 }}>{riskInfo.label} Risk</span>
          <span className={styles.riskScore}>Score: {stats.risk_score.score.toFixed(1)} / 100</span>
        </div>
      )}
    </>
  )
}

function HazardTab({ stats }) {
  const { hazardIndicatorId, setHazardIndicator, hazardViewMode } = useCRVAStore()
  const [showPicker, setShowPicker] = React.useState(false)
  const indicators = stats?.climate_hazard?.indicators
  const anomaly = hazardViewMode === 'anomaly'

  const availableIds = indicators
    ? hazardIndicators.flatMap(g => g.indicators.map(i => i.id))
        .filter(id => indicators[id]
          || (FHI_ENABLED && id === FHI_ID && stats?.climate_hazard?.future_hazard_index)
          || ((isAggregate(id) || isMM(id)) && stats?.climate_hazard?.multimodel))
    : []

  // Use the store's selected indicator if available, else first available
  const activeId = availableIds.includes(hazardIndicatorId) ? hazardIndicatorId : availableIds[0]
  const meta = getIndicatorMeta(activeId)
  const indData = indicators?.[activeId]
  const fhi = stats?.climate_hazard?.future_hazard_index

  if (!indicators || availableIds.length === 0) {
    return (
      <div className={styles.empty} style={{ height: 120 }}>
        <div>No climate hazard data available.</div>
      </div>
    )
  }

  const histMean = indData?.historical?.mean ?? null
  const histP10  = indData?.historical?.p10  ?? null
  const histP90  = indData?.historical?.p90  ?? null

  // Change view: future − historical of the regional mean, matching the map's Change view.
  const value = (s, p) => {
    const v = indData?.[s]?.[p]?.mean
    if (v == null) return null
    return anomaly ? (histMean == null ? null : v - histMean) : v
  }
  const show = v => v == null ? '—' : (anomaly && v > 0 ? '+' : '') + fmt(v)

  const chartData = HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => {
    const row = { period: p.label }
    SSPS.forEach(s => { row[s] = value(s, p.id) })
    return row
  })

  return (
    <>
      {/* Indicator selector */}
      <div className={styles.indicatorPickerRow}>
        <div className={styles.activeIndicatorLabel}>
          {meta?.label ?? activeId}
          <span className={styles.activeIndicatorUnit}>{meta?.unit}</span>
        </div>
        <button className={styles.changeIndBtn} onClick={() => setShowPicker(v => !v)}>
          {showPicker ? 'Done' : 'Change'}
        </button>
      </div>

      {showPicker && (
        <div className={styles.indicatorPicker}>
          {hazardIndicators.map(g => {
            const groupItems = g.indicators.filter(i => availableIds.includes(i.id))
            if (groupItems.length === 0) return null
            return (
              <div key={g.group} className={styles.pickerGroup}>
                <div className={styles.pickerGroupLabel}>{g.group}</div>
                {groupItems.map(i => (
                  <button
                    key={i.id}
                    className={`${styles.pickerItem} ${i.id === activeId ? styles.pickerItemActive : ''}`}
                    onClick={() => { setHazardIndicator(i.id); setShowPicker(false) }}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {isAggregate(activeId) ? <AggView id={activeId} mm={stats?.climate_hazard?.multimodel} />
        : isMM(activeId) ? <MMView id={activeId} mm={stats?.climate_hazard?.multimodel} />
        : activeId === FHI_ID ? <IndexView fhi={fhi} /> : <>
      {/* Historical baseline */}
      <div className={styles.sectionTitle} style={{ marginTop: 8 }}>Historical baseline (1985–2014)</div>
      <div className={styles.baselineRow}>
        <span>Mean</span>
        <span className={styles.baselineVal}>{histMean != null ? fmt(histMean) : '—'}</span>
      </div>
      {histP10 != null && (
        <div className={styles.baselineRow} style={{ fontSize: 11, opacity: 0.7 }}>
          <span>P10 – P90 range</span>
          <span className={styles.baselineVal}>{fmt(histP10)} – {fmt(histP90)}</span>
        </div>
      )}

      {/* Future projections bar chart */}
      <div className={styles.sectionTitle} style={{ marginTop: 10 }}>{anomaly ? 'Change from baseline by scenario' : 'Future projections by scenario'}</div>
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} barSize={7} barGap={1} barCategoryGap="25%" margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            {anomaly
              ? <ReferenceLine y={0} stroke="#888" />
              : histMean != null && <ReferenceLine y={histMean} stroke="#888" strokeDasharray="4 2" />}
            <Tooltip
              contentStyle={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)', fontSize: 11, borderRadius: 6 }}
              formatter={(v, name) => [show(v), SSP_LABELS[name] ?? name]}
            />
            {SSPS.map(s => <Bar key={s} dataKey={s} name={s} fill={SSP_COLORS[s]} radius={[2,2,0,0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SSP legend */}
      <div className={styles.sspLegend}>
        <div className={styles.sspLegendItems}>
          {SSPS.map(s => (
            <div key={s} className={styles.sspLegendItem}>
              <div className={styles.sspLegendDot} style={{ background: SSP_COLORS[s] }} />
              <span>{SSP_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SSP × Period table */}
      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>{anomaly ? 'Change from baseline' : 'Mean values'} by scenario &amp; period</div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Period</th>
            {SSPS.map(s => <th key={s} style={{ textAlign: 'right' }}>{SSP_LABELS[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Historical</td>
            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {histMean != null ? fmt(histMean) : '—'}
            </td>
          </tr>
          {HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => (
            <tr key={p.id}>
              <td>{p.label}</td>
              {SSPS.map(s => (
                <td key={s} style={{ textAlign: 'right' }}>
                  {show(value(s, p.id))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </>}
    </>
  )
}

function AggChip({ id, entry }) {
  if (!entry) return <span>—</span>
  const cat = statsCategory(id, entry), c = aggClass(id, cat)
  const short = { 'More unfavourable': 'More unfav.', 'Moderately unfavourable': 'Mod. unfav.', 'No hazard': 'No hazard', 'Moderately favourable': 'Mod. fav.', 'More favourable': 'More fav.' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: c?.color, border: '1px solid var(--border)' }} />
      {id === AGG_ABS ? `${entry.absolute.share.toFixed(0)}%` : short[cat] ?? cat}
    </span>
  )
}

function AggView({ id, mm }) {
  const { hazardPeriod } = useCRVAStore()
  const period = hazardPeriod === 'historical' ? '2050' : hazardPeriod
  if (!mm) return <div className={styles.cropNote}>No model results for this area.</div>
  const n = mm.n_models
  const cur = mm.aggregate?.[period]
  const cat = statsCategory(id, cur)
  const detail = !cur ? '' : id === AGG_RR
    ? `index ${cur.atlas.index > 0 ? '+' : ''}${cur.atlas.index.toFixed(3)} · ${cur.atlas.n_unfav} of ${n} models unfavourable`
    : id === AGG_ABS
      ? `${cur.absolute.share.toFixed(1)}% of weight past threshold · ${cur.absolute.n_moderate} of ${n} models Moderate or worse`
      : `rank score ${cur.relative.score.toFixed(0)} / 100 (models ${cur.relative.min.toFixed(0)}–${cur.relative.max.toFixed(0)})`
  return (
    <>
      <div className={styles.sectionTitle} style={{ marginTop: 8 }}>SSP2-4.5 · {HAZARD_PERIODS.find(p => p.id === period)?.label} · median of {n} models</div>
      {cur && (
        <div className={styles.riskSummary} style={{ borderColor: aggClass(id, cat)?.color, marginTop: 0 }}>
          <span className={styles.riskDot} style={{ background: aggClass(id, cat)?.color }} />
          <span style={{ fontWeight: 700 }}>{cat}</span>
          <span className={styles.riskScore}>{detail}</span>
        </div>
      )}
      <div className={styles.cropNote} style={{ marginTop: 6 }}>
        {id === AGG_RR
          ? 'Rama Rao et al. (2020) method: change in 15 indicators, normalised with the sign kept, Atlas weights, classes by SD around zero. Relative to other districts in the same period.'
          : id === AGG_ABS
            ? 'Compares this district with its own 1985–2014 mean, using a worsening threshold for each indicator, so periods can be compared.'
            : 'Ranks this district against all others in the same period. It shows priority, not whether climate gets worse.'}
      </div>
      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>By period</div>
      <table className={styles.table}>
        <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>{AGG_TITLES[id]}</th></tr></thead>
        <tbody>
          {HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => (
            <tr key={p.id}><td>{p.label}</td><td style={{ textAlign: 'right' }}><AggChip id={id} entry={mm.aggregate?.[p.id]} /></td></tr>
          ))}
        </tbody>
      </table>
      {cur && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 12 }}>The 15 indicators · {HAZARD_PERIODS.find(p => p.id === period)?.label}</div>
          <table className={styles.table}>
            <thead><tr>
              <th>Indicator</th><th style={{ textAlign: 'right' }}>Change</th>
              <th style={{ textAlign: 'right' }}>Adverse</th>
              {id === AGG_ABS && <th style={{ textAlign: 'right' }}>Past {''}threshold</th>}
            </tr></thead>
            <tbody>
              {Object.entries(AGG_LABELS).map(([cid, label]) => {
                const e = mm.indicators?.[cid]?.[period]
                if (!e) return null
                const pct = ['annual_rain', 'june_rain', 'july_rain', 'rainy_days'].includes(cid)
                return (
                  <tr key={cid}>
                    <td style={{ fontSize: 10.5 }}>{label}</td>
                    <td style={{ textAlign: 'right' }}>{e.med > 0 ? '+' : ''}{fmt(e.med)}{pct ? '%' : ''}</td>
                    <td style={{ textAlign: 'right' }}>{e.n_adverse}/{n}</td>
                    {id === AGG_ABS && <td style={{ textAlign: 'right' }}>{e.n_worse}/{n} <span style={{ color: 'var(--text-muted)' }}>({THRESHOLD_TEXT[cid]})</span></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className={styles.summaryNote}>Change: median of {n} models vs 1985–2014. Adverse: models whose change is harmful.{id === AGG_ABS ? ' Past threshold: models whose change passes the worsening threshold.' : ''}</div>
        </>
      )}
    </>
  )
}

function MMView({ id, mm }) {
  const { hazardPeriod } = useCRVAStore()
  const comp = mmComp(id)
  const e = mm?.indicators?.[comp]
  if (!e) return <div className={styles.cropNote}>No model results for this area.</div>
  const n = mm.n_models
  const pct = ['annual_rain', 'june_rain', 'july_rain', 'rainy_days'].includes(comp)
  const meta = getIndicatorMeta(id)
  const sign = v => `${v > 0 ? '+' : ''}${fmt(v)}${pct ? '%' : ''}`
  return (
    <>
      <div className={styles.sectionTitle} style={{ marginTop: 8 }}>Historical baseline (1985–2014) · median of {n} models</div>
      <div className={styles.baselineRow}><span>Mean</span><span className={styles.baselineVal}>{e.base != null ? `${fmt(e.base)} ${meta?.unit ?? ''}` : '—'}</span></div>
      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Change by period · SSP2-4.5</div>
      <table className={styles.table}>
        <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>Median</th><th style={{ textAlign: 'right' }}>Range of models</th><th style={{ textAlign: 'right' }}>Adverse</th></tr></thead>
        <tbody>
          {HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => {
            const x = e[p.id]
            return (
              <tr key={p.id} style={{ fontWeight: p.id === hazardPeriod ? 700 : 400 }}>
                <td>{p.label}</td>
                <td style={{ textAlign: 'right' }}>{x ? sign(x.med) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{x ? `${sign(x.min)} to ${sign(x.max)}` : '—'}</td>
                <td style={{ textAlign: 'right' }}>{x ? `${x.n_adverse}/${n}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className={styles.summaryNote}>Computed separately in {n} INDRA-CMIP6 models with the Atlas definition. Adverse: models whose change is harmful for agriculture. Use the model selector on the left to map a single model.</div>
    </>
  )
}

const COMPONENT_LABELS = {
  annual_rain: 'Annual rainfall', june_rain: 'June rainfall', july_rain: 'July rainfall',
  rainy_days: 'Rainy days', tmax: 'Max temperature', tmin: 'Min temperature',
  hot_days: 'Unusually hot days', cold_days: 'Unusually cold days', frost: 'Frost days',
  drought: 'Drought (SPI-3 proxy)', dry_spells: 'Dry-spell score', p99_rain: '99th pct daily rain',
  events_100mm: '>100 mm in 3 days', rx1_pct: 'Max 1-day % of normal', rx3_pct: 'Max 3-day % of normal',
}

function ClassChip({ entry }) {
  if (!entry) return <span>—</span>
  const value = entry.value
  const c = fhiClassOf(entry.category)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color, border: '1px solid var(--border)' }} />
      {value > 0 ? '+' : ''}{value.toFixed(3)}
    </span>
  )
}

function IndexView({ fhi }) {
  const { hazardSsp, hazardPeriod } = useCRVAStore()
  const period = hazardPeriod === 'historical' ? '2050' : hazardPeriod
  const cur = fhi?.[hazardSsp]?.[period]
  if (!fhi) return <div className={styles.cropNote}>No index for this area.</div>
  return (
    <>
      <div className={styles.sectionTitle} style={{ marginTop: 8 }}>
        {SSP_LABELS[hazardSsp]} · {HAZARD_PERIODS.find(p => p.id === period)?.label}
      </div>
      {cur && (
        <div className={styles.riskSummary} style={{ borderColor: fhiClassOf(cur.category).color, marginTop: 0 }}>
          <span className={styles.riskDot} style={{ background: fhiClassOf(cur.category).color }} />
          <span style={{ fontWeight: 700 }}>{cur.category}</span>
          <span className={styles.riskScore}>index {cur.value > 0 ? '+' : ''}{cur.value.toFixed(3)}</span>
        </div>
      )}

      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Index by scenario &amp; period</div>
      <table className={styles.table}>
        <thead><tr><th>Period</th>{SSPS.map(s => <th key={s} style={{ textAlign: 'right' }}>{SSP_LABELS[s]}</th>)}</tr></thead>
        <tbody>
          {HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => (
            <tr key={p.id}>
              <td>{p.label}</td>
              {SSPS.map(s => <td key={s} style={{ textAlign: 'right' }}><ClassChip entry={fhi?.[s]?.[p.id]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>

      {cur && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 12 }}>What drives it</div>
          <div className={styles.cropNote}>Change from 1985–2014 and weighted contribution to the index (+ = less favourable).</div>
          <table className={styles.table}>
            <thead><tr><th>Indicator</th><th style={{ textAlign: 'right' }}>Wt</th><th style={{ textAlign: 'right' }}>Change</th><th style={{ textAlign: 'right' }}>Contrib.</th></tr></thead>
            <tbody>
              {FHI_COMPONENTS.map(c => {
                const ch = cur.changes[c.id], ct = cur.components[c.id]
                return (
                  <tr key={c.id}>
                    <td style={{ fontSize: 10.5 }}>{COMPONENT_LABELS[c.id]}</td>
                    <td style={{ textAlign: 'right' }}>{c.weight}</td>
                    <td style={{ textAlign: 'right' }}>{ch == null ? '—' : `${ch > 0 ? '+' : ''}${fmt(ch)}${c.change === 'pct' ? '%' : ''}`}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: ct > 0.005 ? '#b2182b' : ct < -0.005 ? '#2166ac' : 'var(--text-muted)' }}>
                      {ct == null ? '—' : `${ct > 0 ? '+' : ''}${ct.toFixed(3)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className={styles.summaryNote}>
            Method: Rama Rao et al. (2020) Atlas, Table 5c weights and sign-preserving normalisation. Hot/cold-day thresholds scaled to ±2 SD and drought proxied by SPI-3, because the ensemble-mean data smooths out day-to-day extremes.
          </div>
        </>
      )}
    </>
  )
}

const ALL_CROPS = ['Rice_Irrigated','Wheat','Maize','Chickpea','Pigeonpea','Soybean','Groundnut','Mustard','Cotton','Potato','Sorghum','Pearl_Millet']
const CROP_PERIODS_LIST = ['2020','2050','2080']

function CropTab({ stats }) {
  const yields = stats?.crop_impact?.yields ?? {}
  const crops = ALL_CROPS.filter(c => yields[c])
  return (
    <>
      <div className={styles.sectionTitle}>Crop Yield Change — RCP 4.5 (Soora et al.)</div>
      <div className={styles.cropNote}>% change relative to baseline. Green = benefit · Red = loss</div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Crop</th>
            <th style={{ textAlign: 'right' }}>~2020</th>
            <th style={{ textAlign: 'right' }}>~2050</th>
            <th style={{ textAlign: 'right' }}>~2080</th>
          </tr>
        </thead>
        <tbody>
          {crops.map(c => (
            <tr key={c}>
              <td>{c.replace(/_/g, ' ')}</td>
              {CROP_PERIODS_LIST.map(p => {
                const v = yields[c]?.[p]
                return (
                  <td key={p} style={{ textAlign: 'right', color: v > 0 ? '#1A9850' : v < 0 ? '#D73027' : 'var(--text-muted)', fontWeight: Math.abs(v ?? 0) > 20 ? 700 : 400 }}>
                    {v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {crops.length === 0 && (
          <tbody><tr><td colSpan={4}><div className={styles.cropNote} style={{ padding: '12px 0' }}>No crop data available for this area.</div></td></tr></tbody>
        )}
      </table>
    </>
  )
}

const INDICATOR_LABELS = {
  net_sown_area_pct: 'Net Sown Area',
  rural_pop_density: 'Rural Pop. Density',
  small_marginal_farmers_pct: 'Small & Marginal Farmers',
  scst_population_pct: 'SC/ST Population',
  women_landholdings_pct: 'Women Landholdings',
  crossbred_cattle_pct: 'Crossbred Cattle',
  annual_rainfall_mm: 'Annual Rainfall',
  groundwater_depletion_pct: 'Groundwater Depletion',
  rainfed_area_pct: 'Rainfed Area',
  rural_road_density: 'Rural Road Density',
  crop_insurance_pct: 'Crop Insurance Coverage',
  crop_diversity_kharif: 'Kharif Crop Diversity',
}

function IndicatorTab({ data, label, color, note }) {
  if (!data?.indicators) return (
    <div className={styles.empty} style={{ height: 120 }}>
      <div>No {label} data available</div>
      <div className={styles.emptyNote}>Placeholder · Connect district-level datasets</div>
    </div>
  )
  const maxVal = Math.max(...Object.values(data.indicators).map(v => Math.abs(v ?? 0)), 1)
  return (
    <>
      <div className={styles.sectionTitle}>{label} Indicators</div>
      {note && <div className={styles.cropNote}>{note}</div>}
      {data.composite_score != null && (
        <>
          <div className={styles.scoreBar}>
            <div className={styles.scoreBarFill} style={{ width: `${data.composite_score}%`, background: color }} />
          </div>
          <div className={styles.scoreBarLabel}>Composite score: {data.composite_score.toFixed(1)} / 100</div>
        </>
      )}
      <div style={{ marginTop: 10 }}>
        {Object.entries(data.indicators).map(([id, val]) => (
          <div key={id} className={styles.indicRow}>
            <span className={styles.indicName}>{INDICATOR_LABELS[id] ?? id.replace(/_/g, ' ')}</span>
            <div className={styles.indicBar}>
              <div className={styles.indicBarFill} style={{ width: `${Math.min(100, (Math.abs(val ?? 0) / maxVal) * 100)}%`, background: color }} />
            </div>
            <span className={styles.indicVal}>{typeof val === 'number' ? (val < 10 ? val.toFixed(2) : val.toFixed(1)) : '—'}</span>
          </div>
        ))}
      </div>
    </>
  )
}
