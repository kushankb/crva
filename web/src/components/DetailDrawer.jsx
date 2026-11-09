import React from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts'
import { useCRVAStore, RISK_CLASSES, SSPS, SSP_LABELS, HAZARD_PERIODS } from '../store/useCRVAStore.js'
import hazardIndicators from '../data/climate_hazard_indicators.json'
import { fmt } from '../lib/hazardScale.js'
import { loadStats } from '../lib/stats.js'
import { FHI_ID, FHI_ENABLED, FHI_COMPONENTS, fhiClassOf } from '../lib/hazardIndex.js'
import { AGG_RR, AGG_ABS, AGG_REL, AGG_TITLES, isAggregate, statsCategory, aggClass, COMPONENT_LABELS as AGG_LABELS, THRESHOLD_TEXT } from '../lib/aggregate.js'
import { isMM, mmComp } from '../lib/multimodel.js'
import { isCX, cxKey, SEASONS } from '../lib/compound.js'
import exposureIndicators from '../data/exposure_indicators.json'
import historicalIndicators from '../data/historical_hazard_indicators.json'
import vulnerabilityIndicators from '../data/vulnerability_indicators.json'
import DriverBars, { driverSentence, hazardLabel, exposureLabel, historicalLabel, vulnerabilityLabel, RISK_PARTS, riskLabel } from './DriverBars.jsx'
import { riskWindow, loadRisk, RISK_PARTS_W } from '../lib/risk.js'
import { loadLayer } from '../lib/exposure.js'
import { SHOWN_HAZARD_GROUPS } from './panels/ClimateHazardPanel.jsx'
import { stateRows, DistrictStrip, DistrictList, PartSpread } from './StateDistricts.jsx'
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

// Tabs follow the risk formula: the four parts in order of weight (Atlas Table 6)
const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'vulnerability',label: 'Vulnerability' },
  { id: 'exposure',     label: 'Exposure' },
  { id: 'historical',   label: 'Historical hazard' },
  { id: 'hazard',       label: 'Future hazard' },
]
const PART_TAB = { vulnerability: 'vulnerability', exposure: 'exposure', historical_hazard: 'historical', future_hazard: 'hazard' }
const normName = s => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '').replace(/and/g, '')

export default function DetailDrawer() {
  const { selectedFeature, setSelectedFeature, hazardPeriod, drawerTab: activeTab, setDrawerTab: setActiveTab } = useCRVAStore()
  const [stats, setStats] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [parent, setParent] = React.useState(null)     // the district's state, for the breadcrumb
  const [risk, setRisk] = React.useState(null)

  React.useEffect(() => { loadRisk().then(setRisk) }, [])
  React.useEffect(() => {
    if (!selectedFeature) { setStats(null); return }
    setLoading(true)
    loadStats().then(data => {
      setStats(data[`${selectedFeature.type}:${selectedFeature.id}`] ?? null)
      const k = selectedFeature.type === 'district' ? normName(selectedFeature.state_name) : null
      const hit = k ? Object.entries(data).find(([key, v]) => key.startsWith('state:') && normName(v.name) === k) : null
      setParent(hit ? { id: hit[0].slice(6), name: hit[1].name } : null)
      setLoading(false)
    })
  }, [selectedFeature])

  if (!selectedFeature) return null
  const w = riskWindow(hazardPeriod)

  return (
    <aside className={styles.drawer} aria-label={`${selectedFeature.name}: climate risk details`}>
      <header className={styles.header}>
        <div className={styles.headMain}>
          <div className={styles.crumbs}>
            <span className={styles.featureType}>{selectedFeature.type}</span>
            {parent && (
              <>
                <span className={styles.crumbSep} aria-hidden="true">·</span>
                <button className={styles.crumbLink} title={`Show ${parent.name}: its districts, their classes and what raises or lowers their risk`}
                  onClick={() => setSelectedFeature({ type: 'state', id: parent.id, name: parent.name })}>{parent.name} ›</button>
              </>
            )}
          </div>
          <h2 className={styles.featureName}>{selectedFeature.name}</h2>
        </div>
        <button className={styles.close} onClick={() => setSelectedFeature(null)} aria-label="Close the panel">✕</button>
      </header>

      <RiskHero stats={stats} risk={risk} w={w} feature={selectedFeature} loading={loading} />

      <nav className={styles.tabs} role="tablist" aria-label="Parts of risk">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={activeTab === t.id} className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.body}>
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : !stats ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◎</div>
            <div>No CRVA data for this {selectedFeature.type}.</div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab stats={stats} risk={risk} feature={selectedFeature} />}
            {activeTab === 'hazard' && <HazardTab stats={stats} />}
            {activeTab === 'historical' && <ExposureTab data={stats?.historical_hazard} drivers={stats?.drivers} cfg={HH_CFG} fid={selectedFeature.id} />}
            {activeTab === 'exposure' && <ExposureTab data={stats?.exposure} drivers={stats?.drivers} fid={selectedFeature.id} />}
            {activeTab === 'vulnerability' && <ExposureTab data={stats?.vulnerability} drivers={stats?.drivers} cfg={VU_CFG} fid={selectedFeature.id} />}
          </>
        )}
      </div>

      <div className={styles.source}>Rama Rao et al. (2020) ICAR-CRIDA method · INDRA-CMIP6</div>
    </aside>
  )
}

