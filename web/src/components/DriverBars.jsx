import React from 'react'
import hazardIndicators from '../data/climate_hazard_indicators.json'
import exposureIndicators from '../data/exposure_indicators.json'
import historicalIndicators from '../data/historical_hazard_indicators.json'
import styles from './DriverBars.module.css'

// What pushes a score up or down: one diverging bar per part, sorted by size.
// items: [{ id, label, value }] — value null shows the part as not yet available.
export default function DriverBars({ items, max, limit, upLabel = 'raises', downLabel = 'lowers' }) {
  const [all, setAll] = React.useState(false)
  const avail = items.filter(i => typeof i.value === 'number')
  const pending = items.filter(i => typeof i.value !== 'number')
  const sortedAll = avail.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const sorted = limit && !all ? sortedAll.slice(0, limit) : sortedAll
  const m = max ?? Math.max(...avail.map(i => Math.abs(i.value)), 1e-9)
  return (
    <div className={styles.wrap} role="list">
      <div className={styles.axis} aria-hidden="true"><span>← {downLabel}</span><span>{upLabel} →</span></div>
      {sorted.map(i => {
        const w = Math.min(50, (Math.abs(i.value) / m) * 50)
        const up = i.value >= 0
        return (
          <div key={i.id} className={styles.row} role="listitem" aria-label={`${i.label}: ${fmtSigned(i.value)}`}>
            <span className={styles.label}>{i.label}</span>
            <span className={styles.track}>
              <span className={styles.mid} />
              <span className={`${styles.bar} ${up ? styles.up : styles.down}`}
                style={up ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
            </span>
            <span className={styles.val}>{fmtSigned(i.value)}</span>
          </div>
        )
      })}
      {limit && sortedAll.length > limit && (
        <button className={styles.more} onClick={() => setAll(!all)}>
          {all ? 'Show top ' + limit : `Show all ${sortedAll.length}`}
        </button>
      )}
      {pending.map(i => (
        <div key={i.id} className={`${styles.row} ${styles.pending}`} role="listitem">
          <span className={styles.label}>{i.label}</span>
          <span className={styles.trackPending}>not yet available</span>
          <span className={styles.val}>—</span>
        </div>
      ))}
    </div>
  )
}

export function fmtSigned(v) {
  if (typeof v !== 'number') return '—'
  const a = Math.abs(v)
  const s = a >= 0.1 ? a.toFixed(2) : a.toFixed(3)
  return (v > 0 ? '+' : v < 0 ? '−' : '') + s
}

// "X is high mainly because of A and B" from the parts pushing in the direction of the total.
export function driverSentence(subject, items, total, highWord = 'high', lowWord = 'low') {
  const avail = items.filter(i => typeof i.value === 'number')
  if (!avail.length || typeof total !== 'number') return null
  const up = total >= 0
  const push = avail.filter(i => (up ? i.value > 0 : i.value < 0)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const against = avail.filter(i => (up ? i.value < 0 : i.value > 0)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  if (!push.length) return null
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1)
  const names = push.slice(0, 2).map(i => lc(i.label))
  let s = `${subject} is ${up ? highWord : lowWord} mainly because of ${names.join(' and ')}`
  if (against[0] && Math.abs(against[0].value) > Math.abs(push[0].value) * 0.4) s += `; ${lc(against[0].label)} pulls the other way`
  return s + '.'
}

const HZ = Object.fromEntries(hazardIndicators.flatMap(g => g.indicators).map(i => [i.id, i.label]))
const EX = Object.fromEntries(exposureIndicators.flatMap(g => g.indicators).map(i => [i.id, i.label]))
export const hazardLabel = id => HZ[`mm_${id}`] ?? id.replace(/_/g, ' ')
export const exposureLabel = id => EX[id] ?? id.replace(/_/g, ' ')
const HH = Object.fromEntries(historicalIndicators.flatMap(g => g.indicators).map(i => [i.id, i.label]))
export const historicalLabel = id => HH[id] ?? id.replace(/_/g, ' ')
export const RISK_PARTS = [
  { id: 'historical_hazard', label: 'Historical hazard', weight: 20 },
  { id: 'future_hazard', label: 'Future hazard', weight: 20 },
  { id: 'exposure', label: 'Exposure', weight: 20 },
  { id: 'vulnerability', label: 'Vulnerability', weight: 40 },
]
export const riskLabel = id => RISK_PARTS.find(p => p.id === id)?.label ?? id
