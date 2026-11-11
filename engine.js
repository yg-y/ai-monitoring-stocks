/**
 * A-share radar engine.
 *
 * One dependency-free module that turns public quote feeds into the numbers a
 * trading desk actually watches: index tape, market breadth, limit-up pools,
 * sector rotation, and per-stock strategy scores.
 *
 * Data: Eastmoney public quote endpoints (quotes, boards, limit-up pools) and
 * Xueqiu/Xuangubao market indicator series (breadth). All read-only, no keys.
 *
 * This is a computation engine, not investment advice.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EAST = 'https://push2.eastmoney.com'
// The quote host drops connections during busy moments; its delayed sibling keeps
// answering, which is far better than an empty panel (prices are delayed, the
// board membership and shapes are not).
const EAST_DELAY = 'https://push2delay.eastmoney.com'
const EAST_HIS = 'https://push2his.eastmoney.com'
const XGB = 'https://flash-api.xuangubao.cn'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** All A-share boards: Shenzhen main, ChiNext, Shanghai main, STAR. */
const STOCK_FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
const STOCK_FIELDS = 'f2,f3,f4,f5,f6,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f22,f23,f62,f100'
const INDEX_FIELDS = 'f1,f2,f3,f4,f12,f13,f14'
const BOARD_FIELDS = 'f2,f3,f6,f12,f14,f62,f104,f105,f128,f136'

const INDICES = [
  { secid: '1.000001', code: '000001', name: '上证指数' },
  { secid: '0.399001', code: '399001', name: '深证成指' },
  { secid: '0.399006', code: '399006', name: '创业板指' },
  { secid: '1.000688', code: '000688', name: '科创50' },
  { secid: '0.899050', code: '899050', name: '北证50' },
]

/** Default watchlist shown on a fresh install. */
export const DEFAULT_WATCH = ['600519', '300750', '000001', '601318', '002594', '000858']

/* ------------------------------------------------------------------ *
 * Strategy catalogue
 * ------------------------------------------------------------------ */

export const STRATEGIES = [
  {
    id: 'trend',
    name: '均线趋势',
    family: '趋势跟随',
    desc: 'MA5 > MA10 > MA20 多头排列且站上均线，配合 MA20 上翘确认趋势。',
  },
  {
    id: 'breakout',
    name: '放量突破',
    family: '量价形态',
    desc: '量比 ≥ 1.5 的放量阳线突破 20 日新高，属欧奈尔式突破买入。',
  },
  {
    id: 'momentum',
    name: '动量强势',
    family: '动量因子',
    desc: '近 20 个交易日涨幅 ≥ 15%，强者恒强的 RPS 动量思路。',
  },
  {
    id: 'capital',
    name: '主力吸筹',
    family: '资金流',
    desc: '主力净流入占成交额 ≥ 5%，大单持续买入的跟随策略。',
  },
  {
    id: 'oversold',
    name: '超跌反弹',
    family: '均值回归',
    desc: '20 日乖离率 ≤ -8% 且 RSI6 ≤ 32，超卖后的修复博弈。',
  },
  {
    id: 'limit',
    name: '涨停接力',
    family: '情绪打板',
    desc: '涨停或接近涨停的强势股，用于情绪周期与连板梯队的跟踪。',
  },
  {
    id: 'value',
    name: '低估值',
    family: '价值',
    desc: 'PE ≤ 18、PB ≤ 2、市值 ≥ 100 亿，低估值叠加趋势确认。',
  },
  {
    id: 'rotation',
    name: '板块风口',
    family: '板块轮动',
    desc: '个股所属行业进入当日涨幅榜前列，顺板块 beta 选股。',
  },
]

