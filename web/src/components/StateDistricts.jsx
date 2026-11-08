import React from 'react'
import { RISK_CLASS_LIST, RISK_PARTS_W } from '../lib/risk.js'
import styles from './DetailDrawer.module.css'

// A state's panel shows its districts, not a state score: a state score would need every indicator re-aggregated
// with its own denominator. Data: public/data/risk.json (names, state, idx, cls, pct per window; 16_drivers_web.py).

// The state's districts, highest risk first; districts without a risk index at the end.
export function stateRows(risk, stateId, w) {
  if (!risk?.state) return { rows: [], n: 0, classShare: [0, 0, 0, 0, 0] }
  const all = risk.idx[w] ?? []
  const nat = all.filter(x => typeof x === 'number')
  const rows = []
  risk.state.forEach((s, i) => {
    if (s !== String(stateId)) return
    const v = all[i]
    const has = typeof v === 'number'
    rows.push({
      id: risk.ids[i], name: risk.names[i], bbox: risk.bbox?.[i], idx: has ? v : null,
      cls: has ? risk.cls[w][i] : null, rank: has ? 1 + nat.filter(x => x > v).length : null,
      pct: Object.fromEntries(RISK_PARTS_W.map(p => [p.id, risk.pct?.[w]?.[p.id]?.[i] ?? null])),
    })
  })
  rows.sort((a, b) => (b.idx ?? -Infinity) - (a.idx ?? -Infinity))
  // share of the country's districts in each class, for the bands
  const cc = [0, 0, 0, 0, 0]
  for (const c of risk.cls[w] ?? []) if (typeof c === 'number') cc[c] += 1
  return { rows, n: nat.length, classShare: cc.map(c => (c / Math.max(nat.length, 1)) * 100) }
}

const textOn = c => (c === 0 || c === 4 ? '#fff' : '#1C1814')
// national position: the share of the country's districts with lower risk (0 = lowest, 100 = highest)
const posOf = (rank, n) => (n > 1 ? ((n - rank) / (n - 1)) * 100 : 50)

// The state's districts by national position; behind them the national classes, each as wide as its share of districts.
export function DistrictStrip({ rows, n, classShare, onPick }) {
  const [hover, setHover] = React.useState(null)
  const pts = rows.filter(r => r.idx !== null)
  if (!pts.length) return null
  const W = 340, R = 4.6, PAD = 6, GAP = 2 * R + 0.8
  const x = p => PAD + (p / 100) * (W - 2 * PAD)
  const edges = classShare.reduce((a, s) => [...a, a[a.length - 1] + s], [0])
  // simple beeswarm: each dot takes the free lane nearest the middle
  const lanes = []
  const placed = pts.slice().reverse().map(r => {
    const cx = x(posOf(r.rank, n))
    for (let k = 0; ; k++) {
      const busy = lanes[k] ?? (lanes[k] = [])
      if (busy.every(bx => Math.abs(bx - cx) >= GAP)) { busy.push(cx); return { ...r, cx, lane: k === 0 ? 0 : (k % 2 ? (k + 1) / 2 : -k / 2) } }
    }
  })
  const maxLane = Math.max(1, ...placed.map(p => Math.abs(p.lane)))
  const H = Math.max(40, 2 * maxLane * GAP + 2 * R + 10)
  const mid = H / 2
  const h = hover
  const label = (c, i) => {
    const w = x(edges[i + 1]) - x(edges[i])
    if (w > 40) return <text key={c.id} x={(x(edges[i]) + x(edges[i + 1])) / 2} y={H + 12} textAnchor="middle" className={styles.stripBand}>{c.label}</text>
    // the narrow end classes: label at the edge of the chart, one line lower
    if (i === 0) return <text key={c.id} x={PAD} y={H + 23} textAnchor="start" className={styles.stripBand}>{c.label}</text>
    if (i === 4) return <text key={c.id} x={W - PAD} y={H + 23} textAnchor="end" className={styles.stripBand}>{c.label}</text>
    return null
  }
  return (
    <figure className={styles.strip}>
      <svg viewBox={`0 0 ${W} ${H + 27}`} width="100%" role="img" aria-label={`${pts.length} districts by their position among India's ${n} districts`}>
        {RISK_CLASS_LIST.map((c, i) => (
          <rect key={c.id} x={x(edges[i])} y={0} width={Math.max(0, x(edges[i + 1]) - x(edges[i]))} height={H} fill={c.color} opacity={0.25} />
        ))}
        {RISK_CLASS_LIST.map(label)}
        <line x1={x(50)} x2={x(50)} y1={0} y2={H} className={styles.stripMean} />
        {placed.map(p => (
          <circle key={p.id} cx={p.cx} cy={mid + p.lane * GAP} r={h?.id === p.id ? R + 1.6 : R}
            fill={RISK_CLASS_LIST[p.cls].color} className={styles.stripDot}
            tabIndex={0} role="button" aria-label={`${p.name}: ${RISK_CLASS_LIST[p.cls].label} risk, ranks ${p.rank} of ${n}`}
            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}
            onClick={() => onPick(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p) } }} />
        ))}
      </svg>
      <figcaption className={styles.stripCap}>
        {h ? <span><strong>{h.name}</strong> · {RISK_CLASS_LIST[h.cls].label} · ranks {h.rank} of {n} · click to open</span>
          : <span>Each dot is a district, placed by its rank among India's {n} districts (right = highest risk). Bands: national classes; dashed line: the middle district.</span>}
      </figcaption>
    </figure>
  )
}

