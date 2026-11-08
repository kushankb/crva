import React from 'react'
import { useCRVAStore } from '../store/useCRVAStore.js'
import Search from './Search.jsx'
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
        <Search />
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
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>Which districts?</h3>
                <p>The map shows today's 780 districts (boundaries with LGD codes, matching the official district list of about the end of 2024).</p>
                <ul className={styles.steps}>
                  <li><strong>Vulnerability, exposure and historical hazard</strong> come from data published for the Census 2011 districts (about 610–620 rural districts), the same basis as the ICAR-CRIDA Atlas. The indices are computed on those districts, then carried to today's districts: each takes the value of the 2011 district covering most of its area.</li>
                  <li><strong>Districts created after 2011</strong> therefore share their parent district's values for these three parts (245 districts, from 107 districts that were later split). All indicators are shares or densities, so the parent's value is a fair stand-in, but differences within the old district cannot be seen.</li>
                  <li><strong>Future hazard</strong> is computed directly for today's districts from the climate model data, so it can differ between districts that share a parent.</li>
                  <li><strong>Not assessed:</strong> urban districts (as in the Atlas), the islands, Ladakh, and a few districts missing from the source data. 745 districts have a risk score.</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionHead}>How to use</h3>
                <ol className={styles.steps}>
                  <li><strong>Pick a dimension</strong> at the top left: Risk score, Future hazard, Historical hazard, Exposure or Vulnerability.</li>
                  <li><strong>Choose an indicator</strong> in the left panel; for future hazard and risk, pick the period (and, for future hazard, the climate model) in the bar below the map.</li>
                  <li><strong>Click a state</strong> for its districts: their classes, ranks and what raises or lowers their risk. <strong>Zoom in</strong> and click a district for its own breakdown.</li>
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
