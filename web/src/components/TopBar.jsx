import React from 'react'
import { useCRVAStore } from '../store/useCRVAStore.js'
import styles from './TopBar.module.css'

export default function TopBar() {
  const { theme, toggleTheme } = useCRVAStore()

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <div className={styles.logo}>◉</div>
        <div>
          <div className={styles.title}>India CRVA Tool</div>
          <div className={styles.sub}>Climate Risk & Vulnerability Assessment · District Level</div>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.badge}>IPCC WG2 Framework</div>
        <div className={styles.badge}>INDRA-CMIP6</div>
        <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '◑'}
        </button>
      </div>
    </header>
  )
}
