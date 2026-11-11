/**
 * Prompt material for the in-panel AI analysis.
 *
 * The Host collects the same numbers the panel draws (quote, technicals, money
 * flow, sectors, news) and renders them as a compact brief. Keeping the brief
 * deterministic means the model argues about the stock, not about parsing.
 */

export const DIMENSIONS = [
  { id: 'technical', label: '技术面' },
  { id: 'volume', label: '量能' },
  { id: 'capital', label: '资金面' },
  { id: 'sector', label: '板块与情绪' },
  { id: 'news', label: '消息面' },
  { id: 'valuation', label: '估值' },
]

export const SYSTEM_PROMPT = `你是一名 A 股上市公司研究员，兼具卖方策略与量化视角。用户会给你一只股票的结构化实时数据，请判断它未来一段时间（数日至数周）的上涨空间。

规则：
1. 只能引用数据中出现的数字与事实。不要编造财报、业绩预告、政策、评级、订单、订单金额等数据里没有的细节；某项数据缺失就直接说"数据不足"，不要猜测。
2. 必须给出 6 个维度的独立判断，每个维度打 0-100 分（越高表示该维度越有利于上涨），并各写一句理由与一句风险。
3. 分数要能区分强弱，不要全部给 50 分；同一维度的理由必须引用具体数字。
4. 明确说明这只是数据推演，不构成投资建议。
5. 当用户要求"按以下 JSON 输出"时，只输出一个 JSON 对象：不要 markdown 代码块，不要前后缀说明，不要注释。
6. 后续追问用简洁中文回答（不超过 4 句），不要输出 JSON。`

export const ANALYSIS_QUESTION = `请按以下 JSON 输出多维分析，必须输出**完整**的 JSON（六个维度都写完），不要代码块，不要省略号：
{"summary":"一句话结论，不超过40字","verdict":"偏多|中性|偏空","confidence":"低|中|高","dimensions":[{"id":"technical|volume|capital|sector|news|valuation","label":"技术面|量能|资金面|板块与情绪|消息面|估值","score":0,"verdict":"偏多|中性|偏空","reason":"引用具体数字，不超过40字","risk":"不超过20字"}],"levels":{"support":0,"resistance":0,"target":"不超过20字"},"risks":["最多2条，每条不超过20字"],"disclaimer":"不构成投资建议"}`

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e8) return (value / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (value / 1e4).toFixed(2) + '万'
  return value.toFixed(0)
}

function fixed(value, digits) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(digits === undefined ? 2 : digits)
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return (value > 0 ? '+' : '') + value.toFixed(2) + '%'
}

/**
 * Render the data brief handed to the model.
 * @param {object} input Everything the analyze route collected.
 * @returns {string}
 */
export const VOLUME_LABEL = {
  shrink: '缩量',
  normal: '量能正常',
  mild: '温和放量',
  heavy: '明显放量',
  extreme: '天量',
  auction: '开盘初期（量能不可比）',
  halt: '无成交',
  limit: '涨停封板（量能不可比）',
  stagnant: '放量滞涨',
  dump: '放量下跌',
  shrinkRise: '缩量上涨',
}

