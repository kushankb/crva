import React from 'react'
import { useCRVAStore } from '../store/useCRVAStore.js'
import styles from './TopBar.module.css'

export default function TopBar() {
  const { theme, toggleTheme } = useCRVAStore()
  const [showAbout, setShowAbout] = React.useState(false)

  return (
    <>
      <header className={styles.bar}>
        <div className={styles.left}>
          <div className={styles.logo}>◉</div>
          <div>
            <div className={styles.title}>India CRVA Tool</div>
            <div className={styles.sub}>Climate Risk &amp; Vulnerability Assessment · District Level</div>
          </div>
        </div>
        <div className={styles.right}>
          <button className={styles.aboutBtn} onClick={() => setShowAbout(true)}>About</button>
          <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀' : '◑'}
          </button>
        </div>
      </header>

      {showAbout && (
        <div className={styles.overlay} onClick={() => setShowAbout(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>About this tool</div>
              <button className={styles.modalClose} onClick={() => setShowAbout(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>What is the India CRVA Tool?</h3>
                <p>The India Climate Risk &amp; Vulnerability Assessment (CRVA) Tool is an interactive district-level map built to support the FAO TCP/IND/4005 project. It synthesises future climate projections, agricultural exposure data, and socio-economic vulnerability indicators into a single spatial framework following the <strong>IPCC WG2 AR6</strong> risk framework: <em>Risk = f(Hazard, Exposure, Vulnerability)</em>.</p>
                <p>The tool is designed to help planners, researchers, and policymakers identify which districts and crops face the highest compound climate risks, and to explore how those risks change across emission scenarios and time horizons.</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>Data &amp; Methods</h3>
                <div className={styles.dataGrid}>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Climate Hazard</div>
                    <div className={styles.dataCardDesc}>33 indicators from <strong>INDRA-CMIP6</strong> — a 14-model ensemble mean bias-corrected to 0.1° resolution. Covers heat stress, drought, precipitation extremes, and agro-climatic indices across four SSP scenarios (SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5) and three future periods (~2047, ~2050, ~2100).</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Crop Sensitivity</div>
                    <div className={styles.dataCardDesc}>Projected yield changes for 12 crops (rice, wheat, maize, chickpea, and others) under RCP 4.5 from <strong>Soora et al.</strong>, gridded at 0.5° and displayed at 0.1° resolution to match the hazard layer.</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Exposure</div>
                    <div className={styles.dataCardDesc}>Agricultural exposure of rural livelihoods — net sown area, rural population density, farm size distribution — aggregated to district level from Census and Agriculture Census sources.</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Vulnerability</div>
                    <div className={styles.dataCardDesc}>Sensitivity and adaptive capacity indicators covering groundwater stress, rainfed area share, road connectivity, crop insurance coverage, and GESI dimensions — drawn from CGWB, PMGSY, PMFBY, and NSSO datasets.</div>
                  </div>
                </div>
                <p className={styles.metaNote}>Tiles served as PMTiles (v3) vector format. District boundaries from the Survey of India delimitation.</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>How to use</h3>
                <ol className={styles.steps}>
                  <li><strong>Select a dimension</strong> from the top tabs — Climate Hazard, Exposure, Vulnerability, or Risk Score.</li>
                  <li><strong>Choose an indicator</strong> from the left panel. For climate hazard, also pick a scenario (SSP) and time period from the left panel and the bottom bar.</li>
                  <li><strong>Toggle Values / Change</strong> to switch between absolute values and anomaly relative to the historical baseline.</li>
                  <li><strong>Click a state</strong> to open the detail panel. <strong>Zoom in</strong> to district level and click a district for district-specific insights across all dimensions.</li>
                  <li><strong>Switch to Crop Sensitivity</strong> under Vulnerability to see projected yield change maps for individual crops.</li>
                </ol>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>Built with</h3>
                <p className={styles.builtWith}>React · MapLibre GL JS · PMTiles · Vite · Zustand · Recharts · INDRA-CMIP6 · Soora et al. (2013) · FAO TCP/IND/4005</p>
              </section>

            </div>
          </div>
        </div>
      )}
    </>
  )
}
