/**
 * Rolling 30-day store for sector intraday curves.
 *
 * One JSON file per session under `<dsh home>/ashare-radar/sectors`. Writes are
 * atomic (tmp + rename) and read-modify-write, so a crashed write cannot leave a
 * half file behind. Older sessions are pruned on every write.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const KEEP_DAYS = 30
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function root() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'ashare-radar', 'sectors')
}

function fileOf(date) {
  return path.join(root(), date + '.json')
}

/** Stored sessions, newest first, capped at 30. */
export function listDates() {
  try {
    return fs
      .readdirSync(root())
      .filter(name => DATE_PATTERN.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))
      .map(name => name.slice(0, 10))
      .sort()
      .reverse()
      .slice(0, KEEP_DAYS)
  } catch {
    return []
  }
}

export function readDay(date) {
  if (!DATE_PATTERN.test(date)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(fileOf(date), 'utf8'))
    return parsed !== null && typeof parsed === 'object' && parsed.series !== null && typeof parsed.series === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Merge one session's curves into the store.
 * @param {string} date `YYYY-MM-DD`.
 * @param {Array<{code: string, name: string, points: Array<[number, number]>}>} entries
 * @returns the stored day, or null when nothing was written.
 */
export function mergeDay(date, entries) {
  if (!DATE_PATTERN.test(date) || !Array.isArray(entries) || entries.length === 0) return null
  const current = readDay(date) || { date, updatedAt: 0, series: {} }
  let wrote = false
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.code !== 'string' || !/^BK\d{4}$/.test(entry.code)) continue
    if (!Array.isArray(entry.points) || entry.points.length === 0) continue
    // A finished session already has all 241 minutes; rewriting it every minute
    // would churn the disk for nothing.
    const existing = current.series[entry.code]
    if (existing !== undefined && Array.isArray(existing.points) && existing.points.length >= 241 && entry.points.length <= existing.points.length) continue
    current.series[entry.code] = { code: entry.code, name: entry.name || entry.code, points: entry.points }
    wrote = true
  }
  if (!wrote) return current
  // Keep a day's file bounded: the panel rotates which boards it views.
  const storedCodes = Object.keys(current.series)
  if (storedCodes.length > 60) {
    for (const code of storedCodes.slice(0, storedCodes.length - 60)) delete current.series[code]
  }
  current.updatedAt = Date.now()
  try {
    fs.mkdirSync(root(), { recursive: true })
    const temporary = fileOf(date) + '.tmp'
    fs.writeFileSync(temporary, JSON.stringify(current))
    fs.renameSync(temporary, fileOf(date))
  } catch {
    return null
  }
  prune()
  return current
}

function prune() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)
  try {
    for (const name of fs.readdirSync(root())) {
      if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
      const date = name.slice(0, 10)
      if (!DATE_PATTERN.test(date) || date >= cutoff) continue
      try {
        fs.unlinkSync(path.join(root(), name))
      } catch {
        /* another process may have removed it */
      }
    }
  } catch {
    /* a missing directory simply means nothing to prune */
  }
}

export { KEEP_DAYS, root as storeRoot }