// Ranked list; the first rows by default, all on request.
export function DistrictList({ rows, n, onPick }) {
  const [all, setAll] = React.useState(false)
  const shown = all ? rows : rows.slice(0, 6)
  return (
    <div className={styles.dlist} role="list">
      {shown.map(r => (
        <button key={r.id} role="listitem" className={styles.dRow} onClick={() => onPick(r)} title={`Open ${r.name} and zoom the map to it`}>
          <span className={styles.dName}>{r.name}</span>
          {r.cls !== null
            ? <span className={styles.dPill} style={{ background: RISK_CLASS_LIST[r.cls].color, color: textOn(r.cls) }}>{RISK_CLASS_LIST[r.cls].label}</span>
            : <span className={styles.dNone}>Not assessed</span>}
          <span className={styles.dRank}>{r.rank ? `${r.rank} / ${n}` : ''}</span>
          <span className={styles.partGo} aria-hidden="true">›</span>
        </button>
      ))}
      {rows.length > 6 && (
        <button className={styles.dMore} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${rows.length} districts`}</button>
      )}
      <div className={styles.summaryNote}>Rank in the country: 1 = highest risk.</div>
    </div>
  )
}

// Each part of risk: every district's national position (0 = lowest district in India, 100 = highest) and the median.
export function PartSpread({ rows, onOpen }) {
  const pts = rows.filter(r => r.idx !== null)
  if (!pts.length) return null
  return (
    <div className={styles.spread}>
      <div className={styles.spreadScale}><span /><span>lowest in India</span><span>middle</span><span>highest</span></div>
      {RISK_PARTS_W.map(p => {
        const v = pts.map(r => r.pct[p.id]).filter(x => typeof x === 'number').sort((a, b) => a - b)
        const med = v.length ? v[Math.floor((v.length - 1) / 2)] : null
        return (
          <button key={p.id} className={styles.spreadRow} onClick={() => onOpen(p.id)} title={`Open ${p.label}`}
            aria-label={v.length ? `${p.label}: districts from ${v[0]} to ${v[v.length - 1]}, median ${med}` : `${p.label}: no data`}>
            <span className={styles.spreadName}>{p.label}<span className={styles.partWeight}>{p.weight}%</span></span>
            <span className={styles.spreadTrack}>
              <span className={styles.spreadMid} />
              {v.length > 1 && <span className={styles.spreadRange} style={{ left: `${v[0]}%`, width: `${v[v.length - 1] - v[0]}%`, background: p.color }} />}
              {pts.map(r => typeof r.pct[p.id] === 'number' && (
                <span key={r.id} className={styles.spreadDot} style={{ left: `${r.pct[p.id]}%`, background: p.color }} title={`${r.name}: higher than ${r.pct[p.id]}% of districts`} />
              ))}
              {med !== null && <span className={styles.spreadMed} style={{ left: `${med}%`, borderColor: p.color }} />}
            </span>
            <span className={styles.spreadVal}>{med !== null ? med : '–'}</span>
          </button>
        )
      })}
      <div className={styles.summaryNote}>Each dot is a district; the ring is the state's middle district and its number. Click a part to open its tab.</div>
    </div>
  )
}
