import React, { useEffect } from 'react'
import TopBar from './components/TopBar.jsx'
import DimensionTabs from './components/DimensionTabs.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import Map from './components/Map.jsx'
import DetailDrawer from './components/DetailDrawer.jsx'
import Timeline from './components/Timeline.jsx'
import { useCRVAStore } from './store/useCRVAStore.js'
import styles from './styles/App.module.css'

export default function App() {
  const theme = useCRVAStore(s => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className={styles.shell}>
      <TopBar />
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <DimensionTabs />
          <ControlPanel />
        </aside>
        <Map />
        <DetailDrawer />
      </div>
      <Timeline />
    </div>
  )
}