const TAG_TEXT = Object.fromEntries(STRATEGIES.map(s => [s.id, s.name]))

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '' && value !== '-') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 元 → 亿元, with a readable suffix. */
export function yi(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(digits)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(digits)}万`
  return value.toFixed(digits)
}

async function getText(url, timeoutMs = 8000, referer = 'https://quote.eastmoney.com/') {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: referer, Accept: '*/*' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error('接口 HTTP ' + response.status)
  return response.text()
}

// After the primary host fails once, stay on the delayed sibling for a minute
// instead of paying the failure latency on every single call.
let delayedUntil = 0

/** Try the primary quote host, then its delayed sibling. */
async function quoteJson(path, timeoutMs = 8000) {
  if (Date.now() < delayedUntil) {
    try {
      return await getJson(EAST_DELAY + path, timeoutMs)
    } catch {
      delayedUntil = 0
    }
  }
  try {
    return await getJson(EAST + path, timeoutMs)
  } catch (primaryError) {
    // Trip the breaker as soon as the primary fails, so calls that start while
    // this one is falling back do not repeat the doomed attempt.
    delayedUntil = Date.now() + 60_000
    try {
      return await getJson(EAST_DELAY + path, timeoutMs)
    } catch {
      delayedUntil = 0
      throw primaryError
    }
  }
}

/**
 * One retry covers the quote host's habit of dropping a connection at the open
 * (`fetch failed` / empty reply) without hammering it during a real outage.
 */
async function getJson(url, timeoutMs = 8000) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/', Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`行情接口 HTTP ${response.status}`)
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {
        throw new Error('行情接口返回了非 JSON 内容')
      }
    } catch (error) {
      lastError = error
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('行情接口请求失败')
}

/* ------------------------------------------------------------------ *
 * Cache: TTL for a fresh read, last-good value for a failing feed
 * ------------------------------------------------------------------ */

const cache = new Map()
const lastGood = new Map()

function memo(key, ttl, produce) {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit) {
    if (hit.pending) return hit.pending
    if (hit.expires > now) return Promise.resolve(hit.value)
  }
  const pending = (async () => {
    try {
      const value = await produce()
      cache.set(key, { value, expires: Date.now() + ttl, at: Date.now() })
      lastGood.set(key, { value, at: Date.now() })
      return value
    } catch (error) {
      const stale = lastGood.get(key)
      if (stale !== undefined) {
        cache.set(key, { value: stale.value, expires: Date.now() + 4000 })
        return stale.value
      }
      cache.delete(key)
      throw error
    }
  })()
  cache.set(key, { pending, expires: now + ttl })
  return pending
}

/* ------------------------------------------------------------------ *
 * Trading clock (Asia/Shanghai)
 * ------------------------------------------------------------------ */

const CLOCK_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
})

export function clockNow(now = new Date()) {
  const parts = Object.fromEntries(CLOCK_FORMAT.formatToParts(now).map(part => [part.type, part.value]))
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minuteOfDay: hour * 60 + minute,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

export function marketPhase(now = new Date()) {
  const clock = clockNow(now)
  const at = clock.minuteOfDay
  const weekend = clock.weekday === 'Sat' || clock.weekday === 'Sun'
  let phase = 'closed'
  let label = '已收盘'
  if (weekend) {
    phase = 'weekend'
    label = '周末休市'
  } else if (at < 555) {
    phase = 'pre'
    label = '未开盘'
  } else if (at < 570) {
    phase = 'auction'
    label = '集合竞价'
  } else if (at < 690) {
    phase = 'open'
    label = '交易中'
  } else if (at < 780) {
    phase = 'lunch'
    label = '午间休市'
  } else if (at < 900) {
    phase = 'open'
    label = '交易中'
  }
  return {
    phase,
    label,
    trading: phase === 'open' || phase === 'auction',
    time: clock.time,
    date: clock.date,
    day: clock.day,
    weekday: clock.weekday,
  }
}

/* ------------------------------------------------------------------ *
 * Quote feeds
 * ------------------------------------------------------------------ */

function clist(params) {
  const query = new URLSearchParams({ pn: '1', pz: '100', po: '1', np: '1', fltt: '2', invt: '2', ...params })
  return quoteJson(`/api/qt/clist/get?${query}`).then(body => {
    const data = body && body.data
    const rows = data && Array.isArray(data.diff) ? data.diff : []
    return { total: (data && data.total) || rows.length, rows }
  })
}

function ulist(secids) {
  const query = new URLSearchParams({ fltt: '2', invt: '2', fields: STOCK_FIELDS, secids: secids.join(',') })
  return quoteJson(`/api/qt/ulist.np/get?${query}`).then(body => {
    const data = body && body.data
    return data && Array.isArray(data.diff) ? data.diff : []
  })
}

export function toQuote(row) {
  const code = row.f12 === undefined || row.f12 === null ? '' : String(row.f12)
  const market = num(row.f13)
  return {
    code,
    secid: market === null ? secidOf(code) : `${market}.${code}`,
    name: typeof row.f14 === 'string' ? row.f14 : code,
    price: num(row.f2),
    pct: num(row.f3),
    chg: num(row.f4),
    amount: num(row.f6),
    volume: num(row.f5),
    turnover: num(row.f8),
    pe: num(row.f9),
    volRatio: num(row.f10),
    high: num(row.f15),
    low: num(row.f16),
    open: num(row.f17),
    prevClose: num(row.f18),
    mktCap: num(row.f20),
    floatCap: num(row.f21),
    speed: num(row.f22),
    pb: num(row.f23),
    mainNet: num(row.f62),
    industry: typeof row.f100 === 'string' ? row.f100 : null,
  }
}

export function normalizeCode(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw)
    .trim()
    .toUpperCase()
    .replace(/^(SH|SZ|BJ)/, '')
  const match = text.match(/(\d{6})/)
  return match === null ? null : match[1]
}

export function secidOf(code) {
  if (/^[569]/.test(code)) return `1.${code}`
  return `0.${code}`
}

/** Quote for an exact secid such as `1.000001` (index) or `1.600519`. */
export async function quoteBySecid(secid) {
  return memo(`quote:${secid}`, 2500, async () => {
    const rows = await ulist([secid])
    return rows.length > 0 ? toQuote(rows[0]) : null
  })
}

export async function quotes(codes) {
  const list = [...new Set(codes.map(normalizeCode).filter(Boolean))].slice(0, 40)
  if (list.length === 0) return []
  return memo(`quotes:${list.join(',')}`, 2500, async () => {
    const rows = await ulist(list.map(secidOf))
    return rows.map(toQuote)
  })
}

export async function fetchIndices() {
  return memo('indices', 2500, async () => {
    const rows = await ulist(INDICES.map(index => index.secid))
    const byCode = new Map(rows.map(row => [String(row.f12), row]))
    return INDICES.map(index => {
      const row = byCode.get(index.code)
      const quote = row === undefined ? null : toQuote(row)
      return {
        code: index.code,
        name: index.name,
        secid: index.secid,
        kind: 'index',
        price: quote === null ? null : quote.price,
        pct: quote === null ? null : quote.pct,
        chg: quote === null ? null : quote.chg,
        amount: quote === null ? null : quote.amount,
      }
    })
  })
}

export async function fetchBoards(kind = 'industry') {
  const fs = kind === 'concept' ? 'm:90+t:3' : 'm:90+t:2'
  return memo(`boards:${kind}`, 20_000, async () => {
    const { rows } = await clist({ pz: '100', po: '1', fid: 'f3', fs, fields: BOARD_FIELDS })
    return rows.map(row => {
      const up = num(row.f104)
      const down = num(row.f105)
      const total = (up || 0) + (down || 0)
      return {
        code: String(row.f12),
        name: typeof row.f14 === 'string' ? row.f14 : '',
        pct: num(row.f3),
        amount: num(row.f6),
        mainNet: num(row.f62),
        up,
        down,
        ratio: total > 0 ? (up || 0) / total : null,
        leader: typeof row.f128 === 'string' ? row.f128 : null,
        leaderPct: num(row.f136),
      }
    })
  })
}

/**
 * Constituent stocks of one board (`BK0459`).
 * @param {string} code Board code.
 * @param {number} limit Row count.
 * @param {string} sort Eastmoney sort field: f3 涨幅, f62 主力, f10 量比, f8 换手.
 */
export async function fetchBoardStocks(code, limit = 60, sort = 'f3') {
  return memo(`board:${code}:${sort}:${limit}`, 15_000, async () => {
    const { rows, total } = await clist({ pz: String(limit), po: '1', fid: sort, fs: `b:${code}`, fields: STOCK_FIELDS })
    return { total, stocks: rows.map(toQuote).filter(quote => quote.code !== '') }
  })
}

/**
 * Money flow: today's cumulative split (main / small / medium / large / super)
 * plus the last sessions of daily net flow.
 * @param {string} secid Eastmoney security id.
 */
export async function fetchMoneyFlow(secid, days = 5) {
  return memo(`flow:${secid}:${days}`, 15_000, async () => {
    const intradayQuery = new URLSearchParams({
      secid,
      fields1: 'f1,f2,f3,f7',
      fields2: 'f51,f52,f53,f54,f55,f56',
      klt: '1',
      lmt: '0',
    })
    const dailyQuery = new URLSearchParams({
      secid,
      fields1: 'f1,f2,f3,f7',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
      klt: '101',
      lmt: '0',
    })
    const [intradayBody, dailyBody] = await Promise.all([
      getJson(`${EAST}/api/qt/stock/fflow/kline/get?${intradayQuery}`, 7000).catch(() => null),
      getJson(`${EAST_HIS}/api/qt/stock/fflow/daykline/get?${dailyQuery}`, 7000).catch(() => null),
    ])
    const split = part => ({
      main: num(part[1]),
      small: num(part[2]),
      medium: num(part[3]),
      large: num(part[4]),
      super: num(part[5]),
    })
    const intradayRows = intradayBody && intradayBody.data && Array.isArray(intradayBody.data.klines) ? intradayBody.data.klines : []
    const dailyRows = dailyBody && dailyBody.data && Array.isArray(dailyBody.data.klines) ? dailyBody.data.klines : []
    const series = intradayRows.map(line => {
      const part = line.split(',')
      return Object.assign({ t: String(part[0] || '').slice(11, 16) }, split(part))
    })
    const history = dailyRows.slice(-days).map(line => {
      const part = line.split(',')
      return Object.assign({ d: String(part[0] || '') }, split(part), {
        mainPct: num(part[6]),
        pct: num(part[12]),
        close: num(part[11]),
      })
    })
    const latest = series.length > 0 ? series[series.length - 1] : history.length > 0 ? history[history.length - 1] : null
    return { latest, series, history }
  })
}

/**
 * Compact intraday shape for one symbol, for list sparklines.
 *
 * Down-sampled to ~48 points, plus two numbers that answer "is it moving right
 * now": `pace` (signed 5-minute change) and `run` (signed largest 5-minute
 * move of the session, i.e. the sharpest leg).
 * @param {string} secid Eastmoney security id.
 */
export async function fetchSpark(secid) {
  return memo(`spark:${secid}`, 30_000, async () => {
    const trend = await fetchTrend(secid, 1)
    const points = trend.points
    const prevClose = trend.prevClose
    if (points.length < 2 || prevClose === null || prevClose === 0) return null
    const tail = points.slice(-6)
    const pace = ((tail[tail.length - 1].price - tail[0].price) / prevClose) * 100
    let run = 0
    let runAt = 0
    for (let index = 5; index < points.length; index += 1) {
      const delta = ((points[index].price - points[index - 5].price) / prevClose) * 100
      if (Math.abs(delta) > Math.abs(run)) {
        run = delta
        runAt = index
      }
    }
    const runAge = points.length - 1 - runAt
    const stride = Math.max(1, Math.ceil(points.length / 48))
    const sampled = []
    for (let index = 0; index < points.length; index += stride) sampled.push(round(points[index].price, 2))
    const last = round(points[points.length - 1].price, 2)
    if (sampled[sampled.length - 1] !== last) sampled.push(last)
    return { prevClose: round(prevClose, 2), points: sampled, pace: round(pace, 2), run: round(run, 2), runAge }
  })
}

/**
 * Boards a symbol belongs to (industry plus concepts/styles), for the
 * "所属板块" row on the detail page.
 * @param {string} secid Exact secid.
 */
/** Boards that are index/style/channel buckets rather than themes. */
const STYLE_BOARD = /(指数|风格|重仓|增仓|融资融券|股通|MSCI|富时|标准普尔|HS300|上证|深证|中证|央视|百元|低价|高价|权重|大盘|中盘|小盘|趋势|热股|龙头)/i

export async function fetchStockBoards(secid) {
  return memo(`boards-of:${secid}`, 60_000, async () => {
    const query = new URLSearchParams({
      spt: '3',
      fltt: '2',
      invt: '2',
      fields: 'f12,f13,f14,f3',
      secid,
      pn: '1',
      pz: '40',
      po: '1',
      np: '1',
      fid: 'f3',
    })
    const body = await getJson(`${EAST}/api/qt/slist/get?${query}`, 7000)
    const data = body && body.data
    const rows = data && Array.isArray(data.diff) ? data.diff : []
    return rows
      .map(row => ({
        code: String(row.f12 || ''),
        name: String(row.f14 || ''),
        pct: num(row.f3),
        thematic: !STYLE_BOARD.test(String(row.f14 || '')),
      }))
      .filter(board => /^BK\d{4}$/.test(board.code) && board.name !== '')
  })
}

/** Per-symbol news, from the Eastmoney search feed (JSONP, stripped here). */
export async function fetchNews(keyword, limit = 8) {
  return memo(`news:${keyword}:${limit}`, 300_000, async () => {
    const param = {
      uid: '',
      keyword,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: {
        cmsArticleWebOld: { searchScope: 'default', sort: 'default', pageIndex: 1, pageSize: limit, preTag: '', postTag: '' },
      },
    }
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=${encodeURIComponent(JSON.stringify(param))}`
    const text = await getText(url, 8000, 'https://so.eastmoney.com/')
    const start = text.indexOf('(')
    const end = text.lastIndexOf(')')
    if (start === -1 || end <= start) throw new Error('新闻接口返回格式异常')
    const payload = JSON.parse(text.slice(start + 1, end))
    const items = payload && payload.result && Array.isArray(payload.result.cmsArticleWebOld) ? payload.result.cmsArticleWebOld : []
    return items.slice(0, limit).map(item => ({
      date: String(item.date || '').slice(0, 16),
      title: String(item.title || '').replace(/<[^>]+>/g, ''),
      url: String(item.url || ''),
      source: String(item.mediaName || ''),
      summary: String(item.content || '').replace(/<[^>]+>/g, '').slice(0, 120),
    }))
  })
}