export function buildBrief(input) {
  const { quote, stats, flow, boards, sentiment, market, news, announcements, limits, phase, volumeState } = input
  const lines = []
  lines.push('【标的】' + (quote && quote.name ? quote.name : '') + ' ' + (quote && quote.code ? quote.code : '') + (quote && quote.industry ? '（' + quote.industry + '）' : ''))
  lines.push(
    '【行情】现价 ' + fixed(quote && quote.price) + '（' + pct(quote && quote.pct) + '）' +
      ' 今开 ' + fixed(quote && quote.open) +
      ' 最高 ' + fixed(quote && quote.high) +
      ' 最低 ' + fixed(quote && quote.low) +
      ' 昨收 ' + fixed(quote && quote.prevClose),
  )
  lines.push(
    '【成交】成交额 ' + money(quote && quote.amount) +
      ' 成交量 ' + money(quote && quote.volume) + '手' +
      ' 换手 ' + fixed(quote && quote.turnover) + '%' +
      ' 量比 ' + fixed(quote && quote.volRatio) +
      ' 振幅 ' + fixed(stats && stats.high20 !== null && quote && quote.prevClose ? ((quote.high - quote.low) / quote.prevClose) * 100 : null) + '%',
  )
  lines.push(
    '【规模】总市值 ' + money(quote && quote.mktCap) + ' 流通市值 ' + money(quote && quote.floatCap) +
      ' 市盈率 ' + fixed(quote && quote.pe) + ' 市净率 ' + fixed(quote && quote.pb),
  )
  if (limits) lines.push('【涨跌停】涨停 ' + fixed(limits.up) + ' 跌停 ' + fixed(limits.down))
  if (stats) {
    lines.push(
      '【均线】MA5 ' + fixed(stats.ma5) + ' MA10 ' + fixed(stats.ma10) + ' MA20 ' + fixed(stats.ma20) + ' MA60 ' + fixed(stats.ma60) +
        '；MA20 斜率 ' + fixed(stats.ma20Slope) + '%；20 日乖离 ' + fixed(stats.bias20) + '%',
    )
    lines.push(
      '【区间】20 日 ' + fixed(stats.low20) + '-' + fixed(stats.high20) + '（当前分位 ' + fixed(stats.position20, 1) + '%）' +
        '；60 日 ' + fixed(stats.low60) + '-' + fixed(stats.high60) + '（' + fixed(stats.position60, 1) + '%）',
    )
    const macd = stats.macd
    lines.push(
      '【指标】MACD dif ' + fixed(macd && macd.dif, 3) + ' dea ' + fixed(macd && macd.dea, 3) + ' hist ' + fixed(macd && macd.hist, 3) +
        '；KDJ ' + fixed(stats.kdj && stats.kdj.k, 1) + '/' + fixed(stats.kdj && stats.kdj.d, 1) + '/' + fixed(stats.kdj && stats.kdj.j, 1) +
        '；RSI6 ' + fixed(stats.rsi6, 1) + ' RSI14 ' + fixed(stats.rsi14, 1),
    )
    lines.push(
      '【量能】5 日均量 ' + money(stats.avgVolume5) + '手，10 日均量 ' + money(stats.avgVolume10) + '手，今日量/5日均量 ' + fixed(stats.volumeRatio5) + ' 倍',
    )
  }
  if (volumeState !== null && volumeState !== undefined) {
    const ratio = volumeState.ratio === null || volumeState.ratio === undefined ? '—' : volumeState.ratio + ' 倍'
    lines.push(
      '【量能状态】' + (VOLUME_LABEL[volumeState.label] || volumeState.label) + '（按已交易时间折算的全日量比 ' + ratio + '，基准为前 5 日均量）',
    )
  }
  if (flow && flow.latest) {
    const latest = flow.latest
    lines.push(
      '【资金·今日】主力 ' + money(latest.main) + '，超大单 ' + money(latest.super) + '，大单 ' + money(latest.large) +
        '，中单 ' + money(latest.medium) + '，小单 ' + money(latest.small),
    )
    if (flow.history && flow.history.length > 0) {
      lines.push(
        '【资金·近几日】' + flow.history
          .map(day => day.d.slice(5) + ' ' + money(day.main))
          .join('；'),
      )
    }
  }
  if (boards && boards.length > 0) {
    lines.push('【所属板块·按涨幅】' + boards.slice(0, 8).map(board => board.name + ' ' + pct(board.pct)).join('；'))
  }
  if (sentiment) {
    lines.push(
      '【市场情绪】' + (sentiment.score === null ? '—' : sentiment.score + '/100') + '（' + (sentiment.mood || '—') + '）' +
        '，上涨 ' + (sentiment.rise === null ? '—' : sentiment.rise) + ' 家 / 下跌 ' + (sentiment.fall === null ? '—' : sentiment.fall) + ' 家' +
        '，涨停 ' + (sentiment.limitUp === null ? '—' : sentiment.limitUp) + ' / 跌停 ' + (sentiment.limitDown === null ? '—' : sentiment.limitDown) +
        '，炸板率 ' + fixed(sentiment.brokenRate, 1) + '%',
    )
  }
  if (market) lines.push('【时点】' + (market.day || '') + ' ' + (market.time || '') + ' ' + (phase || market.label || ''))
  if (news && news.length > 0) {
    lines.push('【近期新闻】' + news.slice(0, 6).map(item => item.date.slice(0, 10) + ' ' + item.title).join('；'))
  } else {
    lines.push('【近期新闻】数据不足')
  }
  if (announcements && announcements.length > 0) {
    lines.push('【公司公告】' + announcements.slice(0, 5).map(item => item.date + ' ' + item.title).join('；'))
  } else {
    lines.push('【公司公告】数据不足')
  }
  lines.push('【说明】以上为公开行情与资金流数据，缺少财报、业绩预告、机构持仓等基本面数据。')
  return lines.join('\n')
}

/**
 * Trim a streamed (or final) answer down to a JSON object, tolerating fences.
 * @param {string} text Raw model output.
 * @returns {object|null}
 */
function tryParse(source) {
  try {
    const parsed = JSON.parse(source)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Append the closers a truncated JSON fragment still needs. */
function closeFragment(source) {
  let depth = 0
  let brackets = 0
  let inString = false
  let escaped = false
  for (const character of source) {
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (character === '{') depth += 1
    else if (character === '}') depth -= 1
    else if (character === '[') brackets += 1
    else if (character === ']') brackets -= 1
  }
  return source + (inString ? '"' : '') + ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, depth))
}

/**
 * Parse the model's analysis, repairing a response cut off at the token limit.
 * A partial object is still useful: whatever dimensions finished still render.
 */
export function parseAnalysis(text) {
  if (typeof text !== 'string') return null
  let body = text.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence !== null) body = fence[1].trim()
  const start = body.indexOf('{')
  if (start === -1) return null
  const source = body.slice(start)
  const closed = source.lastIndexOf('}')
  const direct = tryParse(source) || (closed > 0 ? tryParse(source.slice(0, closed + 1)) : null)
  if (direct !== null) return direct
  // Walk back to the last structural boundary and close whatever is still open.
  const bounds = []
  for (let index = source.length - 1; index > 0 && bounds.length < 40; index -= 1) {
    if (source[index] === ',' || source[index] === '}' || source[index] === ']') bounds.push(index)
  }
  for (const bound of bounds) {
    const head = source.slice(0, source[bound] === ',' ? bound : bound + 1)
    const repaired = tryParse(closeFragment(head))
    if (repaired !== null && (Array.isArray(repaired.dimensions) || typeof repaired.summary === 'string')) return repaired
  }
  return null
}
