import React from 'react'
import styles from './Panel.module.css'

// An indicator's weight in its part of risk: a short bar filled to that share, and the number.
export function WeightMeter({ weight, of }) {
  if (weight == null) return null
  return (
    <span className={styles.weight} title={`Weight in the ${of}: ${weight}%`} aria-label={`Weight ${weight}%`}>
      <span className={styles.weightTrack} aria-hidden="true">
        <span className={styles.weightFill} style={{ width: `${Math.max(weight, 2)}%` }} />
      </span>
      <span className={styles.weightNum}>{weight}%</span>
    </span>
  )
}

// Total weight of a group of indicators, for its header (nothing if the group has no weights).
export function GroupWeight({ indicators, weightOf = i => i.weight }) {
  const total = indicators.reduce((s, i) => s + (weightOf(i) ?? 0), 0)
  if (!total) return null
  return <span className={styles.groupWeight}>{total}%</span>
}