/** Latest announcements (公告) for a symbol. */
export async function fetchAnnouncements(code, limit = 6) {
  return memo(`ann:${code}:${limit}`, 600_000, async () => {
    const query = new URLSearchParams({
      sr: '-1',
      page_size: String(limit),
      page_index: '1',
      ann_type: 'A',
      client_source: 'web',
      stock_list: code,
    })
    const body = await getJson(`https://np-anotice-stock.eastmoney.com/api/security/ann?${query}`, 7000)
    const data = body && body.data
    const rows = data && Array.isArray(data.list) ? data.list : []
    return rows.slice(0, limit).map(row => ({
      date: String(row.notice_date || row.display_time || '').slice(0, 10),
      title: String(row.title_ch || row.title || ''),
      url: `https://data.eastmoney.com/notices/detail/${code}/${row.art_code}.html`,
    }))
  })
}


/**
 * Classify today's volume against the stock's own recent norm.
 *
 * Raw "today / 5-day average" is meaningless at 10:00 — the session is a third
 * done. Project the day first, then compare; early in the session fall back to
 * the exchange's own per-minute ratio (量比) instead.
 */
/** Daily price-limit ratio for a code/name pair. */
export function limitRatioOf(code, name) {
  let ratio = 0.1
  if (/^[48]/.test(code)) ratio = 0.3
  else if (/^(30|68)/.test(code)) ratio = 0.2
  if (typeof name === 'string' && name.indexOf('ST') !== -1) ratio = 0.05
  return ratio
}

export function volumeStateOf(input) {
  const { quote, stats, clock, limits } = input
  // No quote yet (feed hiccup, suspended symbol): report nothing rather than
  // pretending the stock did not trade.
  if (quote === null || quote === undefined) return null
  const minute = clock === undefined || clock === null ? 720 : clock.minuteOfDay
  const elapsed = minute < 570 ? 0 : minute <= 690 ? minute - 570 : minute < 781 ? 120 : minute <= 900 ? 120 + (minute - 780) : 240
  const pct = quote !== null && quote !== undefined && Number.isFinite(quote.pct) ? quote.pct : null
  const volume = quote !== null && quote !== undefined && Number.isFinite(quote.volume) ? quote.volume : null
  const ratio = stats !== null && stats !== undefined && Number.isFinite(stats.avgVolume5) && stats.avgVolume5 > 0 ? stats.avgVolume5 : null
  const limitRatio = limits !== null && limits !== undefined && Number.isFinite(limits.pct) ? limits.pct : 0.1

  const state = (value, label, numeric, note) => ({ state: value, label, ratio: numeric, note: note || null })
  if (volume === null || volume === 0) return state('halt', 'halt', null, null)
  if (pct !== null && pct >= limitRatio * 100 - 0.1) return state('limit', 'limit', ratio === null ? null : Math.round((volume / Math.max(elapsed, 1)) * 240 / ratio * 100) / 100, null)
  if (elapsed < 20) {
    const fallback = quote !== null && quote !== undefined && Number.isFinite(quote.volRatio) ? quote.volRatio : null
    return state('auction', 'auction', fallback, null)
  }

  const projected = (volume / elapsed) * 240
  const numeric = ratio === null ? null : Math.round((projected / ratio) * 100) / 100
  const value = numeric === null ? 1 : numeric
  const base = value < 0.7 ? 'shrink' : value < 1.5 ? 'normal' : value < 2.5 ? 'mild' : value < 5 ? 'heavy' : 'extreme'

  // Volume has no direction; the dangerous shapes are volume without progress,
  // and heavy volume into a falling price.
  if ((base === 'heavy' || base === 'extreme') && pct !== null && Math.abs(pct) < 1) return state('stagnant', 'stagnant', numeric, base)
  if ((base === 'heavy' || base === 'extreme') && pct !== null && pct <= -2) return state('dump', 'dump', numeric, base)
  if (base === 'shrink' && pct !== null && pct >= 2) return state('shrinkRise', 'shrinkRise', numeric, base)
  return state(base, base, numeric, null)
}

/**
 * Intraday percentage curve for one board, per session.
 *
 * The feed gives five sessions of minute prices in one call; each day is
 * re-based on the previous day's last print so the curve is a real 涨跌幅.
 * @param {string} secid Board secid such as `90.BK0459`.
 * @param {number} days Sessions to request (1-5).
 */