// The answer first: the risk class for the chosen period, with the district's national rank (or, for a state, how
// its districts split across classes). Stays visible on every tab.
function RiskHero({ stats, risk, w, feature, loading }) {
  const label = HAZARD_PERIODS.find(p => p.id === w)?.label
  if (loading) return <div className={styles.hero}><span className={styles.heroSub}>Loading…</span></div>
  if (feature.type === 'state') {
    const cc = stats?.risk_score?.class_counts?.[w]
    if (!cc) return null
    const total = Object.values(cc).reduce((a, b) => a + b, 0)
    const top = RISK_CLASSES.slice().sort((a, b) => (cc[b.id] ?? 0) - (cc[a.id] ?? 0))[0]
    return (
      <div className={styles.hero}>
        <div className={styles.heroRow}>
          <span className={styles.heroTitle}>Climate risk · {label}</span>
          <span className={styles.heroSub}>{total} districts</span>
        </div>
        <div className={styles.stackBar} role="img" aria-label={RISK_CLASSES.map(c => `${c.label} ${cc[c.id] ?? 0}`).join(', ')}>
          {RISK_CLASSES.slice().reverse().map(c => (cc[c.id] ? <span key={c.id} style={{ flex: cc[c.id], background: c.color }} title={`${c.label}: ${cc[c.id]}`} /> : null))}
        </div>
        <div className={styles.stackLegend}>
          {RISK_CLASSES.slice().reverse().map(c => <span key={c.id}><i style={{ background: c.color }} />{c.label} {cc[c.id] ?? 0}</span>)}
        </div>
        <div className={styles.heroSub}><strong>{(cc['High'] ?? 0) + (cc['Very high'] ?? 0)} of {total}</strong> districts are High or Very high. Most common: <strong>{top.label}</strong>. Pick a district below or on the map.</div>
      </div>
    )
  }
  const cls = stats?.risk_score?.class?.[w]
  const info = RISK_CLASSES.find(c => c.id === cls)
  let rank = null, n = 0
  const i = risk ? risk.ids.indexOf(String(feature.id)) : -1
  if (i >= 0 && typeof risk.idx[w]?.[i] === 'number') {
    const v = risk.idx[w][i]
    const all = risk.idx[w].filter(x => typeof x === 'number')
    n = all.length; rank = 1 + all.filter(x => x > v).length
  }
  if (!info) {
    return (
      <div className={styles.hero}>
        <span className={`${styles.heroPill} ${styles.heroPillNone}`}>Not assessed</span>
        <span className={styles.heroSub}>{stats?.drivers?.not_assessed ? 'Ladakh: exposure and historical hazard data incomplete.' : stats?.drivers?.na ?? 'Less than half of the risk weight has data here.'}</span>
      </div>
    )
  }
  return (
    <div className={styles.hero}>
      <span className={styles.heroPill} style={{ background: info.color, color: ['Very high', 'Very low'].includes(info.id) ? '#fff' : '#1C1814' }}>{info.label} risk</span>
      <span className={styles.heroText}>
        {rank && <span>Ranks <strong>{rank}</strong> of {n} districts</span>}
        <span className={styles.heroSub}>{label} · 1 = highest risk · relative to the national average</span>
      </span>
    </div>
  )
}

