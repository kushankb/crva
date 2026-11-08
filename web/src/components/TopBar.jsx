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
                <p>The India Climate Risk &amp; Vulnerability Assessment (CRVA) Tool is an interactive district map built for the FAO TCP/IND/4005 project with NITI Aayog. It follows the method of Rama Rao et al. (2020), the ICAR-CRIDA <em>Risk and Vulnerability Assessment of Indian Agriculture to Climate Change</em> Atlas: risk combines historical hazard, future hazard, exposure and vulnerability.</p>
                <p>It helps planners and researchers see which districts' farming is most at risk from climate change, and why.</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>Data &amp; Methods</h3>
                <div className={styles.dataGrid}>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Risk (Atlas Table 6)</div>
                    <div className={styles.dataCardDesc}>Historical hazard 20 %, future hazard 20 %, exposure 20 %, vulnerability 40 %. Where a district has no data for a part, its weight is shared among the others. Classes at ±0.5 and ±1.5 SD around the national average (Table 7).</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Future hazard</div>
                    <div className={styles.dataCardDesc}>The Atlas future hazard index (15 rainfall and temperature indicators) and compound extremes, from six individual <strong>INDRA-CMIP6</strong> climate models, SSP2-4.5, as change from 1985–2014 (~2047, ~2050, ~2100).</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Historical hazard</div>
                    <div className={styles.dataCardDesc}>Drought proneness (IMD rainfall, 1981–2020), flood proneness (inundated area, 1998–2022) and cyclone proneness (storm tracks, 1982–2020); Atlas weights 55 / 25 / 20.</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Exposure</div>
                    <div className={styles.dataCardDesc}>Net sown area, rural population density, small and marginal holdings, SC/ST population and crossbred cattle (Census 2011, Agriculture Census 2015-16, Livestock Census 2019).</div>
                  </div>
                  <div className={styles.dataCard}>
                    <div className={styles.dataCardLabel}>Vulnerability</div>
                    <div className={styles.dataCardDesc}>14 of the Atlas's 15 indicators across natural, human, social, physical and financial capital: rainfall, soils, groundwater, irrigation, literacy, roads, electrification, markets, self-help groups, fertiliser use and low-income households.</div>
                  </div>
                </div>
                <p className={styles.metaNote}>Exposure, historical hazard and vulnerability are on Census 2011 districts, carried to current (LGD) districts by largest overlap. Urban districts, the islands and Ladakh are not assessed.</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>How to use</h3>
                <ol className={styles.steps}>
                  <li><strong>Pick a dimension</strong> at the top left: Risk score, Future hazard, Historical hazard, Exposure or Vulnerability.</li>
                  <li><strong>Choose an indicator</strong> in the left panel; for future hazard and risk, pick the period (and, for future hazard, the climate model) in the bar below the map.</li>
                  <li><strong>Click a state</strong> for its districts by class and their main drivers. <strong>Zoom in</strong> and click a district for its own breakdown.</li>
                  <li><strong>In the district panel</strong>, the risk class and national rank stay at the top; click a part of risk to see its indicators and how the district compares nationally.</li>
                </ol>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>Built with</h3>
                <p className={styles.builtWith}>React · MapLibre GL JS · PMTiles · Vite · Zustand · Recharts · INDRA-CMIP6 · Rama Rao et al. (2020) · FAO TCP/IND/4005</p>
              </section>

            </div>
          </div>
        </div>
      )}
    </>
  )
}
