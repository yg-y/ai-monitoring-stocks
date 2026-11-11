/**
 * A-share radar — Host half.
 *
 * Mounts two things:
 *  - read-only HTTP routes under `/ashare-radar/api/*` that the Web panel polls;
 *  - the `ashare_radar` Tool so the Agent can read the same tape in chat.
 *
 * Every route is a GET over public quote data; nothing mutates, nothing is
 * persisted, and no credential is read.
 */

import { ANALYSIS_QUESTION, SYSTEM_PROMPT, buildBrief, parseAnalysis } from './analysis.js'
import { listDates, mergeDay, readDay } from './sector-store.js'
import {
  DEFAULT_WATCH,
  PERIODS,
  STRATEGIES,
  fetchBoardStocks,
  fetchBoards,
  fetchKline,
  fetchAnnouncements,
  fetchMoneyFlow,
  fetchNews,
  fetchSpark,
  fetchStockBoards,
  fetchBoardTrends,
  fetchTrend,
  mapLimit,
  clockNow,
  klineFallbackAge,
  volumeStateOf,
  indicatorsOf,
  marketPhase,
  quoteBySecid,
  normalizeCode,
  quotes,
  secidOf,
  snapshot,
  summarize,
  TAG_TEXT,
} from './engine.js'

const API = '/ashare-radar/api'
const TOOL = 'ashare_radar'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

function queryCodes(url) {
  const raw = url.searchParams.get('codes')
  if (raw === null || raw.trim() === '') return DEFAULT_WATCH
  return raw
    .split(',')
    .map(normalizeCode)
    .filter(code => code !== null)
    .slice(0, 30)
}