const periodOf = p => (p === 'historical' ? '2050' : p)
const periodLabel = p => HAZARD_PERIODS.find(x => x.id === p)?.label ?? p
const modal = counts => counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null
const EX_CLASS_COLOR_OV = { 'Very low': '#2c7bb6', 'Low': '#abd9e9', 'Medium': '#e9e4d4', 'High': '#fdae61', 'Very high': '#d7191c' }

// State view: what pushes the state's districts up or down. Each district counts once, under the part pushing hardest
// in its own direction (16_drivers_web.py): above the national average, the part raising it most; below, the part
// lowering it most. Counts: {up: {part: n}, down: {part: n}}.
function TopCounts({ counts, labelOf, what = 'it' }) {
  if (!counts?.up && !counts?.down) return null
  const group = (side, title, color) => {
    const rows = Object.entries(counts[side] ?? {}).filter(([k]) => k && k !== 'null').sort((a, b) => b[1] - a[1])
    const total = rows.reduce((s, [, n]) => s + n, 0)
    if (!total) return null
    return (
      <div className={styles.driverGroup}>
        <div className={styles.driverHead}><span>{title}</span><span>{total} {total === 1 ? 'district' : 'districts'}</span></div>
        {rows.map(([k, n]) => (
          <div key={k} className={styles.indicRow}>
            <span className={styles.indicName}>{labelOf(k)}</span>
            <div className={styles.indicBar}><div className={styles.indicBarFill} style={{ width: `${(n / total) * 100}%`, background: color }} /></div>
            <span className={styles.indicVal}>{n}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      {group('up', `Raises ${what} · above the national average`, '#c8553d')}
      {group('down', `Lowers ${what} · below the national average`, '#4A90C4')}
      <div className={styles.summaryNote}>Each district counts once: under the part that raises {what} most if it is above the national average, or lowers it most if below. Select a district for its own breakdown.</div>
    </>
  )
}


// Names of the parts with no data, for the re-weighting notes
const listNames = (ids, labelOf) => {
  const n = ids.map(labelOf)
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0]
}

function OverviewTab({ stats, risk: riskData, feature }) {
  const { hazardPeriod, setDrawerTab, setSelectedFeature } = useCRVAStore()
  const period = periodOf(hazardPeriod)
  const dr = stats?.drivers
  const isState = dr?.states_view === 'top_counts'
  const risk = dr?.risk?.[period]
  const mm = stats?.climate_hazard?.multimodel?.aggregate?.[period]
  const rrCat = mm ? statsCategory(AGG_RR, mm) : null
  const rrC = rrCat ? aggClass(AGG_RR, rrCat) : null
  const ex = stats?.exposure, hh = stats?.historical_hazard, vu = stats?.vulnerability
  const partClass = {
    vulnerability: { value: vu?.class ?? modal(vu?.class_counts), color: EX_CLASS_COLOR_OV[vu?.class ?? modal(vu?.class_counts)] },
    exposure: { value: ex?.class ?? modal(ex?.class_counts), color: EX_CLASS_COLOR_OV[ex?.class ?? modal(ex?.class_counts)] },
    historical_hazard: { value: hh?.class ?? modal(hh?.class_counts), color: EX_CLASS_COLOR_OV[hh?.class ?? modal(hh?.class_counts)] },
    future_hazard: { value: rrCat, color: rrC?.color, note: mm?.atlas ? `${mm.atlas.n_unfav} of ${stats.climate_hazard.multimodel.n_models} models High or Very high` : null },
  }

  const pct = stats?.risk_score?.pct?.[riskWindow(hazardPeriod)]
  if (isState) {
    const { rows, n, classShare } = stateRows(riskData, feature.id, riskWindow(hazardPeriod))
    const pick = r => setSelectedFeature({ type: 'district', id: r.id, name: r.name, state_name: feature.name, bbox: r.bbox })
    const openPart = id => setDrawerTab(PART_TAB[id])
    return (
      <>
        <div className={styles.sectionTitle}>Its districts among India's districts · {periodLabel(period)}</div>
        <DistrictStrip rows={rows} n={n} classShare={classShare} onPick={pick} />
        <div className={styles.sectionTitle} style={{ marginTop: 14 }}>Districts by risk</div>
        <DistrictList rows={rows} n={n} onPick={pick} />
        <div className={styles.sectionTitle} style={{ marginTop: 18 }}>Where its districts stand on each part</div>
        <PartSpread rows={rows} onOpen={openPart} />
        <div className={styles.sectionTitle} style={{ marginTop: 18 }}>What raises or lowers risk, by district</div>
        <TopCounts counts={dr?.risk?.[period]} labelOf={riskLabel} what="risk" />
        <details className={styles.method}>
          <summary>Why no single score for the state?</summary>
          <p>Risk is computed for districts, relative to other districts. A state score would need every indicator added up from districts with its own weights (area, population or farmland) and then compared across states. The panel shows the state's districts instead: how many fall in each class, which ones, and what drives them.</p>
        </details>
      </>
    )
  }
  if (!risk) {
    return <div className={styles.emptyNote}>{dr?.not_assessed ? 'Not assessed. Exposure and historical hazard data for Ladakh are incomplete, so Leh and Kargil are left out of the risk index. Future hazard is still shown in its tab.' : (dr?.na ? 'No risk breakdown for this district. The parts it has data for are shown in their own tabs.' : 'Not assessed: less than half of the risk weight has data here (urban districts, the islands, and districts missing from the source data).')}</div>
  }
  const items = RISK_PARTS_W.map(p => ({ id: p.id, label: p.label, value: risk[p.id] }))
  const total = items.reduce((s, x) => s + (typeof x.value === 'number' ? x.value : 0), 0)
  const sentence = driverSentence('Risk', items, total, 'above average', 'below average')
  return (
    <>
      <div className={styles.sectionTitle}>What drives risk here · {periodLabel(period)}</div>
      {sentence && <p className={styles.driverSentence}>{sentence}</p>}
      {pct && <RiskRadar pct={pct} who="This district" />}
      <PartRows parts={RISK_PARTS_W.map(p => ({ ...p, cls: partClass[p.id], value: risk[p.id], pct: pct?.[p.id] }))} onOpen={id => setDrawerTab(PART_TAB[id])} />
      {risk.missing && <p className={styles.noteBox}>No {listNames(risk.missing.split(','), riskLabel).toLowerCase()} data here; its weight is shared among the other parts in proportion to their weights.</p>}
      <details className={styles.method}>
        <summary>How is risk calculated?</summary>
        <p>As in the Atlas: each part's index times its weight, added up, then classed at ±0.5 and ±1.5 SD around the national average.</p>
        <p>The chart shows where the district stands nationally on each part: the edge is the highest district in India, the dashed line the middle district. A part far out pushes risk up; vulnerability counts 40 %, the others 20 % each.</p>
        <p>All four parts are z-scores, relative to other districts. Future hazard uses the change from 1985–2014 in its 15 indicators, median of six climate models. Vulnerability uses 14 of the Atlas's 15 indicators.</p>
      </details>
    </>
  )
}

// Four-axis chart: the district's national position (0 = lowest, 100 = highest district) on each part of risk,
// against the middle district (dashed). Axis order follows the risk formula.
function RiskRadar({ pct, who }) {
  const data = RISK_PARTS_W.map(p => ({ axis: `${p.label}|${p.weight}%`, id: p.id, v: pct[p.id] ?? 0, mid: 50, has: typeof pct[p.id] === 'number' }))
  // axis label on two lines (name, weight), placed outward so nothing is clipped
  const AxisTick = ({ x, y, cx, cy, payload, textAnchor }) => {
    const [name, w] = payload.value.split('|')
    const up = y < cy - 5
    return (
      <text x={x} y={y} textAnchor={textAnchor} fontSize={11.5} fill="var(--text-secondary)">
        <tspan x={x} dy={up ? -14 : 0}>{name}</tspan>
        <tspan x={x} dy={13} fontSize={10.5} fill="var(--text-muted)">{w}</tspan>
      </text>
    )
  }
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return <div className={styles.radarTip}><strong>{d.axis.replace('|', ' ')}</strong><br />{d.has ? `${who}: higher than ${d.v}% of districts` : 'No data (weight shared)'}</div>
  }
  return (
    <figure className={styles.radar} aria-label={`${who}: ${data.map(d => `${d.axis.replace('|', ' ')} above ${d.v}% of districts`).join('; ')}`}>
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart data={data} outerRadius="74%" margin={{ top: 22, right: 58, bottom: 18, left: 58 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={false} axisLine={false} />
          <PolarAngleAxis dataKey="axis" tick={<AxisTick />} />
          <Radar name="Middle district" dataKey="mid" stroke="var(--text-muted)" strokeDasharray="4 3" fill="none" isAnimationActive={false} />
          <Radar name={who} dataKey="v" stroke="#c8553d" strokeWidth={2} fill="#c8553d" fillOpacity={0.22} dot={{ r: 3, fill: '#c8553d' }} isAnimationActive={false} />
          <Tooltip content={<Tip />} />
        </RadarChart>
      </ResponsiveContainer>
      <figcaption className={styles.radarKey}>
        <span><i className={styles.keyDistrict} />{who}</span>
        <span><i className={styles.keyMid} />Middle district in India</span>
        <span>Edge = highest in India</span>
      </figcaption>
    </figure>
  )
}


// One row per part of risk: name and weight, its class, (districts) its contribution as a diverging bar; opens its tab.
function PartRows({ parts, onOpen, bars = false }) {
  const m = Math.max(...parts.map(p => (typeof p.value === 'number' ? Math.abs(p.value) : 0)), 1e-9)
  return (
    <div className={styles.partRows} role="list">
      {parts.map(p => {
        const has = typeof p.value === 'number'
        const wPct = has ? Math.min(50, (Math.abs(p.value) / m) * 50) : 0
        return (
          <button key={p.id} role="listitem" className={styles.partRow} onClick={() => onOpen(p.id)} title={`Open ${p.label}: its indicators and what drives it`}>
            <span className={styles.partName}>{p.label}<span className={styles.partWeight}>{p.weight}%</span></span>
            <span className={styles.partChip}>
              {p.cls?.color && <i style={{ background: p.cls.color }} />}{p.cls?.value ?? 'No data'}
            </span>
            {typeof p.pct === 'number' && !bars && <span className={styles.partPct}>above {p.pct}%</span>}
            {bars && (
              <span className={styles.partTrack} aria-label={has ? `${p.value >= 0 ? 'raises' : 'lowers'} risk` : 'no data, weight shared'}>
                <span className={styles.partMid} />
                {has ? <span className={`${styles.partBar} ${p.value >= 0 ? styles.up : styles.down}`} style={p.value >= 0 ? { left: '50%', width: `${wPct}%` } : { right: '50%', width: `${wPct}%` }} />
                  : <span className={styles.partNoData}>no data</span>}
              </span>
            )}
            <span className={styles.partGo} aria-hidden="true">›</span>
          </button>
        )
      })}
      {bars && <div className={styles.partAxis} aria-hidden="true"><span>← lowers risk</span><span>raises risk →</span></div>}
    </div>
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
        <div className={styles.sectionTitle}>What raises or lowers future hazard · {periodLabel(period)}</div>
        <TopCounts counts={dr.future_hazard?.[period]} labelOf={hazardLabel} what="future hazard" />
      </div>
    )
  }
  const f = dr.future_hazard?.[period]
  if (!f) return null
  const items = Object.entries(f.c).map(([id, value]) => ({ id, label: hazardLabel(id), value }))
  const sentence = driverSentence('Future hazard', items, f.index, 'above average', 'below average')
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
    ? SHOWN_HAZARD_GROUPS.flatMap(g => g.indicators.map(i => i.id))
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
  // States show their districts, not a state-level future hazard class: no aggregate heading for them.
  const isState = stats?.type === 'state'
  const hideHeading = isState && isAggregate(activeId)

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
      {!hideHeading && <div className={styles.indicatorPickerRow}>
        <div className={styles.activeIndicatorLabel}>
          {meta?.label ?? activeId}
          <span className={styles.activeIndicatorUnit}>{meta?.unit}</span>
        </div>
        <button className={styles.changeIndBtn} onClick={() => setShowPicker(v => !v)}>
          {showPicker ? 'Done' : 'Change'}
        </button>
      </div>}

      {showPicker && !hideHeading && (
        <div className={styles.indicatorPicker}>
          {SHOWN_HAZARD_GROUPS.map(g => {
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

      {isAggregate(activeId) ? <AggView id={activeId} mm={stats?.climate_hazard?.multimodel} isState={isState} />
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
  const short = {}
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: c?.color, border: '1px solid var(--border)' }} />
      {id === AGG_ABS ? `${entry.absolute.share.toFixed(0)}%` : short[cat] ?? cat}
    </span>
  )
}

function AggView({ id, mm, isState }) {
  const { hazardPeriod } = useCRVAStore()
  const period = hazardPeriod === 'historical' ? '2050' : hazardPeriod
  if (!mm) return <div className={styles.cropNote}>No model results for this area.</div>
  const n = mm.n_models
  const cur = mm.aggregate?.[period]
  const cat = statsCategory(id, cur)
  const detail = !cur ? '' : id === AGG_RR
    ? `index ${cur.atlas.index > 0 ? '+' : ''}${cur.atlas.index.toFixed(2)} (0 = national average) · ${cur.atlas.n_unfav} of ${n} models High or Very high`
    : id === AGG_ABS
      ? `${cur.absolute.share.toFixed(1)}% of weight past threshold · ${cur.absolute.n_moderate} of ${n} models Moderate or worse`
      : `rank score ${cur.relative.score.toFixed(0)} / 100 (models ${cur.relative.min.toFixed(0)}–${cur.relative.max.toFixed(0)})`
  return (
    <>
      {!isState && <>
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
          ? 'Rama Rao et al. (2020) indicators and weights: the change from 1985–2014 in 15 indicators, each as a z-score across districts, weighted and added up; classes at ±0.5 and ±1.5 SD. It shows where change is worse than elsewhere in the same period; "Is climate getting worse here?" shows change against the district\'s own past.'
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
      </>}
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
            Method: Rama Rao et al. (2020) Atlas weights and sign-preserving normalisation. Hot/cold-day thresholds scaled to ±2 SD and drought proxied by SPI-3, because the ensemble-mean data smooths out day-to-day extremes.
          </div>
        </>
      )}
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

const EX_CFG = {
  key: 'exposure', name: 'Exposure', groups: exposureIndicators, labelOf: exposureLabel, color: '#4A90C4',
  noun: 'five indicators', empty: 'Not assessed: urban districts, the islands and Ladakh (incomplete data) are outside the Rama Rao exposure index',
}
const HH_CFG = {
  key: 'historical_hazard', name: 'Historical hazard', groups: historicalIndicators, labelOf: historicalLabel, color: '#8a6d3b',
  noun: 'drought, flood and cyclone proneness', empty: 'Not assessed: urban districts, the islands and Ladakh (incomplete data) are outside the Rama Rao index',
  units: { drought_proneness: '% of years', flood_proneness: '% of area', cyclone_proneness: '0–100' },
}

const VU_CFG = {
  key: 'vulnerability', name: 'Vulnerability', groups: vulnerabilityIndicators,
  labelOf: vulnerabilityLabel, color: '#A259C4',
  noun: '14 indicators (per-capita income not available; its weight is added to low-income households)',
  empty: 'Not assessed: urban districts, the islands and Ladakh are outside the Rama Rao index',
}

function ExposureTab({ data, drivers, cfg = EX_CFG, fid }) {
  const [layer, setLayer] = React.useState(null)
  React.useEffect(() => { loadLayer(cfg.key).then(setLayer) }, [cfg.key])
  if (!data) return (
    <div className={styles.empty} style={{ height: 120 }}>
      <div>No {cfg.name.toLowerCase()} data</div>
      <div className={styles.emptyNote}>{cfg.empty}</div>
    </div>
  )
  if (data.class_counts) {
    const total = Object.values(data.class_counts).reduce((a, b) => a + b, 0)
    return (
      <>
        <div className={styles.sectionTitle}>What raises or lowers {cfg.name.toLowerCase()}, by district</div>
        <TopCounts counts={drivers?.[cfg.key]} labelOf={cfg.labelOf} what={cfg.name.toLowerCase()} />
        <div className={styles.sectionTitle} style={{ marginTop: 18 }}>{cfg.name} · districts by class</div>
        {Object.entries(data.class_counts).reverse().map(([c, n]) => (
          <div key={c} className={styles.indicRow}>
            <span className={styles.indicName}><span className={styles.swatch} style={{ background: EX_CLASS_COLOR[c] }} />{c}</span>
            <div className={styles.indicBar}><div className={styles.indicBarFill} style={{ width: `${(n / Math.max(total, 1)) * 100}%`, background: EX_CLASS_COLOR[c] }} /></div>
            <span className={styles.indicVal}>{n}</span>
          </div>
        ))}
        <p className={styles.hint}>Zoom in and select a district for its indicators.</p>
      </>
    )
  }
  const inds = cfg.groups.flatMap(g => g.indicators).filter(i => i.bands)
  const gaps = data.gaps ? data.gaps.split(',') : []
  const exd = drivers?.[cfg.key]
  const dItems = exd ? Object.entries(exd.c).map(([id, value]) => ({ id, label: cfg.labelOf(id), value })) : []
  const dSentence = exd ? driverSentence(cfg.name, dItems, exd.index, 'above average', 'below average') : null
  const li = layer ? layer.ids.indexOf(String(fid)) : -1
  // share of districts with a lower value: a scale every indicator shares
  const pct = id => {
    const arr = layer?.ind?.[id]; const v = arr?.[li]
    if (li < 0 || typeof v !== 'number') return null
    const all = arr.filter(x => typeof x === 'number')
    return Math.round((100 * all.filter(x => x < v).length) / all.length)
  }
  return (
    <>
      <div className={styles.dimSummary}>
        <span className={styles.partChip}><i style={{ background: EX_CLASS_COLOR[data.class] ?? '#ccc' }} />{data.class ?? 'No index'}</span>
        <span className={styles.heroSub}>{typeof data.index === 'number' ? `${cfg.name} index ${data.index.toFixed(2)} · 0 = national average` : 'Not enough data for an index'}</span>
      </div>
      {exd && (
        <>
          <div className={styles.sectionTitle}>What drives {cfg.name.toLowerCase()}</div>
          {dSentence && <p className={styles.driverSentence}>{dSentence}</p>}
          <DriverBars items={dItems} limit={6} upLabel="raises" downLabel="lowers" pendingLabel="no data · weight shared" />
        </>
      )}
      <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Indicator values</div>
      <div className={styles.pctHead} aria-hidden="true"><span /><span className={styles.pctScale}><span>lowest</span><span>highest</span></span><span>value</span></div>
      {inds.map(ind => {
        const v = data.indicators?.[ind.id]
        const isGap = gaps.includes(ind.id) || typeof v !== 'number'
        const p = isGap ? null : pct(ind.id)
        const unit = cfg.units ? cfg.units[ind.id] : ind.unit
        return (
          <div key={ind.id} className={styles.pctRow}>
            <div className={styles.pctLabel}>
              <span>{ind.label}</span>
              <span className={styles.pctMeta}>{ind.weight}% · {ind.direction === '-' ? 'higher lowers' : 'higher raises'} {cfg.name.toLowerCase()}</span>
            </div>
            <div className={styles.pctTrack} title={p == null ? 'No data' : `Higher than ${p}% of districts`}>
              {p != null && <span className={styles.pctMarker} style={{ left: `${p}%`, background: cfg.color }} />}
            </div>
            <div className={styles.pctVal}>
              {isGap ? <span className={styles.pctNone}>no data</span> : <>{v >= 100 ? v.toFixed(0) : v.toFixed(1)}<span className={styles.pctUnit}> {unit}</span></>}
              {p != null && <span className={styles.pctMeta}>above {p}%</span>}
            </div>
          </div>
        )
      })}
      {gaps.length > 0 && <p className={styles.noteBox}>{typeof data.index === 'number'
        ? `No data for ${listNames(gaps, cfg.labelOf).toLowerCase()}; ${gaps.length > 1 ? 'their weight is' : 'its weight is'} shared among the other indicators in proportion to their Atlas weights.`
        : 'This district has no row in the source data, so it has no index.'}</p>}
      {data.source_district && <p className={styles.hint}>Values from 2011 district {data.source_district}.</p>}
      <details className={styles.method}>
        <summary>How is the {cfg.name.toLowerCase()} index calculated?</summary>
        <p>Rama Rao et al. (2020) method: {cfg.noun}. Each indicator is compared with the national average (z-score, signed so that + raises {cfg.name.toLowerCase()}), multiplied by its Atlas weight, and added up; the driver bars add up to the index. Classes at ±0.5 and ±1.5 SD around the national average.</p>
        <p>"Above N%" is the share of districts with a lower value; the marker shows the same position on the track.</p>
      </details>
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
