import React from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts'
import { useCRVAStore, RISK_CLASSES, SSPS, SSP_LABELS, HAZARD_PERIODS } from '../store/useCRVAStore.js'
import hazardIndicators from '../data/climate_hazard_indicators.json'
import { fmt } from '../lib/hazardScale.js'
import { loadStats } from '../lib/stats.js'
import { FHI_ID, FHI_ENABLED, FHI_COMPONENTS, fhiClassOf } from '../lib/hazardIndex.js'
import { AGG_RR, AGG_ABS, AGG_REL, AGG_TITLES, isAggregate, statsCategory, aggClass, COMPONENT_LABELS as AGG_LABELS, THRESHOLD_TEXT } from '../lib/aggregate.js'
import { isMM, mmComp } from '../lib/multimodel.js'
import { isCX, cxKey, SEASONS } from '../lib/compound.js'
import exposureIndicators from '../data/exposure_indicators.json'
import DriverBars, { driverSentence, hazardLabel, exposureLabel, RISK_PARTS, riskLabel } from './DriverBars.jsx'
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
  { id: 'hazard',       label: 'Future Hazard' },
  { id: 'historical',   label: 'Historical Hazard' },
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

        {activeTab === 'overview' && <OverviewTab stats={stats} />}
        {activeTab === 'hazard' && <HazardTab stats={stats} />}
        {activeTab === 'crop' && <CropTab stats={stats} />}
        {activeTab === 'historical' && <PendingTab title="Historical hazard" text="Drought (55%), flood (25%) and cyclone (20%) proneness, following Rama Rao et al. (2020), Table 5b. The district values are being compiled; this tab will then show the index and what drives it." />}
        {activeTab === 'exposure' && <ExposureTab data={stats?.exposure} drivers={stats?.drivers} />}
        {activeTab === 'vulnerability' && <IndicatorTab data={stats?.vulnerability} label="Vulnerability" color={DIM_COLORS.vulnerability} note="Sensitivity factors and adaptive capacity" />}
      </div>

      <div className={styles.source}>TCP/IND/4005 · IPCC WG2 AR6 · CRIDA · INDRA-CMIP6</div>
    </aside>
  )
}

const periodOf = p => (p === 'historical' ? '2050' : p)
const periodLabel = p => HAZARD_PERIODS.find(x => x.id === p)?.label ?? p
const modal = counts => counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null
const EX_CLASS_COLOR_OV = { 'Very low': '#2c7bb6', 'Low': '#abd9e9', 'Medium': '#e9e4d4', 'High': '#fdae61', 'Very high': '#d7191c' }

// State view: how many of the state's districts have each top driver.
function TopCounts({ counts, labelOf, noun = 'districts' }) {
  if (!counts) return null
  const rows = Object.entries(counts).filter(([k]) => k && k !== 'null').sort((a, b) => b[1] - a[1])
  const total = rows.reduce((s, [, n]) => s + n, 0)
  return (
    <>
      {rows.map(([k, n]) => (
        <div key={k} className={styles.indicRow}>
          <span className={styles.indicName}>{labelOf(k)}</span>
          <div className={styles.indicBar}><div className={styles.indicBarFill} style={{ width: `${(n / Math.max(total, 1)) * 100}%`, background: '#c8553d' }} /></div>
          <span className={styles.indicVal}>{n}</span>
        </div>
      ))}
      <div className={styles.summaryNote}>Top driver in each of the state's {total} {noun}. Select a district for its own breakdown.</div>
    </>
  )
}