export async function fetchBoardTrends(secid, days = 5) {
  return memo(`board-trend:${secid}:${days}`, 180_000, async () => {
    const query = new URLSearchParams({
      secid,
      fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
      ndays: String(Math.min(5, Math.max(1, days))),
      iscr: '0',
    })
    const body = await getJson(`${EAST_HIS}/api/qt/stock/trends2/get?${query}`, 8000)
    const data = body && body.data
    const rows = data && Array.isArray(data.trends) ? data.trends : []
    const byDay = new Map()
    for (const line of rows) {
      const part = line.split(',')
      const stamp = String(part[0] || '')
      const date = stamp.slice(0, 10)
      const time = stamp.slice(11, 16)
      const price = num(part[2])
      if (date === '' || time === '' || price === null) continue
      if (!byDay.has(date)) byDay.set(date, [])
      byDay.get(date).push({ time, price })
    }
    const dates = [...byDay.keys()].sort()
    const out = []
    for (let index = 0; index < dates.length; index += 1) {
      const date = dates[index]
      const points = byDay.get(date)
      const previous = index > 0 ? byDay.get(dates[index - 1]) : null
      const base = previous !== null && previous.length > 0 ? previous[previous.length - 1].price : points[0].price
      if (base === null || base === 0) continue
      out.push({
        date,
        name: data && typeof data.name === 'string' ? data.name : '',
        points: points.map(point => {
          const [hour, minute] = point.time.split(':')
          return [Number(hour) * 60 + Number(minute), round((point.price / base - 1) * 100, 2)]
        }),
      })
    }
    return out
  })
}

/** Limit-up / limit-down / broken-board pools — the emotion tape. */
export async function fetchPools(date) {
  const day = date || clockNow().date
  return memo(`pools:${day}`, 20_000, async () => {
    const load = async (name, sort) => {
      const query = new URLSearchParams({
        ut: '7eea3edcaed734bea9cbfc24409ed989',
        dpt: 'wz.ztzt',
        Pageindex: '0',
        pagesize: '200',
        sort,
        date: day,
      })
      try {
        const body = await getJson(`https://push2ex.eastmoney.com/${name}?${query}`, 7000)
        const data = body && body.data
        return data && Array.isArray(data.pool) ? { count: num(data.tc) || data.pool.length, pool: data.pool } : { count: 0, pool: [] }
      } catch {
        return { count: 0, pool: [] }
      }
    }
    const [up, down, broken] = await Promise.all([
      load('getTopicZTPool', 'fbt:asc'),
      load('getTopicDTPool', 'fund:asc'),
      load('getTopicZBPool', 'fbt:asc'),
    ])
    const ladder = new Map()
    for (const item of up.pool) {
      const board = num(item.lbc) || 1
      ladder.set(board, (ladder.get(board) || 0) + 1)
    }
    const top = up.pool
      .slice()
      .sort((a, b) => (num(b.lbc) || 1) - (num(a.lbc) || 1) || (num(b.fund) || 0) - (num(a.fund) || 0))
      .slice(0, 12)
      .map(item => ({
        code: String(item.c),
        name: String(item.n || ''),
        board: num(item.lbc) || 1,
        sealAmount: num(item.fund),
        turnover: num(item.hs),
        industry: typeof item.hybk === 'string' ? item.hybk : null,
        broken: num(item.zbc) || 0,
      }))
    return {
      limitUp: up.count,
      limitDown: down.count,
      broken: broken.count,
      brokenRate: up.count + broken.count > 0 ? broken.count / (up.count + broken.count) : 0,
      ladder: [...ladder.entries()].sort((a, b) => b[0] - a[0]).map(([board, count]) => ({ board, count })),
      top,
      topDown: down.pool.slice(0, 5).map(item => ({ code: String(item.c), name: String(item.n || ''), pct: num(item.zdp) })),
    }
  })
}

/** Breadth series (rise/fall/limit counts) from the Xueqiu indicator feed. */
export async function fetchBreadth() {
  return memo('breadth', 30_000, async () => {
    const url = `${XGB}/api/market_indicator/line?fields=rise_count,fall_count,limit_up_count,limit_down_count`
    const body = await getJson(url, 7000)
    const series = body && Array.isArray(body.data) ? body.data : []
    const usable = series
      .map(point => ({
        at: num(point.timestamp) === null ? null : num(point.timestamp) * 1000,
        rise: num(point.rise_count),
        fall: num(point.fall_count),
        limitUp: num(point.limit_up_count),
        limitDown: num(point.limit_down_count),
      }))
      .filter(point => point.rise !== null && point.fall !== null)
    const latest = usable.length > 0 ? usable[usable.length - 1] : null
    return { latest, history: usable.slice(-60) }
  })
}

/** Chart periods, mapped to Eastmoney `klt` values. */
/** Where the last successful K-line response per symbol/period is kept. */
const KLINE_CACHE_DIR = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'ashare-radar', 'klines')
let klineFallbackAt = 0

/** Milliseconds since a K-line response last came from the disk cache. */
export function klineFallbackAge() {
  return klineFallbackAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - klineFallbackAt
}

function klineCachePath(secid, klt) {
  return path.join(KLINE_CACHE_DIR, secid.replace(/[^0-9A-Za-z]/g, '-') + '-' + klt + '.json')
}

function readKlineCache(secid, klt, limit) {
  try {
    const parsed = JSON.parse(fs.readFileSync(klineCachePath(secid, klt), 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.bars) || parsed.bars.length === 0) return null
    return parsed.bars.slice(-limit)
  } catch {
    return null
  }
}

function writeKlineCache(secid, klt, bars) {
  if (!Array.isArray(bars) || bars.length < 20) return
  try {
    fs.mkdirSync(KLINE_CACHE_DIR, { recursive: true })
    const target = klineCachePath(secid, klt)
    const temporary = target + '.tmp'
    fs.writeFileSync(temporary, JSON.stringify({ updatedAt: Date.now(), bars }))
    fs.renameSync(temporary, target)
  } catch {
    /* the cache is best-effort */
  }
}

/**
 * Second provider for daily/weekly/monthly bars (Tencent's public kline feed).
 * Eastmoney's history host is the flakiest endpoint we touch, and nothing else
 * on their side serves history — this keeps charts alive during those windows.
 */
async function fetchTencentBars(secid, period, limit, adjust) {
  const [market, code] = String(secid).split('.')
  if (!market || !code) return []
  const prefix = market === '1' ? 'sh' : /^[48]/.test(code) ? 'bj' : 'sz'
  const symbol = prefix + code
  const minute = period.startsWith('m')
  let rows = []
  if (minute) {
    // Minute bars live on a different path and need no adjustment parameter.
    const query = new URLSearchParams({ param: `${symbol},${period},,${limit}` })
    const body = await getJson(`https://ifzq.gtimg.cn/appstock/app/kline/mkline?${query}`, 8000)
    const node = body !== null && body !== undefined && body.data !== undefined ? body.data[symbol] : undefined
    rows = node === undefined || node === null ? [] : node[period] || []
    const bars = []
    let previous = null
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue
      const stamp = String(row[0])
      const open = Number(row[1])
      const close = Number(row[2])
      const high = Number(row[3])
      const low = Number(row[4])
      const volume = Number(row[5])
      if (!Number.isFinite(close) || !Number.isFinite(open)) continue
      bars.push({
        date: stamp.length >= 12 ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}` : stamp,
        open,
        close,
        high,
        low,
        volume: Number.isFinite(volume) ? volume : null,
        amount: null,
        pct: previous === null || previous === 0 ? null : round((close / previous - 1) * 100, 2),
        turnover: null,
      })
      previous = close
    }
    return bars
  }
  if (period !== 'day' && period !== 'week' && period !== 'month') return []
  const scale = period
  const fq = adjust === 0 ? '' : adjust === 2 ? 'hfq' : 'qfq'
  const query = new URLSearchParams({ param: `${symbol},${scale},,,${limit},${fq}` })
  const body = await getJson(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${query}`, 8000)
  const node = body !== null && body !== undefined && body.data !== undefined ? body.data[symbol] : undefined
  if (node === undefined || node === null) return []
  rows = node[fq + scale] || node[scale] || []
  const bars = []
  let previousClose = null
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue
    const open = Number(row[1])
    const close = Number(row[2])
    const high = Number(row[3])
    const low = Number(row[4])
    const volume = Number(row[5])
    if (!Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(high) || !Number.isFinite(low)) continue
    bars.push({
      date: String(row[0]),
      open,
      close,
      high,
      low,
      volume: Number.isFinite(volume) ? volume : null,
      amount: null,
      pct: previousClose === null || previousClose === 0 ? null : round((close / previousClose - 1) * 100, 2),
      turnover: null,
    })
    previousClose = close
  }
  return bars
}

