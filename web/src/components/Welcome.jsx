import React from 'react'
import { RISK_PARTS_W } from '../lib/risk.js'
import styles from './Welcome.module.css'

// Welcome on every visit: what the tool is, what risk is made of, how to start.

const PART_TEXT = {
  vulnerability: 'how well farming can cope: soils, water, irrigation, literacy, income, markets',
  exposure: 'how much is at stake: farmland, rural people, small farms, SC/ST population, crossbred cattle',
  historical_hazard: 'past drought, floods and cyclones',
  future_hazard: 'projected change in rainfall and temperature, six climate models (SSP2-4.5)',
}

export default function Welcome() {
  const [open, setOpen] = React.useState(true)
  const btn = React.useRef(null)
  const close = () => setOpen(false)

  React.useEffect(() => {
    if (!open) return
    btn.current?.focus()
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className={styles.eyebrow}>India CRVA Tool · FAO TCP/IND/4005 with NITI Aayog</div>
        <h1 id="welcome-title" className={styles.title}>Where is Indian farming most at risk from climate change?</h1>
        <p className={styles.lead}>
          This map rates the climate risk to agriculture in each of India's districts, following the ICAR-CRIDA
          Atlas method (Rama Rao et al. 2020).
        </p>

        <div className={styles.label}>Risk combines four parts</div>
        <div className={styles.stack} aria-hidden="true">
          {RISK_PARTS_W.map(p => <span key={p.id} style={{ flex: p.weight, background: p.color }} />)}
        </div>
        <ul className={styles.parts}>
          {RISK_PARTS_W.map(p => (
            <li key={p.id}>
              <i style={{ background: p.color }} />
              <span><strong>{p.label}</strong> <em>{p.weight}%</em> · {PART_TEXT[p.id]}</span>
            </li>
          ))}
        </ul>

        <div className={styles.label}>How to explore</div>
        <ol className={styles.steps}>
          <li>The map opens on <strong>overall risk</strong>. The buttons on the left show each part on its own.</li>
          <li><strong>Click a state</strong> to see its districts, or zoom in and click a district. You can also <strong>search</strong> at the top.</li>
          <li>The bar at the bottom changes the <strong>period</strong>: ~2047, ~2050 or ~2100.</li>
        </ol>

        <p className={styles.note}>
          Risk is relative: each district is compared with the national average, from Very low to Very high.
          Method, data sources and district boundaries are explained under <strong>About</strong>.
        </p>

        <div className={styles.actions}>
          <button ref={btn} className={styles.go} onClick={close}>Continue to the map</button>
        </div>
      </div>
    </div>
  )
}
