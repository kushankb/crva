import React from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Legend as RechartsLegend } from 'recharts'
import { useCRVAStore, RISK_CLASSES, SSPS, SSP_LABELS, HAZARD_PERIODS } from '../store/useCRVAStore.js'
import dimensions from '../data/dimensions.json'
import styles from './DetailDrawer.module.css'

let crvaStats = null
async function loadStats() {
  if (crvaStats) return crvaStats
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/crva_stats.json`)
    crvaStats = await res.json()
  } catch { crvaStats = {} }
  return crvaStats
}

const DIM_COLORS = {
  climate_hazard: '#E05A3A',
  exposure: '#4A90C4',
  vulnerability: '#A259C4',
  risk_score: '#D73027',
}

const SSP_COLORS = { SSP126: '#1A9850', SSP245: '#FEE08B', SSP370: '#F46D43', SSP585: '#D73027' }

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
  const [activeTab, setActiveTab] = React.useState('overview')

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
        {!stats && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◎</div>
            <div>No CRVA data available for this {selectedFeature.type}.</div>
            <div className={styles.emptyNote}>Placeholder data · Run the pipeline to connect real district statistics.</div>
          </div>
        )}

        {stats && activeTab === 'overview' && (
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
        )}

        {stats && activeTab === 'hazard' && <HazardTab stats={stats} />}
        {stats && activeTab === 'crop' && <CropTab stats={stats} />}
        {stats && activeTab === 'exposure' && <IndicatorTab data={stats?.exposure} label="Exposure" color={DIM_COLORS.exposure} note="Agricultural exposure of rural livelihoods" />}
        {stats && activeTab === 'vulnerability' && <IndicatorTab data={stats?.vulnerability} label="Vulnerability" color={DIM_COLORS.vulnerability} note="Sensitivity factors and adaptive capacity" />}
      </div>

      <div className={styles.source}>TCP/IND/4005 · IPCC WG2 AR6 · CRIDA methodology · Placeholder data</div>
    </aside>
  )
}

function HazardTab({ stats }) {
  const histVal = stats?.climate_hazard?.historical ?? null
  const hazardData = HAZARD_PERIODS.filter(p => p.id !== 'historical').map(p => {
    const row = { period: p.label }
    SSPS.forEach(s => { row[s] = stats?.climate_hazard?.projections?.[s]?.[p.id] ?? null })
    return row
  })

  return (
    <>
      <div className={styles.sectionTitle}>Future Projections (INDRA-CMIP6)</div>

      {histVal != null && (
        <div className={styles.baselineRow}>
          <span>Historical baseline (1985–2014)</span>
          <span className={styles.baselineVal}>{histVal.toFixed(1)}</span>
        </div>
      )}

      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={hazardData} barSize={8} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            {histVal != null && <ReferenceLine y={histVal} stroke="#666" strokeDasharray="4 2" label={{ value: 'Baseline', position: 'right', fontSize: 8, fill: '#999' }} />}
            <Tooltip
              contentStyle={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)', fontSize: 11, borderRadius: 6 }}
              formatter={(v, name) => [v != null ? v.toFixed(1) : '—', SSP_LABELS[name] ?? name]}
            />
            {SSPS.map(s => <Bar key={s} dataKey={s} name={s} fill={SSP_COLORS[s]} radius={[2,2,0,0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SSP color legend */}
      <div className={styles.sspLegend}>
        <div className={styles.sspLegendTitle}>Scenario colors</div>
        <div className={styles.sspLegendItems}>
          {SSPS.map(s => (
            <div key={s} className={styles.sspLegendItem}>
              <div className={styles.sspLegendDot} style={{ background: SSP_COLORS[s] }} />
              <span>{SSP_LABELS[s]}</span>
            </div>
          ))}
        </div>
        <div className={styles.sspLegendNote}>
          SSP1-2.6: low emissions · SSP2-4.5: intermediate · SSP3-7.0: high · SSP5-8.5: very high
        </div>
      </div>

      <div className={styles.sectionTitle} style={{ marginTop: 12 }}>Composite Hazard Score</div>
      <div className={styles.scoreBar}>
        <div className={styles.scoreBarFill} style={{ width: `${stats?.climate_hazard?.composite_score ?? 0}%`, background: '#E05A3A' }} />
      </div>
      <div className={styles.scoreBarLabel}>{(stats?.climate_hazard?.composite_score ?? 0).toFixed(1)} / 100</div>
    </>
  )
}

const ALL_CROPS = ['Rice_Irrigated','Wheat','Maize','Chickpea','Pigeonpea','Soybean','Groundnut','Mustard','Cotton','Potato','Sorghum','Pearl_Millet']
const CROP_PERIODS = ['2020','2050','2080']

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
              {CROP_PERIODS.map(p => {
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
      </table>
      {crops.length === 0 && <div className={styles.empty} style={{ height: 80 }}><div>No crop data available</div></div>}
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
