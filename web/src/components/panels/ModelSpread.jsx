import React from 'react'
import { useCRVAStore, HAZARD_PERIODS } from '../../store/useCRVAStore.js'
import { loadMM, isMM, mmComp, MODELS } from '../../lib/multimodel.js'
import { AGG_RR } from '../../lib/aggregate.js'
import styles from './Panel.module.css'

// How the six climate models compare, for the future hazard part only:
// the Rama Rao index (rr_index) and its 15 indicators (mm_*).
export const hasModelSpread = id => id === AGG_RR || isMM(id)

const ROWS = ['median', ...MODELS]

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function fmt(v) {
  const a = Math.abs(v)
  const s = a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a.toFixed(2)
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : '0'
}

function Row({ source, active, onPick, children, label }) {
  return (
    <div
      role="button" tabIndex={0}
      className={`${styles.spreadRow} ${active ? styles.spreadRowActive : ''}`}
      onClick={() => onPick(source)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(source) } }}
      title={`Show ${source === 'median' ? 'the median of all six models' : source} on the map`}
    >
      <span className={styles.spreadLabel}>{label}</span>
      {children}
    </div>
  )
}

// One box per model: the spread of the change across districts.
function IndicatorSpread({ mm, comp, period, unit, source, onPick }) {
  const stats = React.useMemo(() => {
    const rows = ROWS.map(s => {
      const v = (mm.chg[comp]?.[s]?.[period] ?? []).filter(x => x != null).sort((a, b) => a - b)
      return v.length ? { s, p10: quantile(v, 0.1), p25: quantile(v, 0.25), p50: quantile(v, 0.5), p75: quantile(v, 0.75), p90: quantile(v, 0.9) } : null
    }).filter(Boolean)
    const ag = (mm.agree[comp]?.[period] ?? []).filter(Boolean)
    const n = ROWS.length - 1
    const sure = ag.filter(([adv]) => adv >= n - 1 || adv <= 1).length
    return { rows, agreePct: ag.length ? Math.round(100 * sure / ag.length) : null }
  }, [mm, comp, period])

  if (!stats.rows.length) return null
  let lo = Math.min(0, ...stats.rows.map(r => r.p10)), hi = Math.max(0, ...stats.rows.map(r => r.p90))
  const pad = (hi - lo) * 0.04 || 1; lo -= pad; hi += pad
  const W = 150, x = v => ((v - lo) / (hi - lo)) * W

  return (
    <>
      {stats.rows.map(r => (
        <Row key={r.s} source={r.s} active={source === r.s} onPick={onPick} label={r.s === 'median' ? 'Median of 6' : r.s}>
          <svg className={styles.spreadSvg} viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" aria-hidden="true">
            <line x1={x(0)} x2={x(0)} y1="0" y2="14" className={styles.spreadZero} />
            <line x1={x(r.p10)} x2={x(r.p90)} y1="7" y2="7" className={styles.spreadWhisker} />
            <rect x={x(r.p25)} y="3" width={Math.max(1, x(r.p75) - x(r.p25))} height="8" rx="1.5"
              className={r.s === 'median' ? styles.spreadBoxMedian : styles.spreadBox} />
            <line x1={x(r.p50)} x2={x(r.p50)} y1="1.5" y2="12.5" className={styles.spreadMid} />
          </svg>
        </Row>
      ))}
      <div className={styles.spreadAxis}>
        <span>{fmt(lo + pad)}</span>
        {x(0) / W > 0.15 && x(0) / W < 0.75 && <span className={styles.spreadAxisZero} style={{ left: `${(x(0) / W) * 100}%` }}>0</span>}
        <span>{fmt(hi - pad)} {unit}</span>
      </div>
      <div className={styles.note}>
        Change by district from 1985–2014. Box: middle half of districts; line: 80% of districts; tick: middle district.
        {stats.agreePct != null && ` At least 5 of 6 models agree on whether the change is harmful in ${stats.agreePct}% of districts.`}
      </div>
    </>
  )
}

// The index is relative within each model, so its values look alike in every model.
// Instead, count how many models put each district in High or Very high.
function IndexAgreement({ mm, period }) {
  const s = React.useMemo(() => {
    const k = MODELS.length, counts = Array(k + 1).fill(0)
    mm.admins.forEach((_, i) => {
      const cls = MODELS.map(m => mm.agg[m]?.[period]?.[i]?.ac)
      if (cls.some(c => !c)) return
      counts[cls.filter(c => c === 'High' || c === 'Very high').length]++
    })
    const n = counts.reduce((a, b) => a + b, 0)
    return { k, n, counts, strong: counts[k] + counts[k - 1], none: counts[0] }
  }, [mm, period])

  if (!s.n) return null
  const W = 150, max = Math.max(...s.counts)
  return (
    <>
      {s.counts.map((c, j) => ({ c, j })).reverse().map(({ c, j }) => (
        <div key={j} className={styles.spreadRow} style={{ cursor: 'default' }}>
          <span className={styles.spreadLabel}>{j} of {s.k} models</span>
          <svg className={styles.spreadSvg} viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="3" width={Math.max(c ? 1 : 0, (c / max) * W)} height="8" rx="1.5"
              className={j >= s.k - 1 ? styles.spreadBoxStrong : styles.spreadBox} />
          </svg>
          <span className={styles.spreadValue}>{c}</span>
        </div>
      ))}
      <div className={styles.note}>
        Districts by how many of the six models put them in High or Very high.
        {` ${s.strong} districts (${Math.round(100 * s.strong / s.n)}%) are High or Very high in at least ${s.k - 1} models; ${s.none} are in none. Where few models agree, read the median map with care.`}
      </div>
    </>
  )
}

export default function ModelSpread({ id, unit }) {
  const { hazardPeriod, mmSource, setMmSource } = useCRVAStore()
  const [mm, setMM] = React.useState(null)
  React.useEffect(() => { let on = true; loadMM().then(d => on && setMM(d)); return () => { on = false } }, [])
  if (!mm) return null

  const period = hazardPeriod === 'historical' ? '2050' : hazardPeriod
  const pLabel = HAZARD_PERIODS.find(p => p.id === period)?.label
  const comp = isMM(id) ? mmComp(id) : null
  const chgUnit = comp && mm.pct.includes(comp) ? '%' : unit

  return (
    <>
      <div className={styles.optionLabel}>How the six models compare · {pLabel}</div>
      {comp
        ? <IndicatorSpread mm={mm} comp={comp} period={period} unit={chgUnit} source={mmSource} onPick={setMmSource} />
        : <IndexAgreement mm={mm} period={period} />}
    </>
  )
}