export const PERIODS = {
  day: { klt: '101', label: '日K', ttl: 240_000 },
  week: { klt: '102', label: '周K', ttl: 600_000 },
  month: { klt: '103', label: '月K', ttl: 600_000 },
  m60: { klt: '60', label: '60分', ttl: 60_000 },
  m30: { klt: '30', label: '30分', ttl: 60_000 },
  m15: { klt: '15', label: '15分', ttl: 60_000 },
  m5: { klt: '5', label: '5分', ttl: 60_000 },
  m1: { klt: '1', label: '1分', ttl: 30_000 },
}

export async function fetchKline(secid, limit = 70, period = 'day', adjust = 1, fresh = false) {
  const spec = PERIODS[period] || PERIODS.day
  const key = `kline:${secid}:${limit}:${spec.klt}:${adjust}`
  // A fresh read skips the previous answer, but not more often than every 30s:
  // the panel polls every 5s and the forming bar is patched client-side anyway.
  if (fresh) {
    const stored = cache.get(key)
    const age = stored === undefined || stored.at === undefined ? Number.POSITIVE_INFINITY : Date.now() - stored.at
    if (age > 30_000) cache.delete(key)
  }
  return memo(key, spec.ttl, async () => {
    const query = new URLSearchParams({
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
      klt: spec.klt,
      fqt: String(adjust),
      end: '20500101',
      lmt: String(limit),
      secid,
    })
    // The history host flaps far more than the quote hosts, and nothing else
    // serves daily bars — so a successful read is kept on disk and replayed when
    // the host is unreachable, instead of showing an empty chart.
    const useFallback = async () => {
      const alternative = await fetchTencentBars(secid, period, limit, adjust).catch(() => [])
      if (alternative.length > 0) {
        writeKlineCache(secid, spec.klt, alternative)
        return alternative
      }
      const cached = readKlineCache(secid, spec.klt, limit)
      if (cached !== null) {
        klineFallbackAt = Date.now()
        return cached
      }
      return null
    }
    let body = null
    try {
      body = await getJson(`${EAST_HIS}/api/qt/stock/kline/get?${query}`)
    } catch (error) {
      const recovered = await useFallback()
      if (recovered !== null) return recovered
      throw error
    }
    const data = body && body.data
    if (data === null || data === undefined || !Array.isArray(data.klines) || data.klines.length === 0) {
      const recovered = await useFallback()
      return recovered === null ? [] : recovered
    }
    const bars = data.klines.map(line => {
      const part = line.split(',')
      return {
        date: part[0],
        open: Number(part[1]),
        close: Number(part[2]),
        high: Number(part[3]),
        low: Number(part[4]),
        volume: Number(part[5]),
        amount: Number(part[6]),
        pct: Number(part[8]),
        turnover: Number(part[10]),
      }
    })
    writeKlineCache(secid, spec.klt, bars)
    return bars
  })
}

/**
 * Intraday minute line for one session.
 * @param {string} secid Eastmoney security id such as `1.600519`.
 * @returns {{`prevClose`: number|null, points: Array<{t: string, price: number, avg: number|null, volume: number}>}}
 */
export async function fetchTrend(secid, days = 1) {
  return memo(`trend:${secid}:${days}`, 5_000, async () => {
    const query = new URLSearchParams({
      fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
      ndays: String(days),
      iscr: '0',
      secid,
    })
    // Only the history host returns several sessions; the quote host caps at one,
    // and its delayed sibling keeps answering when the primary is dropping.
    const body =
      days > 1
        ? await getJson(`${EAST_HIS}/api/qt/stock/trends2/get?${query}`, 7000)
        : await quoteJson(`/api/qt/stock/trends2/get?${query}`, 7000)
    const data = body && body.data
    const rows = data && Array.isArray(data.trends) ? data.trends : []
    const points = rows.map(line => {
      const part = line.split(',')
      const price = num(part[2])
      const stamp = String(part[0] || '')
      return {
        t: stamp.slice(11, 16),
        d: stamp.slice(5, 10),
        price,
        avg: num(part[7]),
        volume: num(part[5]),
        amount: num(part[6]),
      }
    }).filter(point => point.price !== null)
    return { prevClose: data ? num(data.preClose) : null, points }
  })
}

/* ------------------------------------------------------------------ *
 * Indicators
 * ------------------------------------------------------------------ */

function sma(values, length) {
  if (values.length < length) return null
  let sum = 0
  for (let i = values.length - length; i < values.length; i += 1) sum += values[i]
  return sum / length
}