function OverviewTab({ stats }) {
  const { hazardPeriod, setDrawerTab } = useCRVAStore()
  const period = periodOf(hazardPeriod)
  const dr = stats?.drivers
  const isState = dr?.states_view === 'top_counts'
  const risk = dr?.risk?.[period]
  const items = RISK_PARTS.map(pt => ({ id: pt.id, label: `${pt.label} (${pt.weight}%)`, value: risk ? risk[pt.id] : null }))
  const avail = items.filter(x => typeof x.value === 'number')
  const total = avail.reduce((s, x) => s + x.value, 0)
  const sentence = driverSentence('Risk', items.map(x => ({ ...x, label: x.label.replace(/ \(\d+%\)/, '') })), total, 'above average', 'below average')
  const mm = stats?.climate_hazard?.multimodel?.aggregate?.[period]
  const rrCat = mm ? statsCategory(AGG_RR, mm) : null
  const rrC = rrCat ? aggClass(AGG_RR, rrCat) : null
  const ex = stats?.exposure

  return (
    <>
      <div className={styles.sectionTitle}>What drives risk here · {periodLabel(period)}</div>
      {isState ? (
        <TopCounts counts={dr?.risk?.[period]} labelOf={riskLabel} />
      ) : risk ? (
        <>
          {sentence && <div className={styles.driverSentence}>{sentence}</div>}
          <DriverBars items={items} upLabel="raises risk" downLabel="lowers risk" />
          <div className={styles.summaryNote}>As in the Atlas: each part's index times its weight (Table 6). Exposure is relative to other districts; future hazard is relative to today (0 = no change). Historical hazard and vulnerability are being added.</div>
        </>
      ) : (
        <div className={styles.emptyNote}>No risk breakdown for this area.</div>
      )}

      <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Parts of risk</div>
      <div className={styles.partGrid}>
        {[
          { tab: 'hazard', label: 'Future hazard', value: rrCat, color: rrC?.color, note: mm?.atlas ? `${mm.atlas.n_unfav} of ${stats.climate_hazard.multimodel.n_models} models unfavourable` : 'Rama Rao index, SSP2-4.5' },
          { tab: 'exposure', label: 'Exposure', value: ex?.class ?? modal(ex?.class_counts), color: EX_CLASS_COLOR_OV[ex?.class ?? modal(ex?.class_counts)], note: ex?.class_counts ? 'Most common class among districts' : 'Rama Rao index, 5 indicators' },
          { tab: 'historical', label: 'Historical hazard', value: null, note: 'Drought, flood, cyclone · coming next' },
          { tab: 'vulnerability', label: 'Vulnerability', value: null, note: 'Sensitivity and adaptive capacity · coming next' },
        ].map(c => (
          <button key={c.label} className={styles.partCard} disabled={!c.tab} onClick={() => c.tab && setDrawerTab(c.tab)}>
            <span className={styles.partLabel}>{c.label}</span>
            <span className={styles.partValue}>
              {c.color && <span className={styles.riskDot} style={{ background: c.color }} />}
              {c.value ?? 'Coming next'}
            </span>
            <span className={styles.partNote}>{c.note}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function PendingTab({ title, text }) {
  return (
    <div className={styles.empty} style={{ height: 160 }}>
      <div className={styles.emptyIcon}>◎</div>
      <div>{title} · coming next</div>
      <div className={styles.emptyNote} style={{ maxWidth: 280, textAlign: 'center' }}>{text}</div>
    </div>
  )
}

// What drives the future hazard (Rama Rao index) in this district: each indicator's weighted contribution.
function FutureDrivers({ stats }) {
  const { hazardPeriod } = useCRVAStore()
  const period = periodOf(hazardPeriod)
  const dr = stats?.drivers
  if (!dr) return null
  if (dr.states_view === 'top_counts') {
    return (
      <div style={{ marginBottom: 14 }}>
        <div className={styles.sectionTitle}>What drives future hazard · {periodLabel(period)}</div>
        <TopCounts counts={dr.future_hazard?.[period]} labelOf={hazardLabel} />
      </div>
    )
  }
  const f = dr.future_hazard?.[period]
  if (!f) return null
  const items = Object.entries(f.c).map(([id, value]) => ({ id, label: hazardLabel(id), value }))
  const sentence = driverSentence('Future hazard', items, f.index, 'unfavourable', 'favourable')
  return (
    <div style={{ marginBottom: 14 }}>
      <div className={styles.sectionTitle}>What drives future hazard · {periodLabel(period)}</div>
      {sentence && <div className={styles.driverSentence}>{sentence}</div>}
      <DriverBars items={items} limit={6} upLabel="worsens" downLabel="eases" />
      <div className={styles.summaryNote}>
        Weighted, normalised change of each Rama Rao indicator (0 = no change from 1985–2014); median of {f.n} models.
        {f.top && ` ${f.agree} of ${f.n} models have ${hazardLabel(f.top).toLowerCase()} as the main driver.`}
      </div>
    </div>
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
          || ((isAggregate(id) || isMM(id)) && stats?.climate_hazard?.multimodel)
          || (isCX(id) && stats?.climate_hazard?.multimodel?.compound))
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
      <FutureDrivers stats={stats} />
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
        : isCX(activeId) ? <CXView id={activeId} mm={stats?.climate_hazard?.multimodel} />
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

function CXView({ id, mm }) {
  const { hazardPeriod, cxSeason } = useCRVAStore()
  const period = hazardPeriod === 'historical' ? '2050' : hazardPeriod
  const cx = mm?.compound
  if (!cx) return <div className={styles.cropNote}>No model results for this area.</div>
  const n = mm.n_models
  const e = cx[cxKey(id, cxSeason)]
  const sign = v => `${v > 0 ? '+' : ''}${fmt(v)}`
  const seasonLabel = SEASONS.find(x => x.id === cxSeason)
  return (
    <>
      <div className={styles.sectionTitle} style={{ marginTop: 8 }}>{seasonLabel?.label} ({seasonLabel?.months}) · median of {n} models</div>
      <div className={styles.baselineRow}><span>1985–2014</span><span className={styles.baselineVal}>{e?.base != null ? `${fmt(e.base)} days/yr` : '—'}</span></div>
      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Change by period · SSP2-4.5</div>
      <table className={styles.table}>
        <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>Median</th><th style={{ textAlign: 'right' }}>Range of models</th><th style={{ textAlign: 'right' }}>Increase</th></tr></thead>
        <tbody>
          {HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => {
            const x = e?.[p.id]
            return (
              <tr key={p.id} style={{ fontWeight: p.id === hazardPeriod ? 700 : 400 }}>
                <td>{p.label}</td>
                <td style={{ textAlign: 'right' }}>{x ? sign(x.med) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{x ? `${sign(x.min)} to ${sign(x.max)}` : '—'}</td>
                <td style={{ textAlign: 'right' }}>{x ? `${x.n_up}/${n}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>All seasons · {HAZARD_PERIODS.find(p => p.id === period)?.label}</div>
      <table className={styles.table}>
        <thead><tr><th>Season</th><th style={{ textAlign: 'right' }}>1985–2014</th><th style={{ textAlign: 'right' }}>Change</th><th style={{ textAlign: 'right' }}>Increase</th></tr></thead>
        <tbody>
          {SEASONS.map(x => {
            const y = cx[cxKey(id, x.id)]
            return (
              <tr key={x.id} style={{ fontWeight: x.id === cxSeason ? 700 : 400 }}>
                <td>{x.label}</td>
                <td style={{ textAlign: 'right' }}>{y?.base != null ? fmt(y.base) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{y?.[period] ? sign(y[period].med) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{y?.[period] ? `${y[period].n_up}/${n}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className={styles.summaryNote}>Days per year, from {n} individual INDRA-CMIP6 models with thresholds from each model's 1985–2014 climate. Compound extremes are shown for information and are not part of the aggregate index.</div>
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

const CROP_HORIZONS = [{ id: 'mid', label: 'Mid-century', range: '2031–2065' }, { id: 'end', label: 'End-century', range: '2071–2100' }]
const pct = v => (typeof v === 'number' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%` : '—')

// Crop yield change: Soora et al. (TNC/InfoCrop) first, the pooled estimate and its range beside it.
function CropTab({ stats }) {
  const [h, setH] = React.useState('mid')
  const cs = stats?.crop_sensitivity
  if (!cs) return (
    <div className={styles.empty} style={{ height: 120 }}>
      <div>No crop sensitivity data</div>
      <div className={styles.emptyNote}>None of the synthesised crops is grown here, or the area is outside the analysis</div>
    </div>
  )
  const state = cs.level === 'state'
  const rows = Object.entries(cs.crops).map(([crop, v]) => ({ crop, ...(v[h] ?? {}) })).filter(r => r.n)
  rows.sort((a, b) => state ? (b.major - a.major) || a.crop.localeCompare(b.crop) : (b.prod_kt ?? 0) - (a.prod_kt ?? 0))
  const vals = rows.flatMap(r => [r.soora, r.pooled, r.lo, r.hi]).filter(v => typeof v === 'number')
  const span = Math.max(20, ...vals.map(Math.abs))
  const x = v => `${50 + (Math.max(-span, Math.min(span, v)) / span) * 50}%`
  return (
    <>
      <div className={styles.sectionTitle}>Crop yield change · climate change vs baseline</div>
      <div className={styles.cropToggle} role="group" aria-label="Horizon">
        {CROP_HORIZONS.map(o => (
          <button key={o.id} className={`${styles.cropToggleBtn} ${h === o.id ? styles.cropToggleOn : ''}`} aria-pressed={h === o.id} onClick={() => setH(o.id)}>
            {o.label}<span>{o.range}</span>
          </button>
        ))}
      </div>
      <div className={styles.cropKey} aria-hidden="true">
        <span><i className={styles.keySoora} /> Soora et al. (TNC/InfoCrop)</span>
        <span><i className={styles.keyPooled} /> Pooled{state ? ' (all studies)' : ' (3 sources)'}</span>
        <span><i className={styles.keyRange} /> {state ? 'middle half of studies' : 'range of sources'}</span>
      </div>
      <div className={styles.cropRows}>
        <div className={styles.cropAxis} aria-hidden="true"><span>{pct(-span)}</span><span>0</span><span>{pct(span)}</span></div>
        {rows.map(r => (
          <div key={r.crop} className={styles.cropRow}>
            <div className={styles.cropName}>
              {r.crop}
              <span className={styles.cropMeta}>
                {state ? (r.major ? 'major producer · ' : '') + `${r.n} stud${r.n === 1 ? 'y' : 'ies'}` : `${r.prod_kt >= 10 ? Math.round(r.prod_kt).toLocaleString() : r.prod_kt} kt · ${r.n} source${r.n === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className={styles.cropPlot} aria-label={`Soora ${pct(r.soora)}, pooled ${pct(r.pooled)}, range ${pct(r.lo)} to ${pct(r.hi)}`}>
              <span className={styles.cropZero} />
              {typeof r.lo === 'number' && <span className={styles.cropRange} style={{ left: x(Math.min(r.lo, r.hi)), right: `calc(100% - ${x(Math.max(r.lo, r.hi))})` }} />}
              {typeof r.pooled === 'number' && <span className={styles.cropPooled} style={{ left: x(r.pooled) }} />}
              {typeof r.soora === 'number' && <span className={styles.cropSoora} style={{ left: x(r.soora) }} />}
            </div>
            <div className={styles.cropVals}>
              <strong>{pct(r.soora)}</strong>
              <span>{pct(r.pooled)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.summaryNote} style={{ marginTop: 10 }}>
        {state
          ? 'Pooled: median of all study points for the state (published studies and large-scale datasets), headline configuration of the impacts synthesis; the line is the middle half of studies.'
          : 'Pooled: median of Soora (TNC/InfoCrop), GGCMI and Hultgren for this district, each averaged over its variants; the line is their range. Only crops grown in the district are shown, by production.'}
        {' '}Soora et al. include CO2 fertilisation. % change in yield.
      </div>
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

const EX_CLASS_COLOR = { 'Very low': '#2c7bb6', 'Low': '#abd9e9', 'Medium': '#e9e4d4', 'High': '#fdae61', 'Very high': '#d7191c' }

function ExposureTab({ data, drivers }) {
  if (!data) return (
    <div className={styles.empty} style={{ height: 120 }}>
      <div>No exposure data</div>
      <div className={styles.emptyNote}>Urban districts and the islands are outside the Rama Rao exposure index</div>
    </div>
  )
  if (data.class_counts) {
    const total = Object.values(data.class_counts).reduce((a, b) => a + b, 0)
    return (
      <>
        <div className={styles.sectionTitle}>What drives exposure</div>
        <TopCounts counts={drivers?.exposure} labelOf={exposureLabel} />
        <div style={{ height: 12 }} />
        <div className={styles.sectionTitle}>Exposure index · districts by class</div>
        <div className={styles.cropNote}>Rama Rao et al. (2020) method. Zoom in and select a district for its indicators.</div>
        {Object.entries(data.class_counts).reverse().map(([c, n]) => (
          <div key={c} className={styles.indicRow}>
            <span className={styles.indicName}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 6, background: EX_CLASS_COLOR[c] }} />{c}</span>
            <div className={styles.indicBar}><div className={styles.indicBarFill} style={{ width: `${(n / Math.max(total, 1)) * 100}%`, background: EX_CLASS_COLOR[c] }} /></div>
            <span className={styles.indicVal}>{n}</span>
          </div>
        ))}
      </>
    )
  }
  const inds = exposureIndicators.flatMap(g => g.indicators).filter(i => i.bands)
  const gaps = data.gaps ? data.gaps.split(',') : []
  const exd = drivers?.exposure
  const dItems = exd ? Object.entries(exd.c).map(([id, value]) => ({ id, label: exposureLabel(id), value })) : []
  const dSentence = exd ? driverSentence('Exposure', dItems, exd.index, 'above average', 'below average') : null
  return (
    <>
      <div className={styles.sectionTitle}>Exposure index</div>
      <div className={styles.cropNote}>Rama Rao et al. (2020) method: five indicators, Atlas weights, classes relative to the national mean</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, background: EX_CLASS_COLOR[data.class] ?? '#ccc' }} />
        <strong>{data.class ?? '—'}</strong>
        <span className={styles.emptyNote}>index {typeof data.index === 'number' ? data.index.toFixed(2) : '—'} (0 = national mean)</span>
      </div>
      {exd && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 4 }}>What drives exposure</div>
          {dSentence && <div className={styles.driverSentence}>{dSentence}</div>}
          <DriverBars items={dItems} upLabel="raises" downLabel="lowers" />
          <div className={styles.summaryNote}>Each indicator compared with the national average (z-score) times its Atlas weight; the bars add up to the index.</div>
          <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Indicator values</div>
        </>
      )}
      {inds.map(ind => {
        const v = data.indicators?.[ind.id]
        const isGap = gaps.includes(ind.id)
        const top = ind.bands[ind.bands.length - 1] * 1.25
        return (
          <div key={ind.id} className={styles.indicRow}>
            <span className={styles.indicName}>{ind.label} <span className={styles.emptyNote}>({ind.weight}%)</span></span>
            <div className={styles.indicBar}>
              <div className={styles.indicBarFill} style={{ width: `${Math.min(100, ((v ?? 0) / top) * 100)}%`, background: DIM_COLORS.exposure }} />
            </div>
            <span className={styles.indicVal}>{isGap ? 'no data' : typeof v === 'number' ? (v >= 100 ? v.toFixed(0) : v.toFixed(1)) : '—'}</span>
          </div>
        )
      })}
      {gaps.length > 0 && <div className={styles.cropNote} style={{ marginTop: 8 }}>No source data for {gaps.length === 5 ? 'this district' : 'some indicators'}; counted as 0 in the index, so its class is not a measured result.</div>}
      {data.source_district && <div className={styles.cropNote} style={{ marginTop: 8 }}>Values from 2011 district {data.source_district}.</div>}
    </>
  )
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