function routeHandler(handle) {
  return async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' })
      response.end()
      return
    }
    try {
      const url = new URL(request.url || '/', 'http://localhost')
      const value = await handle(url)
      if (value === undefined) {
        sendJson(response, 404, { error: 'not found' })
        return
      }
      sendJson(response, 200, value)
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Eastmoney's suggest endpoint, filtered to A-shares. */
async function searchStocks(keyword) {
  const query = new URLSearchParams({
    input: keyword,
    type: '14',
    token: 'D43BF722C8E33BDC906FB84D85E326E8',
    count: '8',
  })
  const response = await fetch(`https://searchapi.eastmoney.com/api/suggest/get?${query}`, {
    headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' },
    signal: AbortSignal.timeout(6000),
  })
  if (!response.ok) throw new Error(`搜索接口 HTTP ${response.status}`)
  const body = await response.json()
  const rows = body && body.QuotationCodeTable && Array.isArray(body.QuotationCodeTable.Data) ? body.QuotationCodeTable.Data : []
  return rows
    .filter(row => row && row.Classify === 'AStock' && typeof row.Code === 'string')
    .slice(0, 8)
    .map(row => ({ code: row.Code, name: row.Name, market: row.MarketType }))
}

function describeStrategies() {
  return STRATEGIES.map(strategy => ({
    id: strategy.id,
    name: strategy.name,
    family: strategy.family,
    desc: strategy.desc,
  }))
}

/**
 * Daily price limits for the A-share board this code belongs to.
 * @returns {{`pct`: number, up: number|null, down: number|null}}
 */
function priceLimits(code, quote, prevClose) {
  const name = quote !== null && typeof quote.name === 'string' ? quote.name : ''
  let pct = 0.1
  if (/^[48]/.test(code)) pct = 0.3
  else if (/^(30|68)/.test(code)) pct = 0.2
  if (name.indexOf('ST') !== -1) pct = 0.05
  if (prevClose === null || prevClose === undefined) return { pct, up: null, down: null }
  return { pct, up: Math.round(prevClose * (1 + pct) * 100) / 100, down: Math.round(prevClose * (1 - pct) * 100) / 100 }
}

/** Gather the brief, resolve the model, and assemble one analysis call. */
async function prepareAnalysis(hostCtx, body) {
  const code = normalizeCode(body && body.code ? body.code : '')
  if (code === null) {
    return { status: 400, error: '缺少有效的 6 位证券代码' }
  }
  const llm = hostCtx.get('llm')
  if (llm === undefined || typeof llm.stream !== 'function') return { status: 503, error: '当前环境没有可用的大模型服务' }
  let selection = null
  try {
    const modelService = hostCtx.get('agentDefaultModel')
    selection = modelService !== undefined && typeof modelService.currentSelection === 'function' ? modelService.currentSelection() : null
  } catch {
    selection = null
  }
  if (selection === null || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
    return { status: 503, error: '还没有设置默认模型，请先在设置里选择一个模型' }
  }

  const secid = secidOf(code)
  const requestedName = typeof body.name === 'string' ? body.name.trim().slice(0, 16) : ''
  const [marketSnapshot, flow, boards, news, announcements, daily] = await Promise.all([
    snapshot({ codes: [code], mode: 'light' }).catch(() => null),
    fetchMoneyFlow(secid).catch(() => null),
    fetchStockBoards(secid).catch(() => []),
    requestedName === '' ? Promise.resolve([]) : fetchNews(requestedName, 6).catch(() => []),
    fetchAnnouncements(code, 5).catch(() => []),
    fetchKline(secid, 160, 'day').catch(() => []),
  ])
  const quote = marketSnapshot && Array.isArray(marketSnapshot.watchlist) && marketSnapshot.watchlist.length > 0 ? marketSnapshot.watchlist[0] : null
  const stats = Array.isArray(daily) && daily.length > 0 ? indicatorsOf(daily) : null
  const limits = quote !== null ? priceLimits(code, quote, quote.prevClose) : null
  const volumeState = quote !== null ? volumeStateOf({ quote, stats, clock: clockNow(), limits }) : null
  const brief = buildBrief({
    quote,
    stats,
    flow,
    boards,
    sentiment: marketSnapshot !== null ? marketSnapshot.sentiment : null,
    market: marketSnapshot !== null ? marketSnapshot.market : marketPhase(),
    news,
    announcements,
    limits,
    volumeState,
    phase: marketPhase().label,
  })

  const question = typeof body.question === 'string' && body.question.trim() !== '' ? body.question.trim().slice(0, 800) : ANALYSIS_QUESTION
  const history = Array.isArray(body.history)
    ? body.history
        .filter(message => message !== null && typeof message === 'object' && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .slice(-8)
        .map(message => ({ role: message.role, content: [{ type: 'text', text: String(message.content).slice(0, 6000) }] }))
    : []
  const messages = [{ role: 'user', content: [{ type: 'text', text: brief }] }].concat(history).concat([
    { role: 'user', content: [{ type: 'text', text: question }] },
  ])

  return {
    llm,
    selection,
    question,
    prompt: {
      provider: selection.provider,
      model: selection.model,
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.4,
      maxTokens: 3200,
    },
  }
}

function mountRoutes(hostCtx) {
  const routes = [
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/snapshot`,
      handler: routeHandler(async url => {
        const mode = url.searchParams.get('mode') === 'light' ? 'light' : 'full'
        const limit = Number(url.searchParams.get('limit')) || 8
        const rawHoldings = url.searchParams.get('holdings')
        const holdings =
          rawHoldings === null || rawHoldings.trim() === ''
            ? []
            : rawHoldings
                .split(',')
                .map(normalizeCode)
                .filter(code => code !== null)
                .slice(0, 30)
        return snapshot({ codes: queryCodes(url), holdings, mode, limit })
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/quote`,
      handler: routeHandler(async url => {
        const codes = queryCodes(url)
        const rows = await quotes(codes)
        return { asOf: Date.now(), market: marketPhase(), quotes: rows }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/sector`,
      handler: routeHandler(async url => {
        const kind = url.searchParams.get('kind') === 'concept' ? 'concept' : 'industry'
        const boards = await fetchBoards(kind)
        return { asOf: Date.now(), kind, boards: boards.slice(0, 30) }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/search`,
      handler: routeHandler(async url => {
        const keyword = (url.searchParams.get('q') || '').trim()
        if (keyword === '') return { asOf: Date.now(), items: [] }
        if (keyword.length > 30) return { asOf: Date.now(), items: [], error: '关键词过长' }
        return { asOf: Date.now(), items: await searchStocks(keyword) }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/detail`,
      handler: routeHandler(async url => {
        const rawSecid = (url.searchParams.get('secid') || '').trim()
        const indexSecid = /^\d\.\d{6}$/.test(rawSecid) ? rawSecid : null
        const code = normalizeCode(url.searchParams.get('code') || '') || (indexSecid === null ? null : indexSecid.slice(2))
        if (code === null) return { error: '缺少有效的 6 位证券代码' }
        const requested = url.searchParams.get('period') || 'day'
        const period = requested === 'trend' || requested === 'trend5' ? requested : PERIODS[requested] === undefined ? 'day' : requested
        const rawAdjust = url.searchParams.get('adjust')
        const adjustValue = rawAdjust === null || rawAdjust === '' ? 1 : Number(rawAdjust)
        const adjust = adjustValue === 0 || adjustValue === 2 ? adjustValue : 1
        const fresh = url.searchParams.get('fresh') === '1'
        const trading = marketPhase().trading
        const isTrend = period.startsWith('trend')
        const isIndex = url.searchParams.get('kind') === 'index'
        const limit = Math.min(400, Math.max(40, Number(url.searchParams.get('limit')) || (isTrend ? 0 : period.startsWith('m') ? 240 : 160)))
        const secid = indexSecid === null ? secidOf(code) : indexSecid
        const [quote, trend, bars] = await Promise.all([
          (isIndex ? quoteBySecid(secid) : quotes([code]).then(rows => rows.find(row => row.code === code) || null)).catch(() => null),
          isTrend ? fetchTrend(secid, period === 'trend5' ? 5 : 1).catch(() => null) : Promise.resolve(null),
          isTrend ? Promise.resolve([]) : fetchKline(secid, limit, period, adjust, fresh && trading).catch(() => []),
        ])
        const prevClose = trend !== null ? trend.prevClose : quote !== null && quote.prevClose !== null ? quote.prevClose : null
        const [stats, boards] = await Promise.all([
          fetchKline(secid, 160, 'day', 1, false)
            .then(daily => indicatorsOf(daily))
            .catch(() => null),
          isIndex ? Promise.resolve([]) : fetchStockBoards(secid).catch(() => []),
        ])
        return {
          asOf: Date.now(),
          code,
          secid,
          kind: isIndex ? 'index' : 'stock',
          period,
          adjust,
          fresh: fresh && trading,
          market: marketPhase(),
          quote,
          trend,
          limits: isTrend && !isIndex ? priceLimits(code, quote, prevClose) : null,
          volumeState:
            isIndex || quote === null
              ? null
              : volumeStateOf({ quote, stats, clock: clockNow(), limits: priceLimits(code, quote, prevClose) }),
          stats,
          barsStale: klineFallbackAge() < 3000,
          boards,
          bars: bars.map(bar => ({
            d: bar.date,
            o: bar.open,
            h: bar.high,
            l: bar.low,
            c: bar.close,
            v: bar.volume,
            a: bar.amount,
            p: bar.pct,
          })),
        }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/spark`,
      handler: routeHandler(async url => {
        const raw = url.searchParams.get('codes') || ''
        const codes = [...new Set(raw.split(',').map(normalizeCode).filter(code => code !== null))].slice(0, 60)
        if (codes.length === 0) return { asOf: Date.now(), sparks: {} }
        // A board page can ask for fifty shapes; four at a time keeps the quote
        // host happy and the cache still absorbs repeats.
        const pairs = await mapLimit(codes, 4, async code => [code, await fetchSpark(secidOf(code)).catch(() => null)])
        const sparks = {}
        for (const [code, spark] of pairs) if (spark !== null) sparks[code] = spark
        return { asOf: Date.now(), sparks }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/sector-trend`,
      handler: routeHandler(async url => {
        const today = clockNow().day
        const requested = (url.searchParams.get('date') || '').trim()
        const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today
        const codes = [...new Set(
          (url.searchParams.get('codes') || '')
            .split(',')
            .map(item => item.trim().toUpperCase())
            .filter(item => /^BK\d{4}$/.test(item)),
        )].slice(0, 60)
        // Today is fetched live and persisted; the same call backfills the four
        // sessions before it, so the store fills up the first time it is used.
        let fetchDays = 0
        if (date === today) {
          let targets = codes
          if (targets.length === 0) {
            // Rank of the day across both board families, so the chart can draw
            // the fifty strongest sectors in one pass.
            const [industry, concept] = await Promise.all([
              fetchBoards('industry').catch(() => []),
              fetchBoards('concept').catch(() => []),
            ])
            targets = industry
              .concat(concept)
              .filter(board => board.pct !== null && board.pct !== undefined && board.name !== '')
              .sort((a, b) => b.pct - a.pct)
              .slice(0, 50)
              .map(board => board.code)
          }
          // Backfill five sessions only when this board has no history yet; on a
          // normal refresh one session is enough and the payload is 5x smaller.
          const storedDates = listDates()
          const previousDate = storedDates.find(value => value < today)
          const previous = previousDate === undefined ? null : readDay(previousDate)
          const needsBackfill = previous === null || targets.some(code => previous.series[code] === undefined)
          fetchDays = needsBackfill ? 5 : 1
          const fetched = await mapLimit(targets, 6, async code => [code, await fetchBoardTrends(`90.${code}`, fetchDays).catch(() => null)])
          for (const [code, days] of fetched) {
            if (days === null) continue
            for (const day of days) mergeDay(day.date, [{ code, name: day.name, points: day.points }])
          }
        }
        const stored = readDay(date)
        const series = stored === null ? [] : Object.values(stored.series).map(entry => ({ code: entry.code, name: entry.name, points: entry.points }))
        return { asOf: Date.now(), date, today, dates: listDates(), series, stored: stored !== null, fetchDays }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/analyze`,
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        // Same gate the host puts in front of its own API; spending model tokens
        // should not be open to anything that can reach the port.
        try {
          const connection = hostCtx.get('connection')
          if (connection !== undefined && typeof connection.requestRejection === 'function') {
            const rejection = connection.requestRejection(request)
            if (rejection !== undefined && rejection !== null) {
              sendJson(response, 403, { error: '请求被主机拒绝' })
              return
            }
          }
        } catch {
          /* an older host without the gate keeps working */
        }

        let body = {}
        try {
          const chunks = []
          let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 256 * 1024) {
              sendJson(response, 413, { error: '请求体过大' })
              return
            }
            chunks.push(chunk)
          }
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          sendJson(response, 400, { error: '请求体不是合法 JSON' })
          return
        }

        const prepared = await prepareAnalysis(hostCtx, body)
        if (prepared.error !== undefined) {
          sendJson(response, prepared.status || 400, { error: prepared.error })
          return
        }
        const { llm, selection, prompt, question } = prepared

        response.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-store',
          'x-accel-buffering': 'no',
        })
        const send = payload => {
          try {
            response.write(JSON.stringify(payload) + '\n')
          } catch {
            /* the client may be gone */
          }
        }
        const controller = new AbortController()
        const deadline = setTimeout(() => controller.abort(), 120_000)
        request.on('close', () => controller.abort())
        send({ type: 'meta', provider: selection.provider, model: selection.model })
        let answer = ''
        let truncated = false
        try {
          const stream = llm.stream(Object.assign({}, prompt, { signal: controller.signal }))
          for await (const chunk of stream) {
            if (chunk.type === 'text-delta') {
              answer += chunk.text
              send({ type: 'delta', text: chunk.text })
            }
            else if (chunk.type === 'finish' && chunk.reason) {
              if (chunk.reason.kind === 'error') {
                const failure = chunk.reason.failure
                send({ type: 'error', message: failure && failure.message ? failure.message : '模型调用失败' })
              } else if (chunk.reason.kind === 'max-tokens') {
                truncated = true
              }
            }
          }
          const isFollowUp = question !== ANALYSIS_QUESTION
          send({
            type: 'done',
            truncated,
            parsed: isFollowUp ? null : parseAnalysis(answer),
          })
        } catch (error) {
          send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
        } finally {
          clearTimeout(deadline)
          response.end()
        }
      },
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/news`,
      handler: routeHandler(async url => {
        const code = normalizeCode(url.searchParams.get('code') || '')
        if (code === null) return { error: '缺少有效的 6 位证券代码' }
        const name = (url.searchParams.get('name') || '').trim().slice(0, 16)
        const [news, announcements] = await Promise.all([
          name === '' ? Promise.resolve([]) : fetchNews(name, 8).catch(() => []),
          fetchAnnouncements(code, 6).catch(() => []),
        ])
        return { asOf: Date.now(), code, news, announcements }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/flow`,
      handler: routeHandler(async url => {
        const rawSecid = (url.searchParams.get('secid') || '').trim()
        const indexSecid = /^\d\.\d{6}$/.test(rawSecid) ? rawSecid : null
        const code = normalizeCode(url.searchParams.get('code') || '')
        if (code === null && indexSecid === null) return { error: '缺少证券代码' }
        const secid = indexSecid === null ? secidOf(code) : indexSecid
        const flow = await fetchMoneyFlow(secid)
        return { asOf: Date.now(), code: code || secid.slice(2), secid, flow }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/board`,
      handler: routeHandler(async url => {
        const code = (url.searchParams.get('code') || '').trim().toUpperCase()
        if (!/^BK\d{4}$/.test(code)) return { error: '缺少有效的板块代码' }
        const requestedSort = url.searchParams.get('sort') || 'f3'
        const sort = ['f3', 'f62', 'f10', 'f8', 'f22', 'f20'].indexOf(requestedSort) === -1 ? 'f3' : requestedSort
        const limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit')) || 50))
        const result = await fetchBoardStocks(code, limit, sort)
        return {
          asOf: Date.now(),
          code,
          sort,
          total: result.total,
          stocks: result.stocks,
          note: result.stocks.length === 0 ? 'no-constituents' : 'ok',
        }
      }),
    }),
    hostCtx.webServer.register({
      kind: 'exact',
      path: `${API}/strategies`,
      handler: routeHandler(async () => ({ asOf: Date.now(), strategies: describeStrategies() })),
    }),
  ]
  return () => {
    for (const dispose of routes) dispose()
  }
}

function toolText(action, payload) {
  if (action === 'strategy') {
    const lines = ['A股多策略信号库（每个标签由实时行情计算）：']
    for (const strategy of STRATEGIES) {
      lines.push(`- ${strategy.name}（${strategy.family}）：${strategy.desc}`)
    }
    lines.push('提示：标签只说明规则命中，不构成投资建议。')
    return lines.join('\n')
  }
  return summarize(payload)
}

function mountTool(hostCtx) {
  return hostCtx.tools.register({
    name: TOOL,
    description:
      'A股实时盯盘与多策略选股。抓取公开行情计算指数、涨跌家数、涨停/炸板情绪、行业与概念板块轮动，并按均线趋势、放量突破、动量、主力资金、超跌反弹、涨停接力、低估值等策略给个股打分与推荐。返回中文摘要。params: action=overview|quote|recommend|strategy|board|analyze, codes=6位股票代码数组, code=个股代码(analyze), board=板块代码或名称, limit=推荐数量。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['overview', 'quote', 'recommend', 'strategy', 'board', 'analyze'],
          description: 'overview=全市场概览, quote=指定代码行情, recommend=板块与个股推荐, strategy=策略说明, board=某板块成分股, analyze=AI 多维上涨空间分析',
        },
        code: {
          type: 'string',
          description: '6 位股票代码，仅 action=analyze 时使用',
        },
        name: {
          type: 'string',
          description: '股票名称，仅 action=analyze 时用于检索新闻',
        },
        board: {
          type: 'string',
          description: '板块代码（如 BK0459）或板块名称（如 印制电路板），仅 action=board 时使用',
        },
        codes: {
          type: 'array',
          items: { type: 'string' },
          description: '6 位 A 股代码，例如 ["600519","300750"]；省略则用默认自选',
        },
        limit: { type: 'integer', description: '推荐个股数量，3-20，默认 8' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(_args, value) {
        const text = value && typeof value === 'object' && typeof value.summary === 'string' ? value.summary : JSON.stringify(value)
        return [{ type: 'text', text }]
      },
    },
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const action = typeof input.action === 'string' ? input.action : 'overview'
      if (action === 'strategy') {
        return { summary: toolText('strategy'), strategies: describeStrategies() }
      }
      if (action === 'analyze') {
        const prepared = await prepareAnalysis(hostCtx, {
          code: typeof input.code === 'string' ? input.code : Array.isArray(input.codes) && input.codes.length > 0 ? input.codes[0] : '',
          name: typeof input.name === 'string' ? input.name : '',
        })
        if (prepared.error !== undefined) return { summary: prepared.error }
        let text = ''
        try {
          const stream = prepared.llm.stream(Object.assign({}, prepared.prompt, { signal: AbortSignal.timeout(150000) }))
          for await (const chunk of stream) {
            if (chunk.type === 'text-delta') text += chunk.text
          }
        } catch (error) {
          return { summary: '分析失败：' + (error instanceof Error ? error.message : String(error)) }
        }
        const parsed = parseAnalysis(text)
        if (parsed === null) return { summary: text, analysis: null }
        const lines = [
          (parsed.summary || '') + '（' + (parsed.verdict || '—') + '，置信度 ' + (parsed.confidence || '—') + '）',
        ]
        for (const dimension of Array.isArray(parsed.dimensions) ? parsed.dimensions : []) {
          lines.push('- ' + (dimension.label || dimension.id || '') + ' ' + (dimension.score === undefined ? '—' : dimension.score) + ' 分 · ' + (dimension.verdict || '') + '：' + (dimension.reason || '') + (dimension.risk ? '（风险：' + dimension.risk + '）' : ''))
        }
        if (parsed.levels !== undefined && parsed.levels !== null) {
          lines.push('支撑 ' + (parsed.levels.support === null || parsed.levels.support === undefined ? '—' : parsed.levels.support) + ' / 压力 ' + (parsed.levels.resistance === null || parsed.levels.resistance === undefined ? '—' : parsed.levels.resistance) + ' / 目标 ' + (parsed.levels.target || '—'))
        }
        lines.push('以上为模型基于公开行情数据的推演，不构成投资建议。')
        return { summary: lines.join('\n'), analysis: parsed }
      }
      if (action === 'board') {
        const target = typeof input.board === 'string' ? input.board.trim() : ''
        if (target === '') return { summary: '请提供板块代码（BK0459）或板块名称。' }
        let code = /^BK\d{4}$/i.test(target) ? target.toUpperCase() : null
        let title = target
        if (code === null) {
          const boards = [...(await fetchBoards('industry')), ...(await fetchBoards('concept'))]
          const hit = boards.find(board => board.name === target || board.label === target)
          if (hit !== undefined) {
            code = hit.code
            title = hit.label || hit.name
          }
        }
        if (code === null) return { summary: '没有找到板块「' + target + '」，可先用 overview 查看板块榜。' }
        const result = await fetchBoardStocks(code, 20, 'f3')
        const lines = ['板块 ' + title + '（' + code + '）成分股 ' + result.total + ' 只，按涨幅前 20：']
        for (const stock of result.stocks) {
          lines.push(
            '- ' + stock.code + ' ' + stock.name + ' ' + (stock.price === null ? '—' : stock.price) + ' (' + (stock.pct === null ? '—' : stock.pct + '%') + ') 量比' + (stock.volRatio === null ? '—' : stock.volRatio) + ' 主力' + (stock.mainNet === null ? '—' : (stock.mainNet / 1e8).toFixed(2) + '亿'),
          )
        }
        lines.push('提示：仅为行情与规则计算结果，不构成投资建议。')
        return { summary: lines.join('\n'), board: { code, name: title, total: result.total }, stocks: result.stocks }
      }
      const codes = Array.isArray(input.codes) ? input.codes.filter(code => typeof code === 'string') : DEFAULT_WATCH
      const limit = typeof input.limit === 'number' ? input.limit : 8
      if (action === 'quote') {
        const payload = await snapshot({ codes, mode: 'light', limit })
        return { summary: payload.watchlist.length === 0 ? '未取到行情，请确认股票代码。' : summarize({ ...payload, indices: [] }), quotes: payload.watchlist }
      }
      if (action === 'recommend') {
        const payload = await snapshot({ codes, mode: 'full', limit })
        return { summary: summarize(payload), picks: payload.picks, sectors: payload.sectors, sentiment: payload.sentiment }
      }
      const payload = await snapshot({ codes, mode: 'full', limit })
      return { summary: summarize(payload), market: payload.market, sentiment: payload.sentiment, picks: payload.picks }
    },
  })
}

export function apply(ctx) {
  ctx.inject(['webServer'], hostCtx => {
    hostCtx.effect(() => mountRoutes(hostCtx), 'ashare-radar: http routes')
  })
  ctx.inject(['tools'], hostCtx => {
    hostCtx.effect(() => mountTool(hostCtx), 'ashare-radar: tool')
  })
}

export { TAG_TEXT }