function rsiSeries(closes, length) {
  if (closes.length <= length) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= length; i += 1) {
    const delta = closes[i] - closes[i - 1]
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  let avgGain = gain / length
  let avgLoss = loss / length
  for (let i = length + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1]
    avgGain = (avgGain * (length - 1) + Math.max(delta, 0)) / length
    avgLoss = (avgLoss * (length - 1) + Math.max(-delta, 0)) / length
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

function kdjOf(bars) {
  if (!Array.isArray(bars) || bars.length < 9) return null
  let prevK = 50
  let prevD = 50
  let k = 50
  let d = 50
  for (let index = 0; index < bars.length; index += 1) {
    const from = Math.max(0, index - 8)
    let high = -Infinity
    let low = Infinity
    for (let scan = from; scan <= index; scan += 1) {
      if (bars[scan].high > high) high = bars[scan].high
      if (bars[scan].low < low) low = bars[scan].low
    }
    const rsv = high === low ? 50 : ((bars[index].close - low) / (high - low)) * 100
    k = (2 / 3) * prevK + (1 / 3) * rsv
    d = (2 / 3) * prevD + (1 / 3) * k
    prevK = k
    prevD = d
  }
  return { k: round(k, 1), d: round(d, 1), j: round(3 * k - 2 * d, 1) }
}

function macdOf(closes) {
  if (closes.length < 26) return null
  const k12 = 2 / 13
  const k26 = 2 / 27
  const k9 = 2 / 10
  let ema12 = closes[0]
  let ema26 = closes[0]
  let dea = 0
  let dif = 0
  for (const close of closes) {
    ema12 = close * k12 + ema12 * (1 - k12)
    ema26 = close * k26 + ema26 * (1 - k26)
    dif = ema12 - ema26
    dea = dif * k9 + dea * (1 - k9)
  }
  return { dif, dea, hist: (dif - dea) * 2 }
}

/** Technical snapshot used by the strategy rules. */
export function indicatorsOf(bars) {
  if (!Array.isArray(bars) || bars.length < 21) return null
  const closes = bars.map(bar => bar.close)
  const volumes = bars.map(bar => bar.volume)
  const last = closes[closes.length - 1]
  const prior = closes[closes.length - 2]
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const prevCloses = closes.slice(0, -1)
  const prevMa20 = sma(prevCloses, 20)
  const window20 = closes.slice(-20)
  const window60 = closes.slice(-60)
  const high20 = Math.max(...window20)
  const low20 = Math.min(...window20)
  const high60 = window60.length > 0 ? Math.max(...window60) : high20
  const low60 = window60.length > 0 ? Math.min(...window60) : low20
  const ref20 = closes.length > 21 ? closes[closes.length - 21] : closes[0]
  const ref5 = closes.length > 6 ? closes[closes.length - 6] : closes[0]
  const macd = macdOf(closes)
  const previousVolumes = volumes.slice(-6, -1)
  const avgVolume5 = previousVolumes.length === 5 ? previousVolumes.reduce((sum, value) => sum + value, 0) / 5 : sma(volumes, 5)
  const lastVolume = volumes[volumes.length - 1]
  const kdj = kdjOf(bars)
  return {
    last: round(last),
    ma5: round(ma5),
    ma10: round(ma10),
    ma20: round(ma20),
    ma60: round(ma60),
    ma20Slope: ma20 !== null && prevMa20 !== null ? round(((ma20 - prevMa20) / prevMa20) * 100, 3) : null,
    rsi6: round(rsiSeries(closes, 6), 1),
    rsi14: round(rsiSeries(closes, 14), 1),
    macd: macd === null ? null : { dif: round(macd.dif, 3), dea: round(macd.dea, 3), hist: round(macd.hist, 3) },
    high20: round(high20),
    low20: round(low20),
    high60: round(high60),
    low60: round(low60),
    mom5: ref5 === 0 ? null : round(((last / ref5 - 1) * 100), 2),
    mom20: ref20 === 0 ? null : round(((last / ref20 - 1) * 100), 2),
    bias20: ma20 === null || ma20 === 0 ? null : round(((last - ma20) / ma20) * 100, 2),
    fromHigh20: high20 === 0 ? null : round(((last / high20 - 1) * 100), 2),
    volumeRatio5: avgVolume5 === null || avgVolume5 === 0 || lastVolume === null ? null : round(lastVolume / avgVolume5, 2),
    avgVolume5: round(avgVolume5, 0),
    avgVolume10: round(sma(volumes.slice(0, -1), 10), 0),
    kdj,
    position20: high20 === low20 ? null : round(((last - low20) / (high20 - low20)) * 100, 1),
    position60: high60 === low60 ? null : round(((last - low60) / Math.max(high60 - low60, 1e-6)) * 100, 1),
    chgToday: prior === 0 ? null : round(((last / prior - 1) * 100), 2),
    bars: bars.length,
  }
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function sectorPercentile(industry, hotIndustries) {
  if (industry === null || industry === undefined) return null
  const index = hotIndustries.indexOf(industry)
  return index === -1 ? null : index
}

function scoreStock(quote, tech, context) {
  const tags = []
  const reasons = []
  let score = 28
  const pct = quote.pct === null ? 0 : quote.pct
  const flowRatio = quote.amount && quote.amount > 0 && quote.mainNet !== null ? quote.mainNet / quote.amount : null
  const hotIndex = sectorPercentile(quote.industry, context.hotIndustries)

  if (tech !== null && tech !== undefined) {
    if (tech.ma5 !== null && tech.ma10 !== null && tech.ma20 !== null && tech.ma5 > tech.ma10 && tech.ma10 > tech.ma20 && quote.price !== null && quote.price > tech.ma5) {
      score += 16
      tags.push('trend')
      reasons.push(`MA5 ${tech.ma5} > MA10 ${tech.ma10} > MA20 ${tech.ma20}，多头排列且股价站上短期均线`)
    }
    if (tech.ma20Slope !== null && tech.ma20Slope > 0.05) score += 4
    if (tech.ma20Slope !== null && tech.ma20Slope < -0.1) score -= 5
    if (
      tech.high20 !== null &&
      quote.price !== null &&
      quote.price >= tech.high20 * 0.995 &&
      pct >= 3 &&
      quote.volRatio !== null &&
      quote.volRatio >= 1.5
    ) {
      score += 18
      tags.push('breakout')
      reasons.push(`放量突破 20 日高点 ${tech.high20}（量比 ${quote.volRatio}）`)
    }
    if (tech.mom20 !== null && tech.mom20 >= 15) {
      score += 11
      tags.push('momentum')
      reasons.push(`近 20 个交易日累计 ${tech.mom20}%，动量因子居前`)
    }
    if (tech.bias20 !== null && tech.bias20 <= -8 && tech.rsi6 !== null && tech.rsi6 <= 34) {
      score += 14
      tags.push('oversold')
      reasons.push(`20 日乖离率 ${tech.bias20}%、RSI6 ${tech.rsi6}，处于超卖修复区间`)
    }
    if (tech.macd !== null && tech.macd.hist > 0 && tech.macd.dif > tech.macd.dea && tech.macd.dif < 0) {
      score += 4
      reasons.push('MACD 零轴下方金叉，动能修复中')
    }
  }

  if (flowRatio !== null && flowRatio >= 0.05) {
    score += 14
    tags.push('capital')
    reasons.push(`主力净流入 ${yi(quote.mainNet)}，占成交额 ${(flowRatio * 100).toFixed(1)}%`)
  } else if (flowRatio !== null && flowRatio >= 0.02) {
    score += 6
  }
  if (flowRatio !== null && flowRatio <= -0.08) {
    score -= 10
    reasons.push(`主力净流出 ${yi(quote.mainNet)}，资金面偏弱`)
  }

  const limitLine = quote.code.startsWith('30') || quote.code.startsWith('68') ? 19.4 : 9.6
  if (pct >= limitLine) {
    score += 9
    tags.push('limit')
    reasons.push('封板或逼近涨停，处于情绪博弈梯队')
  } else if (pct >= 7) {
    score += 5
  }

  if (
    quote.pe !== null &&
    quote.pe > 0 &&
    quote.pe <= 18 &&
    quote.pb !== null &&
    quote.pb > 0 &&
    quote.pb <= 2 &&
    quote.mktCap !== null &&
    quote.mktCap >= 1e10
  ) {
    score += 8
    tags.push('value')
    reasons.push(`PE ${quote.pe}、PB ${quote.pb}、市值 ${yi(quote.mktCap, 0)}，低估值区间`)
  }

  if (hotIndex !== null) {
    score += hotIndex < 3 ? 12 : hotIndex < 8 ? 8 : 5
    tags.push('rotation')
    reasons.push(`所属行业「${quote.industry}」位居板块涨幅榜第 ${hotIndex + 1} 名`)
  }

  if (pct <= -5) score -= 10
  if (quote.turnover !== null && quote.turnover > 32) score -= 6
  if (quote.volRatio !== null && quote.volRatio > 9) score -= 4

  return {
    // Soft cap: several strategies can fire at once, and a raw sum would saturate
    // at 96 for half the pool and stop ordering it.
    score: Math.round(clamp(96 * (1 - Math.exp(-Math.max(score, 0) / 55)), 0, 96)),
    tags: [...new Set(tags)],
    reasons,
  }
}

function scoreSector(board, fiveDayPct) {
  const pct = board.pct === null ? 0 : board.pct
  const flowRatio = board.amount && board.amount > 0 && board.mainNet !== null ? board.mainNet / board.amount : null
  const width = board.ratio === null ? 0.5 : board.ratio
  const size = (board.up || 0) + (board.down || 0)
  const pctScore = clamp(50 + pct * 9, 0, 100)
  const flowScore = flowRatio === null ? 50 : clamp(50 + flowRatio * 600, 0, 100)
  const widthScore = clamp(width * 100, 0, 100)
  const momentumScore = fiveDayPct === null || fiveDayPct === undefined ? null : clamp(50 + fiveDayPct * 5, 0, 100)
  const weights = momentumScore === null ? [0.45, 0.32, 0.23] : [0.36, 0.26, 0.18, 0.2]
  const parts = momentumScore === null ? [pctScore, flowScore, widthScore] : [pctScore, flowScore, widthScore, momentumScore]
  let score = parts.reduce((total, part, index) => total + part * weights[index], 0)
  // A three-stock sub-industry can top the percentage table on noise alone.
  if (size < 5) score -= 18
  else if (size < 10) score -= 6
  else score += 2
  if (board.amount !== null && board.amount >= 5e9) score += 3
  const tags = []
  if (board.mainNet !== null && board.mainNet > 0) tags.push('capital')
  if (width >= 0.8) tags.push('broad')
  if (pct >= 3) tags.push('hot')
  if (momentumScore !== null && momentumScore >= 70) tags.push('momentum')
  return { score: Math.round(clamp(score, 0, 99)), tags, flowRatio, size }
}

/* ------------------------------------------------------------------ *
 * Picks
 * ------------------------------------------------------------------ */

const LIST_QUERIES = [
  { fid: 'f3', label: '涨幅', po: '1' },
  { fid: 'f22', label: '涨速', po: '1' },
  { fid: 'f10', label: '量比', po: '1' },
  { fid: 'f62', label: '主力净流入', po: '1' },
  { fid: 'f8', label: '换手', po: '1' },
  // The mirror image: names that are down today and cheap on earnings, so the
  // mean-reversion and value rules are not starved of candidates.
  { fid: 'f3', label: '跌幅', po: '0' },
  { fid: 'f9', label: '低市盈率', po: '1' },
]

function isTradable(quote) {
  if (quote.code === '' || quote.price === null || quote.price <= 0) return false
  if (/^(N|C)/.test(quote.name)) return false
  if (/ST|退/.test(quote.name)) return false
  if (quote.amount === null || quote.amount < 3e7) return false
  return true
}

export async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/** Boards ranked by today's move, then re-scored with their own 5-day momentum. */
async function buildSectors(kind) {
  const boards = await fetchBoards(kind)
  const candidates = boards.filter(board => board.pct !== null && board.name !== '').slice(0, 24)
  const scored = await mapLimit(candidates, 6, async board => {
    let fiveDayPct = null
    try {
      const bars = await fetchKline(`90.${board.code}`, 30)
      if (bars.length >= 6) {
        const last = bars[bars.length - 1].close
        const ref = bars[bars.length - 6].close
        if (ref > 0) fiveDayPct = round(((last / ref - 1) * 100), 2)
      }
    } catch {
      fiveDayPct = null
    }
    const result = scoreSector(board, fiveDayPct)
    return { ...board, label: board.name.replace(/[ⅠⅡⅢ]+$/, ''), fiveDayPct, score: result.score, tags: result.tags, size: result.size }
  })
  // 一级/二级/三级行业 often repeat the same constituents: keep one row per label.
  const byLabel = new Map()
  for (const board of scored) {
    if (board.size < 5) continue
    const kept = byLabel.get(board.label)
    if (kept === undefined || board.score > kept.score) byLabel.set(board.label, board)
  }
  return [...byLabel.values()].sort((a, b) => b.score - a.score).slice(0, 12)
}

async function buildPicks(hotIndustries, limit) {
  const lists = await mapLimit(LIST_QUERIES, 3, query =>
    clist({ pz: '60', po: query.po || '1', fid: query.fid, fs: STOCK_FS, fields: STOCK_FIELDS })
      .then(result => result.rows)
      .catch(() => []),
  )
  const seen = new Map()
  for (const rows of lists) {
    for (const row of rows) {
      const quote = toQuote(row)
      if (!isTradable(quote)) continue
      if (!seen.has(quote.code)) seen.set(quote.code, quote)
    }
  }
  const pool = [...seen.values()]
  const preScored = pool
    .map(quote => ({ quote, ...scoreStock(quote, null, { hotIndustries }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)

  const enriched = await mapLimit(preScored, 6, async entry => {
    let tech = null
    try {
      tech = indicatorsOf(await fetchKline(entry.quote.secid, 70))
    } catch {
      tech = null
    }
    const scored = scoreStock(entry.quote, tech, { hotIndustries })
    return { quote: entry.quote, tech, ...scored }
  })

  const sorted = enriched.slice().sort((a, b) => b.score - a.score)
  // A multi-strategy screen that returns eight momentum names is not a screen,
  // it is one rule. Take the best name of each unfilled family first, then fill
  // the remaining slots by score.
  const chosen = []
  const covered = new Set()
  for (const entry of sorted) {
    if (chosen.length >= limit) break
    const introduces = entry.tags.some(tag => !covered.has(tag))
    if ((introduces && entry.score >= 42) || chosen.length === 0) {
      chosen.push(entry)
      for (const tag of entry.tags) covered.add(tag)
    }
  }
  for (const entry of sorted) {
    if (chosen.length >= limit) break
    if (chosen.indexOf(entry) === -1) chosen.push(entry)
  }

  return chosen
    .slice(0, limit)
    .map(entry => ({
      code: entry.quote.code,
      name: entry.quote.name,
      price: entry.quote.price,
      pct: entry.quote.pct,
      industry: entry.quote.industry,
      amount: entry.quote.amount,
      mainNet: entry.quote.mainNet,
      turnover: entry.quote.turnover,
      volRatio: entry.quote.volRatio,
      pe: entry.quote.pe,
      score: entry.score,
      tags: entry.tags,
      reasons: entry.reasons.slice(0, 3),
      tech: entry.tech,
    }))
}

/* ------------------------------------------------------------------ *
 * Watchlist alerts
 * ------------------------------------------------------------------ */

function flagsOf(quote, tech) {
  const flags = []
  const pct = quote.pct === null ? 0 : quote.pct
  const limitLine = quote.code.startsWith('30') || quote.code.startsWith('68') ? 19.4 : 9.6
  const flowRatio = quote.amount && quote.amount > 0 && quote.mainNet !== null ? quote.mainNet / quote.amount : null
  if (pct >= limitLine) flags.push({ k: 'limitUp', level: 'up', text: '涨停' })
  else if (pct >= limitLine - 2) flags.push({ k: 'nearLimit', level: 'warn', text: '逼近涨停' })
  if (pct <= -limitLine) flags.push({ k: 'limitDown', level: 'down', text: '跌停' })
  if (quote.speed !== null && quote.speed >= 0.8) flags.push({ k: 'speedUp', level: 'up', text: `涨速 +${quote.speed}%` })
  if (quote.speed !== null && quote.speed <= -0.8) flags.push({ k: 'speedDown', level: 'down', text: `跌速 ${quote.speed}%` })
  if (quote.volRatio !== null && quote.volRatio >= 2.5) flags.push({ k: 'volume', level: 'warn', text: `量比 ${quote.volRatio}` })
  if (flowRatio !== null && flowRatio >= 0.1) flags.push({ k: 'inflow', level: 'up', text: `主力净流入 ${yi(quote.mainNet)}` })
  if (flowRatio !== null && flowRatio <= -0.1) flags.push({ k: 'outflow', level: 'down', text: `主力净流出 ${yi(quote.mainNet)}` })
  if (tech !== null && tech !== undefined) {
    if (tech.ma5 !== null && quote.price !== null && quote.price > tech.ma5 && tech.last !== null && tech.last <= tech.ma5) {
      flags.push({ k: 'aboveMa5', level: 'up', text: '站上 MA5' })
    }
    if (tech.ma20 !== null && quote.price !== null && quote.price < tech.ma20 && tech.last !== null && tech.last >= tech.ma20) {
      flags.push({ k: 'belowMa20', level: 'down', text: '跌破 MA20' })
    }
    if (tech.high20 !== null && quote.price !== null && quote.price >= tech.high20) {
      flags.push({ k: 'newHigh', level: 'up', text: '创 20 日新高' })
    }
  }
  return flags
}

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

const SENTENCE = {
  亢奋: '情绪亢奋，赚钱效应强，注意高位分歧与炸板风险。',
  偏强: '情绪偏强，可跟随强势板块，但不追高缩量加速。',
  平衡: '情绪中性，结构性行情，仓位与节奏优先。',
  偏弱: '情绪偏弱，控制回撤，等待放量企稳信号。',
  冰点: '情绪冰点，超跌反弹随时可能出现，但不宜重仓抢反弹。',
}

function moodOf(score) {
  if (score >= 72) return '亢奋'
  if (score >= 58) return '偏强'
  if (score >= 44) return '平衡'
  if (score >= 30) return '偏弱'
  return '冰点'
}

async function buildSentiment(pools, breadth) {
  const breadthLatest = breadth.latest
  const rise = breadthLatest === null ? null : breadthLatest.rise
  const fall = breadthLatest === null ? null : breadthLatest.fall
  const limitUp = breadthLatest !== null && breadthLatest.limitUp !== null ? breadthLatest.limitUp : pools.limitUp
  const limitDown = breadthLatest !== null && breadthLatest.limitDown !== null ? breadthLatest.limitDown : pools.limitDown
  const total = rise !== null && fall !== null ? rise + fall : null
  const riseRatio = total !== null && total > 0 ? rise / total : null
  const brokenRate = pools.brokenRate
  const limitScore = clamp(limitUp / 60, 0, 1)
  const score = Math.round(
    clamp(
      100 *
        (0.5 * (riseRatio === null ? 0.5 : riseRatio) +
          0.28 * (1 - clamp(brokenRate, 0, 1)) +
          0.22 * limitScore),
      0,
      100,
    ),
  )
  const mood = moodOf(score)
  return {
    rise,
    fall,
    limitUp,
    limitDown,
    broken: pools.broken,
    brokenRate: Math.round(brokenRate * 1000) / 10,
    riseRatio: riseRatio === null ? null : Math.round(riseRatio * 1000) / 10,
    ladder: pools.ladder,
    top: pools.top,
    score,
    mood,
    note: SENTENCE[mood],
    history: breadth.history,
  }
}

/**
 * Build one dashboard snapshot.
 * @param {{codes?: string[], mode?: 'light'|'full', limit?: number}} options
 * @returns the dashboard payload.
 */
export async function snapshot(options = {}) {
  const started = Date.now()
  const codes = [...new Set((options.codes || DEFAULT_WATCH).map(normalizeCode).filter(Boolean))].slice(0, 30)
  const holdings = [...new Set((options.holdings || []).map(normalizeCode).filter(Boolean))].slice(0, 30)
  const mode = options.mode === 'light' ? 'light' : 'full'
  const limit = clamp(Number(options.limit) || 8, 3, 20)
  const errors = []

  const phase = marketPhase()
  const clock = clockNow()
  const settle = async (label, task, fallback) => {
    try {
      return await task
    } catch (error) {
      errors.push({ source: label, message: error instanceof Error ? error.message : String(error) })
      return fallback
    }
  }

  const [indices, pools, breadth] = await Promise.all([
    settle('指数', fetchIndices(), []),
    settle('涨停池', fetchPools(phase.date), { limitUp: 0, limitDown: 0, broken: 0, brokenRate: 0, ladder: [], top: [], topDown: [] }),
    settle('涨跌家数', fetchBreadth(), { latest: null, history: [] }),
  ])

  const sentiment = await buildSentiment(pools, breadth)

  const quoteRows = await settle('自选行情', quotes([...new Set([...codes, ...holdings])]), [])
  const byCode = new Map(quoteRows.map(quote => [quote.code, quote]))
  const watchQuotes = codes.map(code => byCode.get(code)).filter(Boolean)
  const holdingQuotes = holdings.map(code => byCode.get(code)).filter(Boolean)

  const withTech = await mapLimit(watchQuotes, 5, async quote => {
    let tech = null
    try {
      tech = indicatorsOf(await fetchKline(quote.secid, 70))
    } catch {
      tech = null
    }
    const scored = scoreStock(quote, tech, { hotIndustries: [] })
    return {
      ...quote,
      tech,
      score: scored.score,
      tags: scored.tags,
      flags: flagsOf(quote, tech),
      volumeState: volumeStateOf({ quote, stats: tech, clock, limits: { pct: limitRatioOf(quote.code, quote.name) } }),
    }
  })

  let sectorPayload = { industry: [], concept: [], picks: [] }
  let picks = []

  if (mode === 'full') {
    const [industrySectors, conceptSectors] = await Promise.all([
      settle('行业板块', memo('sectors:industry', 20_000, () => buildSectors('industry')), []),
      settle('概念板块', memo('sectors:concept', 20_000, () => buildSectors('concept')), []),
    ])
    const hotIndustries = industrySectors.map(board => board.name)
    sectorPayload = { industry: industrySectors, concept: conceptSectors }

    picks = await settle('个股推荐', memo(`picks:${hotIndustries.join('|')}:${limit}`, 45_000, () => buildPicks(hotIndustries, limit)), [])
  }

  const strategyStats = STRATEGIES.map(strategy => ({
    id: strategy.id,
    name: strategy.name,
    family: strategy.family,
    desc: strategy.desc,
    count: [...picks, ...withTech].filter(item => Array.isArray(item.tags) && item.tags.includes(strategy.id)).length,
  }))

  return {
    asOf: Date.now(),
    tookMs: Date.now() - started,
    mode,
    market: phase,
    indices,
    sentiment,
    watchlist: withTech,
    holdings: holdingQuotes,
    sectors: sectorPayload,
    picks,
    strategies: strategyStats,
    errors,
    source: '东方财富 / 雪球公开行情',
    disclaimer: '策略信号由公开行情实时计算，仅用于研究与观察，不构成投资建议。',
  }
}

/** A compact text summary for the agent tool. */
export function summarize(payload) {
  const lines = []
  const tape = payload.indices.map(index => `${index.name} ${index.price === null ? '—' : index.price} (${index.pct === null ? '—' : index.pct}%)`).join('　')
  lines.push(`【${payload.market.day} ${payload.market.time} ${payload.market.label}】${tape}`)
  const sentiment = payload.sentiment
  lines.push(
    `情绪 ${sentiment.score}/100 · ${sentiment.mood}：涨 ${sentiment.rise ?? '—'} / 跌 ${sentiment.fall ?? '—'}，涨停 ${sentiment.limitUp} / 跌停 ${sentiment.limitDown}，炸板率 ${sentiment.brokenRate}%`,
  )
  if (sentiment.ladder.length > 0) {
    lines.push(`连板梯队：${sentiment.ladder.slice(0, 8).map(step => `${step.board}板×${step.count}`).join(' ')}`)
  }
  if (payload.sectors.industry.length > 0) {
    lines.push(
      `行业前列：${payload.sectors.industry
        .slice(0, 6)
        .map(board => `${board.name} ${board.pct}%(${board.score})`)
        .join('　')}`,
    )
  }
  if (payload.sectors.concept.length > 0) {
    lines.push(
      `概念前列：${payload.sectors.concept
        .slice(0, 6)
        .map(board => `${board.name} ${board.pct}%(${board.score})`)
        .join('　')}`,
    )
  }
  if (payload.picks.length > 0) {
    lines.push('推荐标的：')
    for (const pick of payload.picks) {
      const tags = pick.tags.map(tag => TAG_TEXT[tag] || tag).join('/')
      lines.push(`- ${pick.code} ${pick.name} ${pick.price ?? '—'} (${pick.pct ?? '—'}%) 评分${pick.score} [${tags}] ${pick.reasons[0] || ''}`)
    }
  }
  if (payload.watchlist.length > 0) {
    lines.push('自选盯盘：')
    for (const stock of payload.watchlist) {
      const flags = stock.flags.map(flag => flag.text).join('/')
      lines.push(`- ${stock.code} ${stock.name} ${stock.price ?? '—'} (${stock.pct ?? '—'}%) 量比${stock.volRatio ?? '—'} 主力${yi(stock.mainNet)}${flags === '' ? '' : ` · ${flags}`}`)
    }
  }
  if (payload.errors.length > 0) lines.push(`数据异常：${payload.errors.map(error => error.source).join('、')}`)
  lines.push(payload.disclaimer)
  return lines.join('\n')
}

export { TAG_TEXT }
