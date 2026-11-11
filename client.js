/**
 * A-share radar — browser half.
 *
 * A full-page dashboard in the main panel, reached from its own sidebar row:
 * index tape, market breadth, limit-up emotion, sector rotation, multi-strategy
 * stock picks, a personal watchlist and an intraday alert feed.
 *
 * Plain JS on purpose: the browser module table hands us React, and the panel
 * polls read-only Host routes under /ashare-radar/api.
 */

window.__ModuleLoader__.load({
  id: '@local/ashare-radar',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React

    const NS = 'ashare-radar'
    const PANEL_ID = 'ashare-radar'
    const API = '/ashare-radar/api'

    /** Same-origin route, relative to whatever base the page is served from. */
    function endpoint(path) {
      const relative = String(path).replace(/^\/+/, '')
      if (typeof document === 'undefined') return '/' + relative
      const url = new URL(relative, document.baseURI)
      return url.pathname + url.search
    }
    const WATCH_KEY = 'ashare-radar.watchlist.v1'
    const SPEED_KEY = 'ashare-radar.speed.v1'
    const DEFAULT_WATCH = ['600519', '300750', '000001', '601318', '002594', '000858']

    /* ---------------------------------------------------------------- *
     * Locale
     * ---------------------------------------------------------------- */

    const DICT = {
      zh: {
        'nav.title': 'A股盯盘',
        'page.title': 'A股盯盘台',
        'page.subtitle': '指数 · 情绪 · 板块轮动 · 多策略选股',
        'page.refresh': '刷新',
        'page.updated': '更新于',
        'page.speed': '刷新频率',
        'page.turnover': '两市成交',
        'speed.3': '3 秒',
        'speed.5': '5 秒',
        'speed.10': '10 秒',
        'speed.30': '30 秒',
        'speed.0': '暂停',
        'phase.open': '交易中',
        'phase.auction': '集合竞价',
        'phase.lunch': '午间休市',
        'phase.closed': '已收盘',
        'phase.pre': '未开盘',
        'phase.weekend': '周末休市',
        'sentiment.title': '市场情绪',
        'sentiment.score': '情绪分',
        'sentiment.rise': '上涨',
        'sentiment.fall': '下跌',
        'sentiment.limitUp': '涨停',
        'sentiment.limitDown': '跌停',
        'sentiment.broken': '炸板率',
        'sentiment.ladder': '连板梯队',
        'sentiment.board': '板',
        'sentiment.empty': '暂无涨跌家数数据',
        'sector.title': '推荐板块',
        'sector.industry': '行业',
        'sector.concept': '概念',
        'sector.leader': '领涨',
        'sector.flow': '主力',
        'sector.width': '涨家数',
        'sector.5d': '5日',
        'sector.empty': '板块数据加载中',
        'trend.title': '板块走势',
        'trend.today': '今天',
        'trend.empty': '该日暂无板块曲线，换一天或等开盘后再看',
        'trend.hint': '当日涨跌幅曲线，包含排名前 50 的板块；粗线为当前领先的 8 个',
        'trend.count': '个板块',
        'trend.error': '曲线加载失败',
        'trend.expand': '全屏',
        'picks.title': '推荐个股',
        'picks.subtitle': '多策略打分，标签为命中的策略规则',
        'picks.all': '全部',
        'picks.empty': '暂无符合策略的标的',
        'picks.score': '评分',
        'picks.volRatio': '量比',
        'picks.flow': '主力净额',
        'picks.turnover': '换手',
        'picks.industry': '行业',
        'watch.title': '自选盯盘',
        'watch.add': '添加代码或名称',
        'watch.search': '搜索',
        'watch.addBtn': '加自选',
        'watch.empty': '还没有自选股，输入代码或名称添加',
        'watch.remove': '移除',
        'watch.noMatch': '无匹配股票',
        'detail.trend5': '5日',
        'detail.m60': '60分',
        'detail.m30': '30分',
        'detail.m15': '15分',
        'detail.m5': '5分',
        'detail.m1': '1分',
        'detail.chart': '行情图',
        'detail.hint': '滚轮缩放 · 拖动平移 · 双击复位 · 方向键移动光标',
        'detail.noData': '暂无行情数据',
        'detail.adjust': '复权方式',
        'detail.adjustFwd': '前复权',
        'detail.adjustNone': '不复权',
        'detail.adjustBack': '后复权',
        'detail.maHint': '叠加 MA5 / MA10 / MA20',
        'detail.subNone': '无',
        'detail.wide': '放大',
        'detail.narrow': '还原',
        'positions.title': '我的持仓',
        'positions.empty': '还没有持仓，点开个股可模拟买卖',
        'positions.equity': '总资产',
        'positions.value': '市值',
        'positions.pnl': '浮盈',
        'positions.cash': '可用',
        'board.constituents': '成分股',
        'board.empty': '暂无成分股',
        'board.noConstituents': '该板块没有成分股数据（多为统计类板块）',
        'board.total': '共',
        'board.showing': '显示前',
        'board.unit': '只',
        'board.price': '现价',
        'mini.surge': '急拉',
        'mini.sink': '急跌',
        'board.sortPct': '涨幅',
        'board.sortFlow': '主力',
        'board.sortVol': '量比',
        'board.sortTurnover': '换手',
        'board.sortSpeed': '涨速',
        'board.sortCap': '市值',
        'board.hint': '点击个股查看行情',
        'detail.index': '指数',
        'detail.boards': '所属板块',
        'detail.toBoard': '查看该板块成分股',
        'ai.title': 'AI 分析',
        'ai.run': '开始分析',
        'ai.running': '正在分析…',
        'ai.intro': '基于当前行情、量能、资金、板块与消息面数据，推演未来上涨空间，并给出分维度判断。',
        'ai.ask': '追问，例如：如果放量突破前高会怎样？',
        'ai.send': '发送',
        'ai.confidence': '置信度',
        'ai.risk': '风险',
        'ai.support': '支撑',
        'ai.resistance': '压力',
        'ai.target': '目标',
        'ai.disclaimer': '以上为模型基于公开行情数据的推演，不构成投资建议。',
        'ai.truncated': '模型输出被截断，以下为原文；可点“开始分析”重试。',
        'news.title': '消息面',
        'news.latest': '最新新闻',
        'news.announcements': '公司公告',
        'news.empty': '暂无消息',
        'detail.watch': '加自选',
        'detail.unwatch': '取消自选',
        'detail.watchFull': '自选已满 30 只',
        'detail.noTrade': '指数不支持模拟交易',
        'detail.dataAt': '数据',
        'detail.scoreHint': '策略评分：命中规则的加权和，0-100',
        'sector.hint': '点击查看成分股',
        'tape.hint': '点击查看指数行情',
        'vol.title': '量能',
        'vol.shrink': '缩量',
        'vol.normal': '正常',
        'vol.mild': '温和放量',
        'vol.heavy': '明显放量',
        'vol.extreme': '天量',
        'vol.auction': '开盘初期',
        'vol.halt': '无成交',
        'vol.limit': '涨停封板',
        'vol.stagnant': '放量滞涨',
        'vol.dump': '放量下跌',
        'vol.shrinkRise': '缩量上涨',
        'book.title': '盘口',
        'book.open': '今开',
        'book.high': '最高',
        'book.low': '最低',
        'book.prev': '昨收',
        'book.limitUp': '涨停',
        'book.limitDown': '跌停',
        'book.amplitude': '振幅',
        'book.turnover': '换手',
        'book.volume': '成交量',
        'book.amount': '成交额',
        'book.volRatio': '量比',
        'book.avgVol5': '5日均量',
        'book.mktCap': '总市值',
        'book.floatCap': '流通市值',
        'book.pe': '市盈率',
        'book.pb': '市净率',
        'book.lot': '手',
        'book.loss': '亏损',
        'flow.title': '资金流向',
        'flow.main': '主力净额',
        'flow.super': '超大单',
        'flow.large': '大单',
        'flow.medium': '中单',
        'flow.small': '小单',
        'flow.signed': '净额',
        'flow.intraday': '今日累计',
        'flow.history': '近 5 日主力',
        'flow.empty': '暂无资金流数据',
        'tech.title': '技术面',
        'tech.bull': '多头排列',
        'tech.bear': '空头排列',
        'tech.mixed': '均线交织',
        'tech.goldenCross': '金叉',
        'tech.deadCross': '死叉',
        'tech.neutral': '中性',
        'tech.overbought': '超买',
        'tech.oversold': '超卖',
        'tech.range20': '20 日区间',
        'tech.range60': '60 日区间',
        'tech.position': '位置',
        'tech.empty': '暂无技术数据',
        'detail.trend': '分时',
        'detail.day': '日K',
        'detail.week': '周K',
        'detail.month': '月K',
        'detail.price': '最新价',
        'detail.avg': '均价',
        'detail.volRatio': '量比',
        'detail.turnoverRate': '换手',
        'detail.flow': '主力净额',
        'detail.pe': '市盈率',
        'detail.pb': '市净率',
        'detail.cap': '总市值',
        'detail.close': '关闭',
        'detail.turnover': '成交额',
        'detail.noTrend': '暂无分时数据',
        'detail.noBars': '暂无 K 线数据',
        'detail.staleBars': '行情源暂不可用，显示最近一次缓存的 K 线',
        'trade.cash': '可用',
        'trade.position': '持仓',
        'trade.cost': '成本',
        'trade.float': '浮盈',
        'trade.realized': '已实现',
        'trade.qty': '股数',
        'trade.buy': '买入',
        'trade.sell': '卖出',
        'trade.hint': '按最新价模拟成交，不接券商',
        'trade.lot': 'A 股以 100 股为一手',
        'trade.needCash': '可用资金不足',
        'trade.needStock': '持仓不足',
        'trade.badQty': '请输入有效股数',
        'alert.title': '盘中异动',
        'alert.empty': '暂无异动，行情变化会出现在这里',
        'alert.prime': '已开始盯盘',
        'strategy.title': '策略分布',
        'strategy.hit': '命中',
        'footer.source': '数据来源',
        'footer.disclaimer': '策略信号由公开行情实时计算，仅用于研究与观察，不构成投资建议。',
        'error.title': '行情获取失败',
        'error.retry': '重试',
        'loading': '正在加载行情…',
        'tag.trend': '均线趋势',
        'tag.breakout': '放量突破',
        'tag.momentum': '动量强势',
        'tag.capital': '主力吸筹',
        'tag.oversold': '超跌反弹',
        'tag.limit': '涨停接力',
        'tag.value': '低估值',
        'tag.rotation': '板块风口',
        'tag.broad': '普涨',
        'tag.hot': '强势',
      },
      en: {
        'nav.title': 'A-share radar',
        'page.title': 'A-share radar',
        'page.subtitle': 'Indices · breadth · rotation · multi-strategy picks',
        'page.refresh': 'Refresh',
        'page.updated': 'Updated',
        'page.speed': 'Refresh rate',
        'page.turnover': 'Turnover',
        'speed.3': '3s',
        'speed.5': '5s',
        'speed.10': '10s',
        'speed.30': '30s',
        'speed.0': 'Paused',
        'phase.open': 'Open',
        'phase.auction': 'Call auction',
        'phase.lunch': 'Lunch break',
        'phase.closed': 'Closed',
        'phase.pre': 'Pre-open',
        'phase.weekend': 'Weekend',
        'sentiment.title': 'Market breadth',
        'sentiment.score': 'Mood',
        'sentiment.rise': 'Advancing',
        'sentiment.fall': 'Declining',
        'sentiment.limitUp': 'Limit up',
        'sentiment.limitDown': 'Limit down',
        'sentiment.broken': 'Broken board',
        'sentiment.ladder': 'Limit-up ladder',
        'sentiment.board': 'x',
        'sentiment.empty': 'No breadth data yet',
        'sector.title': 'Recommended sectors',
        'sector.industry': 'Industry',
        'sector.concept': 'Theme',
        'sector.leader': 'Leader',
        'sector.flow': 'Net inflow',
        'sector.width': 'Advancing',
        'sector.5d': '5d',
        'sector.empty': 'Loading sectors',
        'trend.title': 'Sector trend',
        'trend.today': 'Today',
        'trend.empty': 'No sector curve stored for this day yet',
        'trend.hint': 'Intraday change for the top 50 sectors; the eight leaders are drawn bolder',
        'trend.count': 'sectors',
        'trend.error': 'Curve request failed',
        'trend.expand': 'Fullscreen',
        'picks.title': 'Recommended stocks',
        'picks.subtitle': 'Scored by strategy rules; tags name the rules that fired',
        'picks.all': 'All',
        'picks.empty': 'No stock matched the strategies',
        'picks.score': 'Score',
        'picks.volRatio': 'Vol ratio',
        'picks.flow': 'Net flow',
        'picks.turnover': 'Turnover',
        'picks.industry': 'Sector',
        'watch.title': 'Watchlist',
        'watch.add': 'Add by code or name',
        'watch.search': 'Search',
        'watch.addBtn': 'Add',
        'watch.empty': 'No stocks yet — add a code or name',
        'watch.remove': 'Remove',
        'watch.noMatch': 'No match',
        'detail.trend5': '5-day',
        'detail.m60': '60m',
        'detail.m30': '30m',
        'detail.m15': '15m',
        'detail.m5': '5m',
        'detail.m1': '1m',
        'detail.chart': 'Price chart',
        'detail.hint': 'Wheel to zoom · drag to pan · double-click to reset · arrows to walk the crosshair',
        'detail.noData': 'No chart data yet',
        'detail.adjust': 'Adjustment',
        'detail.adjustFwd': 'Forward',
        'detail.adjustNone': 'None',
        'detail.adjustBack': 'Backward',
        'detail.maHint': 'Overlay MA5 / MA10 / MA20',
        'detail.subNone': 'None',
        'detail.wide': 'Expand',
        'detail.narrow': 'Shrink',
        'positions.title': 'Positions',
        'positions.empty': 'No positions yet — open a stock to paper trade',
        'positions.equity': 'Equity',
        'positions.value': 'Value',
        'positions.pnl': 'P/L',
        'positions.cash': 'Cash',
        'board.constituents': 'Constituents',
        'board.empty': 'No constituents',
        'board.noConstituents': 'No constituents for this board (usually a computed board)',
        'board.total': '',
        'board.showing': 'showing',
        'board.unit': 'stocks',
        'board.price': 'Last',
        'mini.surge': 'Surge',
        'mini.sink': 'Plunge',
        'board.sortPct': 'Change',
        'board.sortFlow': 'Net flow',
        'board.sortVol': 'Vol ratio',
        'board.sortTurnover': 'Turnover',
        'board.sortSpeed': 'Speed',
        'board.sortCap': 'Cap',
        'board.hint': 'Click a stock for its chart',
        'detail.index': 'Index',
        'detail.boards': 'Sectors',
        'detail.toBoard': 'Open this sector',
        'ai.title': 'AI analysis',
        'ai.run': 'Run analysis',
        'ai.running': 'Analysing…',
        'ai.intro': 'Uses the current quote, volume, money flow, sectors and headlines to argue the upside case across six dimensions.',
        'ai.ask': 'Ask a follow-up, e.g. what if it breaks the prior high on volume?',
        'ai.send': 'Send',
        'ai.confidence': 'Confidence',
        'ai.risk': 'Risk',
        'ai.support': 'Support',
        'ai.resistance': 'Resistance',
        'ai.target': 'Target',
        'ai.disclaimer': 'Model reasoning over public quote data — not investment advice.',
        'ai.truncated': 'The response was cut off at the token limit; raw text shown — run the analysis again to retry.',
        'news.title': 'News',
        'news.latest': 'Headlines',
        'news.announcements': 'Filings',
        'news.empty': 'No news yet',
        'detail.watch': 'Add',
        'detail.unwatch': 'Remove',
        'detail.watchFull': 'Watchlist is full (30)',
        'detail.noTrade': 'Indices cannot be paper traded',
        'detail.dataAt': 'Data',
        'detail.scoreHint': 'Strategy score: weighted sum of matched rules, 0-100',
        'sector.hint': 'Click for constituents',
        'tape.hint': 'Click for the index chart',
        'vol.title': 'Volume',
        'vol.shrink': 'Shrinking',
        'vol.normal': 'Normal',
        'vol.mild': 'Mild pickup',
        'vol.heavy': 'Heavy',
        'vol.extreme': 'Climax',
        'vol.auction': 'Just opened',
        'vol.halt': 'No trades',
        'vol.limit': 'Limit locked',
        'vol.stagnant': 'Heavy, no progress',
        'vol.dump': 'Heavy selling',
        'vol.shrinkRise': 'Thin rally',
        'book.title': 'Quote book',
        'book.open': 'Open',
        'book.high': 'High',
        'book.low': 'Low',
        'book.prev': 'Prev close',
        'book.limitUp': 'Limit up',
        'book.limitDown': 'Limit down',
        'book.amplitude': 'Amplitude',
        'book.turnover': 'Turnover',
        'book.volume': 'Volume',
        'book.amount': 'Value',
        'book.volRatio': 'Vol ratio',
        'book.avgVol5': '5d avg vol',
        'book.mktCap': 'Market cap',
        'book.floatCap': 'Float cap',
        'book.pe': 'P/E',
        'book.pb': 'P/B',
        'book.lot': ' lots',
        'book.loss': 'Loss',
        'flow.title': 'Money flow',
        'flow.main': 'Main net',
        'flow.super': 'Super',
        'flow.large': 'Large',
        'flow.medium': 'Medium',
        'flow.small': 'Small',
        'flow.signed': 'Net',
        'flow.intraday': 'Intraday cumulative',
        'flow.history': 'Last 5 sessions',
        'flow.empty': 'No money-flow data',
        'tech.title': 'Technicals',
        'tech.bull': 'Bullish stack',
        'tech.bear': 'Bearish stack',
        'tech.mixed': 'Interleaved MAs',
        'tech.goldenCross': 'Golden cross',
        'tech.deadCross': 'Dead cross',
        'tech.neutral': 'Neutral',
        'tech.overbought': 'Overbought',
        'tech.oversold': 'Oversold',
        'tech.range20': '20-day range',
        'tech.range60': '60-day range',
        'tech.position': 'Position',
        'tech.empty': 'No technical data',
        'detail.trend': 'Intraday',
        'detail.day': 'Daily',
        'detail.week': 'Weekly',
        'detail.month': 'Monthly',
        'detail.price': 'Last',
        'detail.avg': 'Avg',
        'detail.volRatio': 'Vol ratio',
        'detail.turnoverRate': 'Turnover',
        'detail.flow': 'Net flow',
        'detail.pe': 'P/E',
        'detail.pb': 'P/B',
        'detail.cap': 'Market cap',
        'detail.close': 'Close',
        'detail.turnover': 'Turnover value',
        'detail.noTrend': 'No intraday data',
        'detail.noBars': 'No candles yet',
        'detail.staleBars': 'Quote source unreachable — showing the last cached candles',
        'trade.cash': 'Cash',
        'trade.position': 'Position',
        'trade.cost': 'Cost',
        'trade.float': 'P/L',
        'trade.realized': 'Realized',
        'trade.qty': 'Shares',
        'trade.buy': 'Buy',
        'trade.sell': 'Sell',
        'trade.hint': 'Fills at the last price — paper only',
        'trade.lot': 'A-shares trade in 100-share lots',
        'trade.needCash': 'Not enough cash',
        'trade.needStock': 'Not enough shares',
        'trade.badQty': 'Enter a valid share count',
        'alert.title': 'Intraday alerts',
        'alert.empty': 'Alerts appear here as the tape moves',
        'alert.prime': 'Monitoring started',
        'strategy.title': 'Strategy mix',
        'strategy.hit': 'hits',
        'footer.source': 'Source',
        'footer.disclaimer': 'Strategy signals are computed from public quotes for research only; not investment advice.',
        'error.title': 'Quote feed failed',
        'error.retry': 'Retry',
        'loading': 'Loading quotes…',
        'tag.trend': 'Uptrend',
        'tag.breakout': 'Breakout',
        'tag.momentum': 'Momentum',
        'tag.capital': 'Smart money',
        'tag.oversold': 'Oversold',
        'tag.limit': 'Limit up',
        'tag.value': 'Value',
        'tag.rotation': 'Sector tailwind',
        'tag.broad': 'Broad',
        'tag.hot': 'Hot',
      },
    }

    /* ---------------------------------------------------------------- *
     * Formatting helpers
     * ---------------------------------------------------------------- */

    function yi(value, digits) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      const d = digits === undefined ? 2 : digits
      const abs = Math.abs(value)
      if (abs >= 1e8) return (value / 1e8).toFixed(d) + '亿'
      if (abs >= 1e4) return (value / 1e4).toFixed(d) + '万'
      return value.toFixed(d)
    }

    function price(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      return value.toFixed(2)
    }

    function pctText(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      return (value > 0 ? '+' : '') + value.toFixed(2) + '%'
    }

    function toneOf(value) {
      if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'ar-flat'
      return value > 0 ? 'ar-up' : 'ar-down'
    }

    function bigMoney(value) {
      if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '—'
      if (value >= 1e12) return (value / 1e12).toFixed(2) + '万亿'
      return Math.round(value / 1e8) + '亿'
    }

    function clockText(ms) {
      const date = new Date(ms)
      const pad = number => String(number).padStart(2, '0')
      return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
    }

    function loadWatch() {
      try {
        const raw = window.localStorage.getItem(WATCH_KEY)
        if (raw === null) return DEFAULT_WATCH.slice()
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return DEFAULT_WATCH.slice()
        const codes = parsed.filter(item => typeof item === 'string' && /^\d{6}$/.test(item)).slice(0, 30)
        return codes.length > 0 ? codes : DEFAULT_WATCH.slice()
      } catch {
        return DEFAULT_WATCH.slice()
      }
    }

    function loadSpeed() {
      try {
        const raw = window.localStorage.getItem(SPEED_KEY)
        const parsed = raw === null ? 5000 : Number(raw)
        return [0, 3000, 5000, 10000, 30000].indexOf(parsed) === -1 ? 5000 : parsed
      } catch {
        return 5000
      }
    }

    function persist(key, value) {
      try {
        window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
      } catch {
        /* storage is optional */
      }
    }

    function price2(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      return value.toFixed(2)
    }

    function secidOf(code) {
      return /^[569]/.test(code) ? '1.' + code : '0.' + code
    }

    /* ---------------------------------------------------------------- *
     * Paper account (local only — no broker connection)
     * ---------------------------------------------------------------- */

    const ACCOUNT_KEY = 'ashare-radar.account.v1'
    const INITIAL_CASH = 1000000

    function freshAccount() {
      return { cash: INITIAL_CASH, positions: {}, trades: [], realized: 0 }
    }

    function loadAccount() {
      try {
        const raw = window.localStorage.getItem(ACCOUNT_KEY)
        if (raw === null) return freshAccount()
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return freshAccount()
        return {
          cash: typeof parsed.cash === 'number' ? parsed.cash : INITIAL_CASH,
          positions: parsed.positions !== null && typeof parsed.positions === 'object' ? parsed.positions : {},
          trades: Array.isArray(parsed.trades) ? parsed.trades.slice(0, 60) : [],
          realized: typeof parsed.realized === 'number' ? parsed.realized : 0,
        }
      } catch {
        return freshAccount()
      }
    }

    /* ---------------------------------------------------------------- *
     * Detail data: Host route first, direct quote feed as the fallback
     * ---------------------------------------------------------------- */

    const DIRECT_KLT = { day: '101', week: '102', month: '103', m60: '60', m30: '30', m15: '15', m5: '5', m1: '1' }

    function parseTrend(rows) {
      if (!Array.isArray(rows)) return []
      const points = []
      for (const line of rows) {
        const part = String(line).split(',')
        const value = Number(part[2])
        if (!Number.isFinite(value)) continue
        const stamp = String(part[0] || '')
        points.push({ t: stamp.slice(11, 16), d: stamp.slice(5, 10), price: value, avg: Number(part[7]), volume: Number(part[5]) })
      }
      return points
    }

    function parseBars(rows) {
      if (!Array.isArray(rows)) return []
      const bars = []
      for (const line of rows) {
        const part = String(line).split(',')
        const close = Number(part[2])
        if (!Number.isFinite(close)) continue
        bars.push({ d: part[0], o: Number(part[1]), c: close, h: Number(part[3]), l: Number(part[4]), v: Number(part[5]), a: Number(part[6]), p: Number(part[8]) })
      }
      return bars
    }

    async function fetchDirectDetail(code, period, adjust, signal, exactSecid, isIndex) {
      const secid = exactSecid === undefined || exactSecid === null ? secidOf(code) : exactSecid
      const isTrend = period === 'trend' || period === 'trend5'
      const days = period === 'trend5' ? 5 : 1
      const trendUrl =
        'https://' + (days > 1 ? 'push2his' : 'push2') +
        '.eastmoney.com/api/qt/stock/trends2/get?secid=' + secid +
        '&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=' + days + '&iscr=0'
      const klineUrl =
        'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + secid +
        '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=' +
        (DIRECT_KLT[period] || '101') + '&fqt=' + adjust + '&end=20500101&lmt=' + (period.indexOf('m') === 0 ? 240 : 160)
      const [trendBody, klineBody] = await Promise.all([
        isTrend ? fetch(trendUrl, { signal }).then(response => response.json()).catch(() => null) : Promise.resolve(null),
        isTrend ? Promise.resolve(null) : fetch(klineUrl, { signal }).then(response => response.json()).catch(() => null),
      ])
      const trendData = trendBody && trendBody.data
      const klineData = klineBody && klineBody.data
      const points = parseTrend(trendData && trendData.trends)
      const bars = parseBars(klineData && klineData.klines)
      const prevClose = trendData ? Number(trendData.preClose) : null
      if (isTrend && points.length === 0) throw new Error('行情接口未返回数据')
      if (!isTrend && bars.length === 0) throw new Error('行情接口未返回数据')
      return {
        period,
        adjust,
        trend: isTrend ? { prevClose: Number.isFinite(prevClose) ? prevClose : null, points } : null,
        bars,
        limits: isTrend && isIndex !== true ? clientLimits(code, '', Number.isFinite(prevClose) ? prevClose : null) : null,
        market: { trading: false },
        quote: null,
      }
    }

    async function loadDetail(code, period, adjust, fresh, signal, exactSecid, isIndex) {
      try {
        const target =
          API +
          '/detail?code=' +
          code +
          '&period=' +
          period +
          '&adjust=' +
          adjust +
          '&fresh=' +
          (fresh ? 1 : 0) +
          (exactSecid === undefined || exactSecid === null ? '' : '&secid=' + encodeURIComponent(exactSecid)) +
          (isIndex === true ? '&kind=index' : '')
        const response = await fetch(endpoint(target), { cache: 'no-store', signal })
        if (response.ok) {
          const body = await response.json()
          if (body !== null && typeof body === 'object' && (body.trend || Array.isArray(body.bars))) return body
        }
      } catch (cause) {
        if (cause && cause.name === 'AbortError') throw cause
      }
      return fetchDirectDetail(code, period, adjust, signal, exactSecid, isIndex)
    }

    /* ---------------------------------------------------------------- *
     * Styles (theme tokens only)
     * ---------------------------------------------------------------- */

    const CSS = `
:root{
  --ar-up:#8b5cf6;
  --ar-down:#c2410c;
  --ar-up-fill:#7c3aed;
  --ar-down-fill:#c2410c;
}
@media (prefers-color-scheme: dark){
  :root{--ar-up:#a78bfa;--ar-down:#fb923c;--ar-up-fill:#6d28d9;--ar-down-fill:#9a3412}
}
.ar-page{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45}
.ar-page *{box-sizing:border-box}
.ar-head{position:sticky;top:0;z-index:3;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);padding:14px 20px 10px}
.ar-head-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ar-brand{display:flex;align-items:center;gap:10px;min-width:0}
.ar-brand h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}
.ar-brand p{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ar-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.ar-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ar-pill .ar-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.ar-pill.ar-live .ar-dot{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 24%,transparent)}
.ar-select,.ar-btn{height:25px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;padding:0 8px;cursor:pointer;font-family:inherit}
.ar-btn:hover,.ar-select:hover{border-color:var(--dsw-alias-border-l2)}
.ar-select:disabled{opacity:.45;cursor:not-allowed}
.ar-btn.ar-primary{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:600}
.ar-btn.ar-primary:hover{opacity:.85;border-color:transparent}
.ar-btn:disabled{opacity:.45;cursor:not-allowed}
.ar-tape{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}
.ar-tape-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:8px 10px;min-width:0;cursor:pointer;transition:border-color .12s}
.ar-tape-card:hover{border-color:var(--dsw-alias-border-l2)}
.ar-tape-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ar-tape-name{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-tape-price{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:1px}
.ar-tape-chg{font-size:11.5px;font-variant-numeric:tabular-nums}
.ar-body{display:grid;grid-template-columns:minmax(0,1fr) 332px;gap:14px;padding:14px 20px 26px;align-items:start}
.ar-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.ar-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 14px}
.ar-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.ar-card-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px}
.ar-card-note{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.ar-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;overflow:hidden}
.ar-seg button{height:24px;padding:0 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;font-family:inherit}
.ar-seg button.ar-on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.ar-senti{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:center}
.ar-gauge{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:92px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.ar-gauge strong{font-size:24px;font-variant-numeric:tabular-nums;line-height:1}
.ar-gauge span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.ar-gauge em{font-style:normal;font-size:12px;font-weight:600}
.ar-breadth-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);margin:6px 0 6px}
.ar-breadth-bar i{display:block;height:100%}
.ar-breadth-bar i.ar-up{background:var(--ar-up)}
.ar-breadth-bar i.ar-down{background:var(--ar-down)}
.ar-senti-stats{display:flex;gap:14px;flex-wrap:wrap}
.ar-stat{display:flex;flex-direction:column;gap:1px;min-width:54px}
.ar-stat b{font-size:14px;font-variant-numeric:tabular-nums}
.ar-stat span{font-size:11px;color:var(--dsw-alias-label-secondary)}
.ar-spark{width:100%;height:34px;display:block;margin-top:6px}
.ar-sectors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.ar-sector{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:7px 0;border-bottom:1px dashed var(--dsw-alias-border-l1)}
.ar-sector:last-child,.ar-sector:nth-last-child(2){border-bottom:0}
.ar-sector-name{display:flex;align-items:center;gap:6px;min-width:0}
.ar-sector-name b{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-sector-name em{font-style:normal;font-size:10.5px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:0 4px}
.ar-sector-pct{font-size:13px;font-variant-numeric:tabular-nums;font-weight:600}
.ar-sector-meta{grid-column:1 / -1;display:flex;gap:10px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.ar-meter{height:3px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin-top:4px}
.ar-meter i{display:block;height:100%;background:var(--dsw-alias-brand-primary)}
.ar-strategy-row{display:flex;gap:6px;flex-wrap:wrap}
.ar-chip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;font-family:inherit}
.ar-chip.ar-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.ar-chip b{font-weight:600;color:var(--dsw-alias-label-primary)}
.ar-chip .ar-chip-pct{font-style:normal;font-variant-numeric:tabular-nums;font-weight:600;font-size:10.5px}
.ar-chip .ar-chip-pct.ar-up{color:var(--ar-up)}
.ar-chip .ar-chip-pct.ar-down{color:var(--ar-down)}
.ar-chip .ar-chip-pct.ar-flat{color:var(--dsw-alias-label-secondary)}
.ar-pick{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:10px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ar-pick:last-child{border-bottom:0;padding-bottom:2px}
.ar-pick-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.ar-pick-name{font-weight:600;font-size:13.5px}
.ar-pick-code{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ar-pick-sector{font-size:11px;color:var(--dsw-alias-label-secondary)}
.ar-tag{display:inline-flex;align-items:center;height:19px;padding:0 6px;border-radius:5px;font-size:10.5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1)}
.ar-reasons{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.ar-reasons li{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;gap:6px}
.ar-reasons li::before{content:'·';color:var(--dsw-alias-brand-primary);font-weight:700}
.ar-pick-side{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.ar-score{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:22px;border-radius:6px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-label-primary)}
.ar-pick-metrics{display:flex;gap:9px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap;margin-top:4px}
.ar-side{display:flex;flex-direction:column;gap:14px;min-width:0}
.ar-search{display:flex;gap:6px;margin-bottom:8px}
.ar-input{flex:1;min-width:0;height:28px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:0 8px;font-family:inherit}
.ar-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.ar-results{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;margin-bottom:8px;background:var(--dsw-alias-bg-layer-2)}
.ar-result{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:12px;cursor:pointer;border:0;background:transparent;width:100%;color:var(--dsw-alias-label-primary);font-family:inherit;text-align:left}
.ar-result:hover{background:var(--dsw-alias-bg-layer-1)}
.ar-result span{color:var(--dsw-alias-label-secondary);font-size:11px}
.ar-watch-row{display:grid;grid-template-columns:minmax(0,1fr) 72px auto;gap:2px 8px;padding:7px 0;border-bottom:1px dashed var(--dsw-alias-border-l1);align-items:center}
.ar-watch-row:last-child{border-bottom:0}
.ar-watch-name{display:flex;align-items:center;gap:6px;min-width:0}
.ar-watch-name b{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-watch-name span{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ar-watch-price{text-align:right;font-variant-numeric:tabular-nums}
.ar-watch-price b{font-size:13px;display:block}
.ar-watch-price i{font-style:normal;font-size:11px}
.ar-watch-meta{grid-column:1 / -1;display:flex;gap:9px;align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.ar-flag{display:inline-flex;align-items:center;height:17px;padding:0 5px;border-radius:4px;font-size:10px;border:1px solid transparent}
.ar-flag.ar-up{color:var(--ar-up);background:color-mix(in srgb,var(--ar-up) 12%,transparent)}
.ar-flag.ar-down{color:var(--ar-down);background:color-mix(in srgb,var(--ar-down) 12%,transparent)}
.ar-flag.ar-warn{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent)}
.ar-remove{width:18px;height:18px;border-radius:5px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1;cursor:pointer;padding:0;font-family:inherit}
.ar-remove:hover{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.ar-alert{display:flex;gap:8px;padding:6px 0;border-bottom:1px dashed var(--dsw-alias-border-l1);font-size:11.5px}
.ar-alert:last-child{border-bottom:0}
.ar-alert time{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none}
.ar-alert b{font-weight:600}
.ar-alert i{font-style:normal;color:var(--dsw-alias-label-secondary)}
.ar-empty{padding:14px 4px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ar-skeleton{height:60px;border-radius:10px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-1),var(--dsw-alias-bg-layer-2));background-size:200% 100%;animation:ar-shimmer 1.4s ease-in-out infinite}
@keyframes ar-shimmer{0%{background-position:120% 0}100%{background-position:-20% 0}}
.ar-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;margin:0 20px;border-radius:8px;border:1px solid var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);font-size:12px}
.ar-foot{padding:0 20px 20px;font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;gap:12px;flex-wrap:wrap}
.ar-up{color:var(--ar-up)}
.ar-down{color:var(--ar-down)}
.ar-flat{color:var(--dsw-alias-label-secondary)}
.ar-pick{cursor:pointer}
.ar-pick:hover .ar-pick-name{color:var(--dsw-alias-brand-primary)}
.ar-watch-row{cursor:pointer}
.ar-watch-row:hover .ar-watch-name b{color:var(--dsw-alias-brand-primary)}
.ar-mini{display:inline-flex;align-items:center;justify-content:center;flex:none;overflow:hidden}
.ar-mini svg{display:block;overflow:visible}
.ar-pick-side .ar-mini{margin-bottom:2px}
.ar-held{display:inline-flex;align-items:center;height:17px;padding:0 5px;border-radius:4px;font-size:10px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}
.ar-modal-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:28px;background:color-mix(in srgb,#000 46%,transparent)}
.ar-modal{width:min(1180px,100%);max-height:92vh;overflow:auto;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 24px 60px color-mix(in srgb,#000 40%,transparent)}
.ar-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);position:sticky;top:0;background:var(--dsw-alias-bg-base);z-index:2}
.ar-modal-title{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.ar-modal-title h2{margin:0;font-size:17px;font-weight:600}
.ar-modal-title span{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ar-modal-price{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.ar-modal-price b{font-size:22px;font-variant-numeric:tabular-nums}
.ar-modal-price i{font-style:normal;font-size:13px;font-variant-numeric:tabular-nums}
.ar-modal-actions{display:flex;align-items:center;gap:8px;flex:none}
.ar-industry{border-color:var(--dsw-alias-border-l2);font-weight:600}
.ar-ai{display:flex;flex-direction:column;gap:8px}
.ar-ai-intro{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.ar-ai-intro p{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.ar-ai-user{align-self:flex-end;max-width:86%;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:6px 10px;font-size:12px}
.ar-ai-answer{font-size:12px;line-height:1.6;white-space:pre-wrap}
.ar-ai-live{display:flex;flex-direction:column;gap:4px}
.ar-ai-status{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.ar-ai-fallback{display:flex;flex-direction:column;gap:4px}
.ar-ai-raw{margin:0;max-height:160px;overflow:auto;font-size:11px;line-height:1.5;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px}
.ar-ai-result{display:flex;flex-direction:column;gap:8px}
.ar-ai-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ar-ai-summary p{margin:0;font-size:12.5px;font-weight:600;flex:1 1 auto;min-width:160px}
.ar-ai-verdict{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:6px;font-size:11.5px;font-weight:600;border:1px solid currentColor}
.ar-ai-dims{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ar-ai-dim{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 9px;background:var(--dsw-alias-bg-layer-1);min-width:0}
.ar-ai-dim-head{display:flex;align-items:baseline;gap:6px;font-size:11.5px}
.ar-ai-dim-head b{font-weight:600;flex:1;min-width:0}
.ar-ai-dim-head em{font-style:normal;font-variant-numeric:tabular-nums;font-weight:700;font-size:12.5px}
.ar-ai-dim p{margin:4px 0 0;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.ar-ai-dim p.ar-ai-risk{color:var(--dsw-alias-state-warn-primary)}
.ar-ai-levels{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.ar-ai-input{display:flex;gap:6px}
@media (max-width:840px){.ar-ai-dims{grid-template-columns:minmax(0,1fr)}}
.ar-news-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.ar-news-col{min-width:0;display:flex;flex-direction:column;gap:2px}
.ar-news-item{display:flex;flex-direction:column;gap:1px;padding:4px 0;border-bottom:1px dashed var(--dsw-alias-border-l1);text-decoration:none;color:inherit}
.ar-news-item:hover .ar-news-title{text-decoration:underline}
.ar-news-title{font-size:11.5px;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ar-news-meta{font-size:10px;color:var(--dsw-alias-label-secondary)}
@media (max-width:840px){.ar-news-cols{grid-template-columns:minmax(0,1fr)}}
.ar-watch-toggle{height:26px;border-radius:7px;padding:0 10px;font-size:12px;white-space:nowrap}
.ar-watch-toggle.ar-on{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);font-weight:600}
.ar-close{width:26px;height:26px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;cursor:pointer;font-family:inherit}
.ar-close:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.ar-modal-body{padding:12px 18px 18px;display:flex;flex-direction:column;gap:14px}
.ar-chart-tabs{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ar-modal.ar-wide{width:min(96vw,1440px)}
.ar-board-modal{width:min(780px,100%)}
.ar-board{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:auto;max-height:min(58vh,540px)}
.ar-board-row{display:grid;grid-template-columns:minmax(0,1fr) 78px 76px 68px 58px 92px;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;font-variant-numeric:tabular-nums}
.ar-board-row:last-child{border-bottom:0}
.ar-board-row:not(.ar-board-head){cursor:pointer}
.ar-board-row:not(.ar-board-head):hover{background:var(--dsw-alias-bg-layer-2)}
.ar-board-head{font-size:10.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);position:sticky;top:0;z-index:1}
.ar-board-name{display:flex;align-items:center;gap:6px;min-width:0}
.ar-board-name b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-board-name i{font-style:normal;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.ar-board-row > span:not(.ar-board-name),.ar-board-head > span:not(:first-child){text-align:right}
.ar-chart-holder{position:relative;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.ar-canvas{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;outline:none}
.ar-canvas:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}
.ar-chart-hint{position:absolute;right:64px;bottom:23px;font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.6;pointer-events:none;white-space:nowrap}
.ar-chart-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ar-periods{display:flex;gap:3px;overflow-x:auto;max-width:100%;padding-bottom:2px;scrollbar-width:none}
.ar-periods::-webkit-scrollbar{display:none}
.ar-period{height:25px;padding:0 9px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;cursor:pointer;white-space:nowrap;font-family:inherit}
.ar-period:hover{color:var(--dsw-alias-label-primary)}
.ar-period.ar-on{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.ar-chart-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ar-legend{display:flex;gap:10px;font-size:10.5px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.ar-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.ar-trend-chart{width:100%;height:auto;display:block;margin-top:2px}
.ar-trend-reveal{transform-box:fill-box;transform-origin:0 0;animation:ar-trend-wipe 820ms cubic-bezier(.25,.7,.35,1) both}
@keyframes ar-trend-wipe{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.ar-trend-label{animation:ar-trend-fade 260ms ease-out 640ms both}
@keyframes ar-trend-fade{from{opacity:0}to{opacity:1}}
.ar-trend-card-body{cursor:zoom-in}
.ar-trend-legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}
.ar-trend-item{display:inline-flex;align-items:center;gap:5px}
.ar-trend-item i{width:8px;height:8px;border-radius:2px;display:inline-block}
.ar-trend-item b{font-weight:600;color:var(--dsw-alias-label-primary)}
.ar-trend-item em{font-style:normal;font-variant-numeric:tabular-nums}
.ar-detail-panels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.ar-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:11px 12px;background:var(--dsw-alias-bg-layer-1);min-width:0}
.ar-panel h3{margin:0 0 8px;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px}
.ar-book{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 10px}
.ar-book-cell{display:flex;flex-direction:column;gap:1px;min-width:0}
.ar-book-cell span{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ar-book-cell b{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.ar-flow-main{font-size:14px}
.ar-flow-legend{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary);margin:4px 0 2px}
.ar-flow-row{display:grid;grid-template-columns:52px minmax(0,1fr) 86px;gap:8px;align-items:center;font-size:11.5px;padding:2px 0}
.ar-flow-row > span:last-child{text-align:right;font-variant-numeric:tabular-nums}
.ar-flow-track{position:relative;height:7px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.ar-flow-track i{position:absolute;top:0;bottom:0;border-radius:4px}
.ar-flow-track i.ar-up{background:var(--ar-up)}
.ar-flow-track i.ar-down{background:var(--ar-down)}
.ar-flow-track::after{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--dsw-alias-border-l2)}
.ar-flow-block{margin-top:8px}
.ar-flow-curve{width:100%;height:44px;display:block}
.ar-flow-day{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);padding:2px 0;font-variant-numeric:tabular-nums}
.ar-tech-mas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px}
.ar-tech-ma{display:flex;justify-content:space-between;font-size:11.5px;font-variant-numeric:tabular-nums}
.ar-tech-ma span{color:var(--dsw-alias-label-secondary)}
.ar-tech-chips{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}
.ar-tech-range{margin-top:6px}
.ar-range{position:relative;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);margin:4px 0 2px}
.ar-range i{position:absolute;top:-3px;width:2px;height:12px;border-radius:1px;background:var(--dsw-alias-label-primary)}
@media (max-width:840px){.ar-detail-panels{grid-template-columns:minmax(0,1fr)}.ar-book{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ar-trade{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:12px 12px 10px;background:var(--dsw-alias-bg-layer-1)}
.ar-trade-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
.ar-trade-row .ar-input{width:120px;flex:none;text-align:right;font-variant-numeric:tabular-nums}
.ar-trade-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.ar-trade-meta b{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-weight:600}
.ar-buy{background:var(--ar-up-fill);border-color:transparent;color:#fff;font-weight:600}
.ar-sell{background:var(--ar-down-fill);border-color:transparent;color:#fff;font-weight:600}
.ar-buy:hover,.ar-sell:hover{opacity:.88}
.ar-flash{font-size:11.5px;padding:5px 8px;border-radius:6px;margin-top:8px}
.ar-flash.ar-ok{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}
.ar-flash.ar-bad{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.ar-trades{display:flex;flex-direction:column;gap:3px;margin-top:6px;max-height:104px;overflow:auto}
.ar-trades div{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ar-paper-note{font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-top:6px}
@media (max-width:720px){.ar-modal-backdrop{padding:10px}}
@media (max-width:1080px){.ar-body{grid-template-columns:minmax(0,1fr)}.ar-tape{grid-template-columns:repeat(2,minmax(0,1fr))}.ar-sectors{grid-template-columns:minmax(0,1fr)}}
@media (max-width:720px){.ar-senti{grid-template-columns:minmax(0,1fr)}.ar-tape{grid-template-columns:repeat(2,minmax(0,1fr))}}
`

    /* ---------------------------------------------------------------- *
     * Icons
     * ---------------------------------------------------------------- */

    function useSparks(codesKey, trading, slow) {
      const [sparks, setSparks] = useState(null)
      useEffect(() => {
        if (codesKey === '') {
          setSparks(null)
          return undefined
        }
        let cancelled = false
        const controller = new AbortController()
        const load = async () => {
          try {
            const response = await fetch(endpoint(API + '/spark?codes=' + encodeURIComponent(codesKey)), {
              cache: 'no-store',
              signal: controller.signal,
            })
            if (!response.ok) return
            const body = await response.json()
            if (!cancelled && body && body.sparks) setSparks(body.sparks)
          } catch {
            /* a missing spark just leaves the cell empty */
          }
        }
        load()
        const timer = window.setInterval(() => {
          if (!document.hidden) load()
        }, trading ? (slow ? 30000 : 20000) : 90000)
        return () => {
          cancelled = true
          controller.abort()
          window.clearInterval(timer)
        }
      }, [codesKey, trading])
      return sparks
    }

    /** 'up' / 'down' when the sharpest five-minute leg of the session is material. */
    function sparkSeverity(spark, code) {
      if (spark === null || spark === undefined || typeof spark.run !== 'number') return null
      const ratio = clientLimits(code === undefined ? '' : code, '', spark.prevClose || 1).pct
      const threshold = 0.8 + ratio * 4
      if (Math.abs(spark.run) < threshold) return null
      // A violent leg from an hour ago is history, not a live signal.
      if (typeof spark.runAge === 'number' && spark.runAge > 40) return null
      return spark.run > 0 ? 'up' : 'down'
    }

    function SparkFlag(props) {
      const severity = sparkSeverity(props.spark, props.code)
      if (severity === null) return null
      return h(
        'span',
        { className: 'ar-flag ' + (severity === 'up' ? 'ar-up' : 'ar-down') },
        props.t(severity === 'up' ? 'mini.surge' : 'mini.sink'),
      )
    }

    function MiniTrend(props) {
      const spark = props.spark
      const width = props.width === undefined ? 76 : props.width
      const height = props.height === undefined ? 26 : props.height
      if (spark === null || spark === undefined || !Array.isArray(spark.points) || spark.points.length < 2) {
        // No intraday shape (suspended, new listing): keep the column aligned.
        return h(
          'span',
          { className: 'ar-mini', style: { width: width + 'px', height: height + 'px' } },
          h(
            'svg',
            { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, 'aria-hidden': true },
            h('line', {
              x1: 2,
              x2: width - 2,
              y1: height / 2,
              y2: height / 2,
              stroke: 'var(--dsw-alias-border-l1)',
              strokeWidth: 0.8,
              strokeDasharray: '2 3',
            }),
          ),
        )
      }
      const points = spark.points
      const prev = spark.prevClose
      const last = points[points.length - 1]
      const rising = last >= prev
      const color = rising ? 'var(--ar-up)' : 'var(--ar-down)'
      let deviation = 0
      for (const value of points) {
        const distance = Math.abs(value - prev)
        if (distance > deviation) deviation = distance
      }
      deviation = Math.max(deviation, prev * 0.002)
      const top = prev + deviation
      const bottom = prev - deviation
      const y = value => height - 3 - ((value - bottom) / (top - bottom)) * (height - 6)
      const x = index => (index / (points.length - 1)) * width
      const line = points.map((value, index) => (index === 0 ? 'M' : 'L') + x(index).toFixed(1) + ' ' + y(value).toFixed(1)).join(' ')
      const area = line + ' L ' + width + ' ' + (height - 1) + ' L 0 ' + (height - 1) + ' Z'
      return h(
        'span',
        { className: 'ar-mini', style: { width: width + 'px', height: height + 'px' } },
        h(
          'svg',
          { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, 'aria-hidden': true },
          h('line', { x1: 0, x2: width, y1: y(prev), y2: y(prev), stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 0.8, strokeDasharray: '2 2' }),
          h('path', { d: area, fill: color, opacity: 0.1 }),
          h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 1.1, strokeLinejoin: 'round' }),
          h('circle', { cx: x(points.length - 1), cy: y(last), r: 1.5, fill: color }),
        ),
      )
    }

    function RadarGlyph(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        },
        h('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeWidth: 1.5, opacity: props.active ? 0.95 : 0.7 }),
        h('circle', { cx: 12, cy: 12, r: 4.5, stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.45 }),
        h('path', { d: 'M12 12 19 7.5', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('circle', { cx: 16.4, cy: 17.2, r: 1.5, fill: 'currentColor' }),
      )
    }

    /* ---------------------------------------------------------------- *
     * Small components
     * ---------------------------------------------------------------- */

    function Card(props) {
      return h(
        'section',
        { className: 'ar-card' },
        h(
          'div',
          { className: 'ar-card-head' },
          h('div', { className: 'ar-card-title' }, props.title),
          props.aside === undefined || props.aside === null ? null : props.aside,
        ),
        props.children,
      )
    }

    function Segmented(props) {
      return h(
        'div',
        { className: 'ar-seg', role: 'tablist' },
        props.options.map(option =>
          h(
            'button',
            {
              key: option.id,
              type: 'button',
              role: 'tab',
              'aria-selected': props.value === option.id,
              className: props.value === option.id ? 'ar-on' : undefined,
              onClick: () => props.onChange(option.id),
            },
            option.label,
          ),
        ),
      )
    }

    function IndexTape(props) {
      return h(
        'div',
        { className: 'ar-tape' },
        props.indices.map(index =>
          h(
            'div',
            {
              className: 'ar-tape-card',
              key: index.code + index.secid,
              role: 'button',
              tabIndex: 0,
              title: props.hint,
              onClick: () => props.onOpen(index),
              onKeyDown: event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  props.onOpen(index)
                }
              },
            },
            h('div', { className: 'ar-tape-name' }, index.name),
            h('div', { className: 'ar-tape-price ' + toneOf(index.pct) }, price(index.price)),
            h('div', { className: 'ar-tape-chg ' + toneOf(index.pct) }, pctText(index.pct)),
          ),
        ),
      )
    }

    function Sparkline(props) {
      const points = props.points || []
      if (points.length < 2) return null
      const width = 260
      const height = 34
      const values = points.map(point => (point.rise === null ? 0 : point.rise))
      const min = Math.min(...values)
      const max = Math.max(...values)
      const span = max - min || 1
      const step = width / (values.length - 1)
      const path = values
        .map((value, index) => {
          const x = (index * step).toFixed(2)
          const y = (height - 3 - ((value - min) / span) * (height - 6)).toFixed(2)
          return (index === 0 ? 'M' : 'L') + x + ' ' + y
        })
        .join(' ')
      return h(
        'svg',
        { className: 'ar-spark', viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none', 'aria-hidden': true },
        h('path', { d: path, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 1.4, strokeLinejoin: 'round' }),
      )
    }

    function SentimentCard(props) {
      const { t, sentiment } = props
      if (sentiment === null || sentiment === undefined) {
        return h(Card, { title: t('sentiment.title') }, h('div', { className: 'ar-empty' }, t('sentiment.empty')))
      }
      const rise = sentiment.rise === null ? 0 : sentiment.rise
      const fall = sentiment.fall === null ? 0 : sentiment.fall
      const total = rise + fall
      const upWidth = total > 0 ? (rise / total) * 100 : 50
      const moodTone = sentiment.score >= 55 ? 'ar-up' : sentiment.score >= 44 ? 'ar-flat' : 'ar-down'
      return h(
        Card,
        {
          title: t('sentiment.title'),
          aside: h('span', { className: 'ar-card-note' }, sentiment.note),
        },
        h(
          'div',
          { className: 'ar-senti' },
          h(
            'div',
            { className: 'ar-gauge' },
            h('strong', { className: moodTone }, sentiment.score),
            h('span', null, t('sentiment.score')),
            h('em', { className: moodTone }, sentiment.mood),
          ),
          h(
            'div',
            { style: { minWidth: 0 } },
            h(
              'div',
              { className: 'ar-breadth-bar' },
              h('i', { className: 'ar-up', style: { width: upWidth + '%' } }),
              h('i', { className: 'ar-down', style: { width: 100 - upWidth + '%' } }),
            ),
            h(
              'div',
              { className: 'ar-senti-stats' },
              h('div', { className: 'ar-stat' }, h('b', { className: 'ar-up' }, rise), h('span', null, t('sentiment.rise'))),
              h('div', { className: 'ar-stat' }, h('b', { className: 'ar-down' }, fall), h('span', null, t('sentiment.fall'))),
              h('div', { className: 'ar-stat' }, h('b', { className: 'ar-up' }, sentiment.limitUp), h('span', null, t('sentiment.limitUp'))),
              h('div', { className: 'ar-stat' }, h('b', { className: 'ar-down' }, sentiment.limitDown), h('span', null, t('sentiment.limitDown'))),
              h('div', { className: 'ar-stat' }, h('b', null, sentiment.brokenRate + '%'), h('span', null, t('sentiment.broken'))),
            ),
            h(Sparkline, { points: sentiment.history }),
            sentiment.ladder !== undefined && sentiment.ladder.length > 0
              ? h(
                  'div',
                  { className: 'ar-senti-stats', style: { marginTop: 4 } },
                  h('div', { className: 'ar-stat', style: { minWidth: '100%' } },
                    h(
                      'div',
                      { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                      t('sentiment.ladder'),
                    ),
                    h(
                      'div',
                      { className: 'ar-strategy-row', style: { marginTop: 3 } },
                      sentiment.ladder.slice(0, 7).map(step =>
                        h('span', { className: 'ar-tag', key: step.board }, step.board + t('sentiment.board') + '×' + step.count),
                      ),
                    ),
                  ),
                )
              : null,
          ),
        ),
      )
    }

    function SectorCard(props) {
      const { t, sectors, kind, onKind, onOpen } = props
      const source = sectors || {}
      const boards = (kind === 'concept' ? source.concept : source.industry) || []
      const aside = h(
        Segmented,
        {
          value: kind,
          onChange: onKind,
          options: [
            { id: 'industry', label: t('sector.industry') },
            { id: 'concept', label: t('sector.concept') },
          ],
        },
      )
      return h(
        Card,
        { title: t('sector.title'), aside },
        boards === undefined || boards.length === 0
          ? h('div', { className: 'ar-empty' }, t('sector.empty'))
          : h(
              'div',
              { className: 'ar-sectors' },
              boards.map(board =>
                h(
                  'div',
                  {
                    className: 'ar-sector',
                    key: board.code + board.name,
                    role: 'button',
                    tabIndex: 0,
                    title: t('sector.hint'),
                    onClick: () => onOpen(board),
                    onKeyDown: event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpen(board)
                      }
                    },
                  },
                  h(
                    'div',
                    { className: 'ar-sector-name' },
                    h('b', { title: board.name }, board.label || board.name),
                    board.tags.indexOf('hot') !== -1 ? h('em', null, t('tag.hot')) : null,
                  ),
                  h('div', { className: 'ar-sector-pct ' + toneOf(board.pct) }, pctText(board.pct)),
                  h(
                    'div',
                    { className: 'ar-sector-meta' },
                    h('span', null, t('sector.leader') + ' ' + (board.leader || '—') + ' ' + (board.leaderPct === null || board.leaderPct === undefined ? '' : pctText(board.leaderPct))),
                    h('span', { className: toneOf(board.mainNet) }, t('sector.flow') + ' ' + yi(board.mainNet)),
                    board.fiveDayPct === null || board.fiveDayPct === undefined
                      ? null
                      : h('span', { className: toneOf(board.fiveDayPct) }, t('sector.5d') + ' ' + pctText(board.fiveDayPct)),
                    h('span', null, t('sector.width') + ' ' + (board.up === null ? '—' : board.up) + '/' + (board.down === null ? '—' : board.down)),
                  ),
                  h('span', { className: 'ar-meter', style: { gridColumn: '1 / -1' } }, h('i', { style: { width: board.score + '%' } })),
                ),
              ),
            ),
      )
    }

    function volumeTone(state) {
      if (state === null || state === undefined) return 'ar-flat'
      if (state.state === 'stagnant' || state.state === 'shrinkRise') return 'ar-warn'
      if (state.state === 'dump') return 'ar-down'
      if (state.state === 'heavy' || state.state === 'extreme') return 'ar-up'
      return 'ar-flat'
    }

    function VolumeChip(props) {
      const state = props.state
      if (state === null || state === undefined || state.label === undefined) return null
      const label = props.t('vol.' + state.label)
      const text = label === 'vol.' + state.label ? state.state : label
      return h(
        'span',
        {
          className: 'ar-flag ' + volumeTone(state),
          title: t2(props.t, state),
        },
        text,
      )
    }

    function t2(t, state) {
      const ratio = state.ratio === null || state.ratio === undefined ? '—' : state.ratio + ' 倍'
      return t('vol.title') + '：' + ratio + '（今日折算 / 前 5 日均量）'
    }

    function tagLabel(t, id) {
      const key = 'tag.' + id
      const value = t(key)
      return value === key ? id : value
    }

    /** Absolute minute → session slot 0..240, collapsing the lunch break. */
    function sectorSlot(minute) {
      if (minute <= 690) return minute - 570
      if (minute <= 780) return 120
      return 120 + (minute - 780)
    }

    function SectorTrendChart(props) {
      const { series, t, hover, onHover, runId } = props
      const clipRef = useRef(null)
      const W = 760
      const H = props.height === undefined ? 212 : props.height
      const padY = 16
      const axisRight = 96
      const plotW = W - axisRight
      const plotH = H - padY * 2
      // Fifty curves × 241 minutes is ~12k path commands: rebuilding them on every
      // pointer move would make the crosshair lag. Geometry is memoised on the data
      // alone, so hovering only re-renders the crosshair.
      const px = slot => (slot / 240) * plotW
      const geometry = useMemo(() => {
        let low = 0
        let high = 0
        for (const line of series) {
          for (const point of line.points) {
            if (point[1] < low) low = point[1]
            if (point[1] > high) high = point[1]
          }
        }
        const range = Math.max(Math.abs(low), Math.abs(high), 0.5) * 1.12
        const project = value => padY + plotH - ((value + range) / (2 * range)) * plotH
        const ranked = series
          .map(line => ({ ...line, last: line.points.length > 0 ? line.points[line.points.length - 1][1] : 0 }))
          .sort((a, b) => b.last - a.last)
        const leaderCodes = new Set(ranked.slice(0, 8).map(line => line.code))
        const markers = []
        const placed = []
        for (const line of ranked) {
          const y = project(line.last)
          if (placed.some(value => Math.abs(value - y) < 10)) continue
          placed.push(y)
          markers.push({ code: line.code, name: line.name, pct: line.last, y })
          if (markers.length >= 12) break
        }
        const paths = ranked.map(line => ({
          code: line.code,
          d: line.points
            .map((point, order) => (order === 0 ? 'M' : 'L') + px(sectorSlot(point[0])).toFixed(1) + ' ' + project(point[1]).toFixed(1))
            .join(' '),
          lead: leaderCodes.has(line.code),
          up: line.last >= 0,
        }))
        return { bound: range, py: project, decorated: ranked, labels: markers, paths }
      }, [series, H])
      const { bound, py, decorated, labels, paths } = geometry

      // The reveal clips from x=0 rightwards, so the curves are drawn from the
      // zero axis at the left edge to the end of the X axis. The id must stay
      // stable across renders, or every hover would remount the clip and replay
      // the animation.
      if (clipRef.current === null) clipRef.current = 'ar-trend-clip-' + Math.random().toString(36).slice(2, 8)
      const clipId = clipRef.current

      // Everything downstream is in viewBox units. The SVG is scaled by CSS and may
      // be letterboxed by preserveAspectRatio, so the pointer is mapped through the
      // element's own screen matrix instead of by dividing pixel sizes.
      const valueAtY = y => bound - ((Math.max(padY, Math.min(padY + plotH, y)) - padY) / plotH) * 2 * bound
      const chartPoint = event => {
        const element = event.currentTarget
        try {
          if (element !== null && typeof element === 'object' && typeof element.createSVGPoint === 'function' && typeof element.getScreenCTM === 'function') {
            const matrix = element.getScreenCTM()
            if (matrix !== null && matrix !== undefined) {
              const point = element.createSVGPoint()
              point.x = event.clientX
              point.y = event.clientY
              const mapped = point.matrixTransform(matrix.inverse())
              return { x: mapped.x, y: mapped.y }
            }
          }
        } catch {
          /* fall through to the ratio mapping below */
        }
        const rect = element.getBoundingClientRect()
        return {
          x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * W,
          y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * H,
        }
      }
      const pick = event => {
        const point = chartPoint(event)
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
        const slot = Math.max(0, Math.min(240, Math.round((point.x / plotW) * 240)))
        const pointerY = Math.max(padY, Math.min(padY + plotH, point.y))
        onHover({
          minute: slot <= 120 ? 570 + slot : 780 + (slot - 120),
          pct: Math.round(valueAtY(pointerY) * 100) / 100,
          y: pointerY,
        })
      }
      const ticks = [0, 60, 120, 180, 240]
      const tickLabels = ['09:30', '10:30', '11:30/13:00', '14:00', '15:00']

      return h(
        'svg',
        {
          className: 'ar-trend-chart',
          viewBox: '0 0 ' + W + ' ' + H,
          role: 'img',
          onMouseMove: pick,
          onMouseLeave: () => onHover(null),
        },
        [bound, bound / 2, 0, -bound / 2, -bound].map(value =>
          h(
            'g',
            { key: 'g' + value },
            h('line', {
              x1: 0,
              x2: plotW,
              y1: py(value),
              y2: py(value),
              stroke: value === 0 ? 'var(--dsw-alias-border-l2)' : 'var(--dsw-alias-border-l1)',
              strokeWidth: value === 0 ? 1.2 : 0.8,
              strokeDasharray: value === 0 ? '4 3' : '3 5',
            }),
            h(
              'text',
              { x: 3, y: py(value) - 3, fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' },
              (value > 0 ? '+' : '') + value.toFixed(1) + '%',
            ),
          ),
        ),
        ticks.map((slot, index) =>
          h(
            'text',
            {
              key: 't' + slot,
              x: Math.max(16, Math.min(plotW - 20, px(slot))),
              y: H - 6,
              textAnchor: index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle',
              fontSize: 9,
              fill: 'var(--dsw-alias-label-secondary)',
            },
            tickLabels[index],
          ),
        ),
        h('defs', null, h('clipPath', { id: clipId }, h('rect', { key: 'reveal-' + runId, x: 0, y: 0, width: plotW, height: H, className: 'ar-trend-reveal' }))),
        h(
          'g',
          { key: 'lines-' + runId, clipPath: 'url(#' + clipId + ')' },
          paths.map(path =>
            h('path', {
              key: path.code,
              d: path.d,
              fill: 'none',
              stroke: path.up ? 'var(--ar-up)' : 'var(--ar-down)',
              strokeWidth: path.lead ? 1.4 : 0.8,
              strokeLinejoin: 'round',
              opacity: path.lead ? 0.95 : 0.3,
            }),
          ),
        ),
        labels.map(label =>
          h(
            'text',
            {
              key: 'l' + label.code,
              className: 'ar-trend-label',
              x: plotW + 6,
              y: label.y + 3,
              fontSize: 9,
              fill: label.pct >= 0 ? 'var(--ar-up)' : 'var(--ar-down)',
            },
            label.name.length > 6 ? label.name.slice(0, 6) : label.name,
          ),
        ),
        hover === null || hover === undefined
          ? null
          : h(
              'g',
              null,
              h('line', {
                x1: px(sectorSlot(hover.minute)),
                x2: px(sectorSlot(hover.minute)),
                y1: padY,
                y2: padY + plotH,
                stroke: 'var(--dsw-alias-label-secondary)',
                strokeWidth: 1,
                strokeDasharray: '3 3',
                opacity: 0.7,
              }),
              h('line', {
                x1: 0,
                x2: plotW,
                y1: hover.y,
                y2: hover.y,
                stroke: 'var(--dsw-alias-label-secondary)',
                strokeWidth: 1,
                strokeDasharray: '3 3',
                opacity: 0.7,
              }),
              h(
                'text',
                {
                  x: Math.min(plotW - 52, px(sectorSlot(hover.minute)) + 4),
                  y: padY + 8,
                  fontSize: 9,
                  fill: 'var(--dsw-alias-label-secondary)',
                },
                String(Math.floor(hover.minute / 60)).padStart(2, '0') +
                  ':' +
                  String(hover.minute % 60).padStart(2, '0') +
                  '  ' +
                  pctText(hover.pct),
              ),
              h(
                'text',
                {
                  x: plotW - 4,
                  y: hover.y - 4,
                  textAnchor: 'end',
                  fontSize: 9,
                  fill: hover.pct >= 0 ? 'var(--ar-up)' : 'var(--ar-down)',
                },
                pctText(hover.pct),
              ),
            ),
      )
    }

    function SectorTrendCard(props) {
      const { t, trading } = props
      const [date, setDate] = useState('')
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [hover, setHover] = useState(null)
      const [runId, setRunId] = useState(0)
      const [expanded, setExpanded] = useState(false)
      const holderRef = useRef(null)
      const [visible, setVisible] = useState(false)

      // 50 curves cost fifty upstream calls on a cold load; wait until the card is
      // actually near the viewport before paying for them.
      useEffect(() => {
        const node = holderRef.current
        if (node === null || typeof IntersectionObserver !== 'function') {
          setVisible(true)
          return undefined
        }
        const observer = new IntersectionObserver(
          entries => {
            if (entries.some(entry => entry.isIntersecting)) {
              setVisible(true)
              observer.disconnect()
            }
          },
          { rootMargin: '240px' },
        )
        observer.observe(node)
        return () => observer.disconnect()
      }, [])

      useEffect(() => {
        if (!visible) return undefined
        // Drop the old day immediately: a switch must read as a switch, even when
        // the request takes a moment or fails.
        setData(previous => {
          if (previous === null || previous === undefined) return previous
          const wanted = date === '' ? previous.today : date
          return previous.date === wanted ? previous : null
        })
        let cancelled = false
        const controller = new AbortController()
        const load = async () => {
          // The timestamp defeats any intermediate cache: switching days must hit
          // the host, never a remembered body.
          const target =
            API +
            '/sector-trend?t=' +
            Date.now() +
            (date === '' ? '' : '&date=' + encodeURIComponent(date))
          try {
            const response = await fetch(endpoint(target), { cache: 'no-store', signal: controller.signal })
            if (!response.ok) {
              const body = await response.json().catch(() => null)
              throw new Error(body !== null && body.error ? body.error : 'HTTP ' + response.status)
            }
            const body = await response.json()
            if (cancelled || body === null || typeof body !== 'object') return
            setData(body)
            setError(null)
          } catch (cause) {
            if (cancelled || (cause && cause.name === 'AbortError')) return
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        }
        load()
        const timer = window.setInterval(() => {
          if (!document.hidden) load()
        }, trading ? 60000 : 300000)
        return () => {
          cancelled = true
          controller.abort()
          window.clearInterval(timer)
        }
      }, [date, trading, visible])

      useEffect(() => {
        if (!expanded) return undefined
        const onKey = event => {
          if (event.key === 'Escape') setExpanded(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [expanded])

      const series = data !== null && Array.isArray(data.series) ? data.series : []
      const ranked = series
        .map(line => ({ ...line, last: line.points.length > 0 ? line.points[line.points.length - 1][1] : 0 }))
        .sort((a, b) => b.last - a.last)
      const dates = data !== null && Array.isArray(data.dates) ? data.dates : []
      const focus = hover === null || hover === undefined ? null : hover.minute
      const valueAt = line => {
        if (line.points.length === 0) return null
        if (focus === null) return line.points[line.points.length - 1][1]
        let best = line.points[0]
        for (const point of line.points) if (Math.abs(point[0] - focus) < Math.abs(best[0] - focus)) best = point
        return best[1]
      }
      const legend =
        series.length === 0
          ? []
          : (focus === null ? ranked : series.map(line => ({ ...line, last: valueAt(line) })).sort((a, b) => b.last - a.last)).slice(0, 5)

      const chips = h(
        'div',
        { className: 'ar-periods' },
        [{ value: '', label: t('trend.today') }]
          .concat(
            dates
              .filter(day => day !== (data !== null && data !== undefined ? data.today : undefined))
              .map(day => ({ value: day, label: day.slice(5) })),
          )
          .slice(0, 31)
          .map(option =>
            h(
              'button',
              {
                key: option.value === '' ? 'today' : option.value,
                type: 'button',
                className: 'ar-period' + (date === option.value ? ' ar-on' : ''),
                onClick: () => {
                  setDate(option.value)
                  setHover(null)
                  setRunId(value => value + 1)
                },
              },
              option.label,
            ),
          ),
      )

      const plot = (height, expandable) =>
        series.length === 0
          ? h('div', { className: 'ar-empty' }, data === null && error === null ? t('loading') : t('trend.empty'))
          : h(
              'div',
              {
                className: 'ar-trend-card-body',
                onClick: expandable ? () => setExpanded(true) : undefined,
                title: expandable ? t('trend.expand') : undefined,
              },
              h(SectorTrendChart, { series, t, hover, onHover: setHover, runId, height }),
              h(
                'div',
                { className: 'ar-trend-legend' },
                legend.map(line =>
                  h(
                    'span',
                    { key: line.code, className: 'ar-trend-item' },
                    h('i', {
                      style: { background: line.last >= 0 ? 'var(--ar-up)' : 'var(--ar-down)' },
                    }),
                    h('b', null, line.name),
                    h('em', { className: toneOf(line.last) }, pctText(line.last)),
                  ),
                ),
                focus === null ? h('span', { className: 'ar-card-note' }, String(series.length) + ' ' + t('trend.count')) : null,
              ),
            )

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { ref: holderRef },
          h(
          Card,
          {
            title: t('trend.title'),
            aside: h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              chips,
              h('button', { type: 'button', className: 'ar-btn', onClick: () => setExpanded(true), title: t('trend.expand') }, t('trend.expand')),
            ),
          },
          h(
            'div',
            { className: 'ar-card-note', style: { marginBottom: 4 } },
            data === null ? t('loading') : (data.date || '') + ' · ' + series.length + ' ' + t('trend.count'),
          ),
          error === null ? null : h('div', { className: 'ar-legend' }, h('span', { className: 'ar-flag ar-warn' }, t('trend.error') + '：' + error)),
          plot(212, true),
          ),
        ),
        expanded
          ? portal(
              h(
                'div',
                { className: 'ar-modal-backdrop', onMouseDown: () => setExpanded(false) },
                h(
                  'div',
                  {
                    className: 'ar-modal ar-wide',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': t('trend.title'),
                    onMouseDown: event => event.stopPropagation(),
                  },
                  h(
                    'div',
                    { className: 'ar-modal-head' },
                    h(
                      'div',
                      { className: 'ar-modal-title' },
                      h('h2', null, t('trend.title')),
                      h('span', null, t('trend.hint')),
                    ),
                    h('button', { type: 'button', className: 'ar-close', 'aria-label': t('detail.close'), onClick: () => setExpanded(false) }, '×'),
                  ),
                  h('div', { className: 'ar-modal-body' }, chips, plot(430, false)),
                ),
              ),
            )
          : null,
      )
    }

    function PickCard(props) {
      const { t, picks, strategies, filter, onFilter, onOpen, account, trading } = props
      const pool = picks || []
      const list = filter === null ? pool : pool.filter(pick => pick.tags.indexOf(filter) !== -1)
      const sparks = useSparks(pool.slice(0, 20).map(pick => pick.code).join(','), trading)
      const sparkOf = pick => (sparks === null || sparks === undefined ? null : sparks[pick.code])
      const aside = h(
        'div',
        { className: 'ar-strategy-row' },
        h(
          'button',
          {
            type: 'button',
            className: 'ar-chip' + (filter === null ? ' ar-on' : ''),
            onClick: () => onFilter(null),
          },
          t('picks.all'),
        ),
        (strategies || [])
          .filter(strategy => strategy.count > 0)
          .map(strategy =>
            h(
              'button',
              {
                key: strategy.id,
                type: 'button',
                className: 'ar-chip' + (filter === strategy.id ? ' ar-on' : ''),
                title: strategy.desc,
                onClick: () => onFilter(filter === strategy.id ? null : strategy.id),
              },
              tagLabel(t, strategy.id),
              h('b', null, strategy.count),
            ),
          ),
      )
      return h(
        Card,
        {
          title: t('picks.title'),
          aside,
        },
        h('div', { className: 'ar-card-note', style: { marginBottom: 6 } }, t('picks.subtitle')),
        list.length === 0
          ? h('div', { className: 'ar-empty' }, t('picks.empty'))
          : list.map(pick =>
              h(
                'div',
                {
                  className: 'ar-pick',
                  key: pick.code,
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => onOpen(pick),
                  onKeyDown: event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpen(pick)
                    }
                  },
                },
                h(
                  'div',
                  { style: { minWidth: 0 } },
                  h(
                    'div',
                    { className: 'ar-pick-head' },
                    h('span', { className: 'ar-pick-name' }, pick.name),
                    h('span', { className: 'ar-pick-code' }, pick.code),
                    account.positions[pick.code] === undefined
                      ? null
                      : h('span', { className: 'ar-held' }, t('trade.position') + ' ' + account.positions[pick.code].qty),
                    h('span', { className: 'ar-pick-price ' + toneOf(pick.pct) }, price(pick.price) + ' ' + pctText(pick.pct)),
                    pick.industry === null ? null : h('span', { className: 'ar-pick-sector' }, pick.industry),
                  ),
                  h(
                    'div',
                    { className: 'ar-strategy-row', style: { marginTop: 4 } },
                    pick.tags.map(tag => h('span', { className: 'ar-tag', key: tag }, tagLabel(t, tag))),
                    h(SparkFlag, { t, spark: sparkOf(pick), code: pick.code }),
                  ),
                  h(
                    'div',
                    { className: 'ar-pick-metrics' },
                    h('span', null, t('picks.volRatio') + ' ' + (pick.volRatio === null ? '—' : pick.volRatio)),
                    h('span', { className: toneOf(pick.mainNet) }, t('picks.flow') + ' ' + yi(pick.mainNet)),
                    h('span', null, t('picks.turnover') + ' ' + (pick.turnover === null ? '—' : pick.turnover + '%')),
                  ),
                  pick.reasons === undefined || pick.reasons.length === 0
                    ? null
                    : h('ul', { className: 'ar-reasons' }, pick.reasons.map(reason => h('li', { key: reason }, reason))),
                ),
                h(
                  'div',
                  { className: 'ar-pick-side' },
                  h(MiniTrend, { spark: sparkOf(pick), code: pick.code, width: 88, height: 26 }),
                  h('span', { className: 'ar-score', title: t('detail.scoreHint') }, pick.score),
                  h('span', { className: 'ar-card-note' }, t('picks.score')),
                  pick.tech !== null && pick.tech !== undefined && pick.tech.rsi6 !== null
                    ? h('span', { className: 'ar-card-note' }, 'RSI6 ' + pick.tech.rsi6)
                    : null,
                  pick.tech !== null && pick.tech !== undefined && pick.tech.bias20 !== null
                    ? h('span', { className: 'ar-card-note' }, 'BIAS ' + pick.tech.bias20 + '%')
                    : null,
                ),
              ),
            ),
      )
    }

    function WatchCard(props) {
      const { t, watchlist, onRemove, onOpen, account, results, query, onQuery, onAdd, searching, trading } = props
      const sparkKey = watchlist.slice(0, 30).map(stock => stock.code).join(',')
      const sparks = useSparks(sparkKey, trading)
      const sparkOf = stock => (sparks === null || sparks === undefined ? null : sparks[stock.code])
      return h(
        Card,
        { title: t('watch.title') },
        h(
          'div',
          { className: 'ar-search' },
          h('input', {
            className: 'ar-input',
            value: query,
            placeholder: t('watch.add'),
            onChange: event => onQuery(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') onAdd(query)
            },
          }),
          h('button', { type: 'button', className: 'ar-btn ar-primary', onClick: () => onAdd(query) }, t('watch.addBtn')),
        ),
        searching ? h('div', { className: 'ar-card-note', style: { marginBottom: 6 } }, t('loading')) : null,
        results.length > 0
          ? h(
              'div',
              { className: 'ar-results' },
              results.map(item =>
                h(
                  'button',
                  { key: item.code, type: 'button', className: 'ar-result', onClick: () => onAdd(item.code) },
                  h('b', null, item.name),
                  h('span', null, item.code),
                ),
              ),
            )
          : null,
        watchlist.length === 0
          ? h('div', { className: 'ar-empty' }, t('watch.empty'))
          : watchlist.map(stock =>
              h(
                'div',
                {
                  className: 'ar-watch-row',
                  key: stock.code,
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => onOpen(stock),
                  onKeyDown: event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpen(stock)
                    }
                  },
                },
                h(
                  'div',
                  { className: 'ar-watch-name' },
                  h('b', null, stock.name),
                  h('span', null, stock.code),
                  account.positions[stock.code] === undefined
                    ? null
                    : h('span', { className: 'ar-held' }, t('trade.position') + ' ' + account.positions[stock.code].qty),
                ),
                h(MiniTrend, { spark: sparkOf(stock), code: stock.code, width: 72, height: 24 }),
                h(
                  'div',
                  { className: 'ar-watch-price' },
                  h('b', { className: toneOf(stock.pct) }, price(stock.price)),
                  h('i', { className: toneOf(stock.pct) }, pctText(stock.pct)),
                ),
                h(
                  'div',
                  { className: 'ar-watch-meta' },
                  h('span', null, t('picks.volRatio') + ' ' + (stock.volRatio === null ? '—' : stock.volRatio)),
                  h('span', { className: toneOf(stock.mainNet) }, yi(stock.mainNet)),
                  h(VolumeChip, { t, state: stock.volumeState === undefined ? null : stock.volumeState }),
                  h(SparkFlag, { t, spark: sparkOf(stock), code: stock.code }),
                  (stock.flags || []).map(flag => h('span', { key: flag.k, className: 'ar-flag ' + 'ar-' + flag.level }, flag.text)),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ar-remove',
                      title: t('watch.remove'),
                      'aria-label': t('watch.remove'),
                      onClick: event => {
                        event.stopPropagation()
                        onRemove(stock.code)
                      },
                      style: { marginLeft: 'auto' },
                    },
                    '×',
                  ),
                ),
              ),
            ),
      )
    }

    function AlertCard(props) {
      const { t, feed } = props
      return h(
        Card,
        { title: t('alert.title'), aside: h('span', { className: 'ar-card-note' }, feed.length === 0 ? '' : String(feed.length)) },
        feed.length === 0
          ? h('div', { className: 'ar-empty' }, t('alert.empty'))
          : feed.slice(0, 18).map(item =>
              h(
                'div',
                { className: 'ar-alert', key: item.id },
                h('time', null, clockText(item.at)),
                h(
                  'div',
                  { style: { minWidth: 0 } },
                  h('b', { className: toneOf(item.pct) }, item.name),
                  h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, ' ' + item.code + ' '),
                  h('span', { className: 'ar-flag ar-' + item.level }, item.text),
                ),
              ),
            ),
      )
    }

    /* ---------------------------------------------------------------- *
     * Stock detail: intraday, day/week/month candles, paper trading
     * ---------------------------------------------------------------- */

    const ReactDOM = (() => {
      try {
        return require('react-dom')
      } catch {
        return null
      }
    })()

    function portal(node) {
      if (ReactDOM !== null && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function movingAvg(values, length) {
      const out = new Array(values.length).fill(null)
      let sum = 0
      for (let index = 0; index < values.length; index += 1) {
        sum += values[index]
        if (index >= length) sum -= values[index - length]
        if (index >= length - 1) out[index] = sum / length
      }
      return out
    }

    function rsiOf(closes, length) {
      if (closes.length <= length) return null
      let gain = 0
      let loss = 0
      for (let index = 1; index <= length; index += 1) {
        const delta = closes[index] - closes[index - 1]
        if (delta >= 0) gain += delta
        else loss -= delta
      }
      let avgGain = gain / length
      let avgLoss = loss / length
      for (let index = length + 1; index < closes.length; index += 1) {
        const delta = closes[index] - closes[index - 1]
        avgGain = (avgGain * (length - 1) + Math.max(delta, 0)) / length
        avgLoss = (avgLoss * (length - 1) + Math.max(-delta, 0)) / length
      }
      if (avgLoss === 0) return 100
      return 100 - 100 / (1 + avgGain / avgLoss)
    }

    /* ---------------------------------------------------------------- *
     * Chart engine — canvas, A-share desk conventions:
     * crosshair, wheel zoom, drag pan, MA overlay, VOL + MACD/KDJ/RSI,
     * session-aligned intraday axis, limit lines, live last bar.
     * ---------------------------------------------------------------- */

    const CHART_TOKEN_NAMES = [
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-label-primary',
      '--dsw-alias-label-secondary',
      '--dsw-alias-border-l1',
      '--dsw-alias-brand-primary',
      '--ar-up',
      '--ar-down',
      '--dsw-alias-state-warn-primary',
      '--dsw-alias-state-idle-primary',
    ]
    const TOKEN_FALLBACK = {
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-label-primary': '#1c1f24',
      '--dsw-alias-label-secondary': '#8b9099',
      '--dsw-alias-border-l1': '#e6e8ec',
      '--dsw-alias-brand-primary': '#3b6ef0',
      '--ar-up': '#8b5cf6',
      '--ar-down': '#c2410c',
      '--dsw-alias-state-warn-primary': '#d9822b',
      '--dsw-alias-state-idle-primary': '#98a0aa',
    }
    let tokenStamp = 0
    let tokenValues = null

    function chartTokens() {
      const now = Date.now()
      if (tokenValues !== null && now - tokenStamp < 1000) return tokenValues
      const values = Object.assign({}, TOKEN_FALLBACK)
      try {
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          const computed = window.getComputedStyle(document.documentElement)
          for (const name of CHART_TOKEN_NAMES) {
            const raw = computed.getPropertyValue(name).trim()
            if (raw !== '') values[name] = raw
          }
        }
      } catch {
        /* defaults keep the chart readable */
      }
      tokenStamp = now
      tokenValues = values
      return values
    }

    /** 241 intraday slots: 09:30–11:30 and 13:01–15:00. */
    const SESSION_TIMES = (() => {
      const pad = minute => String(minute).padStart(2, '0')
      const stamp = minute => pad(Math.floor(minute / 60)) + ':' + pad(minute % 60)
      const times = []
      for (let minute = 570; minute <= 690; minute += 1) times.push(stamp(minute))
      for (let minute = 781; minute <= 900; minute += 1) times.push(stamp(minute))
      return times
    })()

    function buildTrendSeries(points) {
      const dates = []
      for (const point of points) if (dates.indexOf(point.d) === -1) dates.push(point.d)
      const slotCount = SESSION_TIMES.length
      const series = new Array(dates.length * slotCount).fill(null)
      for (const point of points) {
        const day = dates.indexOf(point.d)
        const slot = SESSION_TIMES.indexOf(point.t)
        if (day < 0 || slot < 0) continue
        series[day * slotCount + slot] = point
      }
      return { dates, series, slotCount }
    }

    function chartLayout(W, H, hasSub) {
      const axisRight = 58
      const axisBottom = 20
      const top = 30
      const gap = 10
      const usable = Math.max(120, H - top - axisBottom - gap * (hasSub ? 2 : 1))
      const mainH = usable * (hasSub ? 0.6 : 0.76)
      const volH = usable * (hasSub ? 0.2 : 0.24)
      const subH = hasSub ? Math.max(40, usable - mainH - volH) : 0
      return {
        axisRight,
        axisBottom,
        top,
        gap,
        plotW: W - axisRight,
        mainH,
        volH,
        subH,
        mainTop: top,
        volTop: top + mainH + gap,
        subTop: top + mainH + gap + volH + gap,
      }
    }

    function resolveView(store, total, defaultCount) {
      const maxCount = Math.max(20, total)
      const floor = Math.min(30, maxCount)
      const fallback = defaultCount === undefined ? Math.min(120, maxCount) : Math.min(defaultCount, maxCount)
      let count = store.count === undefined ? fallback : store.count
      count = Math.max(floor, Math.min(count, maxCount))
      let end = store.end === undefined ? total - 1 : store.end
      end = Math.max(count - 1, Math.min(end, total - 1))
      return { count, end, start: end - count + 1 }
    }

    function chartPrice(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      return Math.abs(value) >= 1000 ? value.toFixed(1) : value.toFixed(2)
    }

    function chartVolume(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿'
      if (value >= 1e4) return (value / 1e4).toFixed(1) + '万'
      return String(Math.round(value))
    }

    function macdSeries(closes) {
      const dif = []
      const dea = []
      const hist = []
      let ema12 = closes[0]
      let ema26 = closes[0]
      let deaValue = 0
      for (let index = 0; index < closes.length; index += 1) {
        ema12 = closes[index] * (2 / 13) + ema12 * (1 - 2 / 13)
        ema26 = closes[index] * (2 / 27) + ema26 * (1 - 2 / 27)
        const value = ema12 - ema26
        deaValue = value * (2 / 10) + deaValue * (1 - 2 / 10)
        dif.push(value)
        dea.push(deaValue)
        hist.push((value - deaValue) * 2)
      }
      return { dif, dea, hist }
    }

    function kdjSeries(bars) {
      const k = []
      const d = []
      const j = []
      let prevK = 50
      let prevD = 50
      for (let index = 0; index < bars.length; index += 1) {
        const from = Math.max(0, index - 8)
        let high = -Infinity
        let low = Infinity
        for (let scan = from; scan <= index; scan += 1) {
          if (bars[scan].h > high) high = bars[scan].h
          if (bars[scan].l < low) low = bars[scan].l
        }
        const rsv = high === low ? 50 : ((bars[index].c - low) / (high - low)) * 100
        const kValue = (2 / 3) * prevK + (1 / 3) * rsv
        const dValue = (2 / 3) * prevD + (1 / 3) * kValue
        prevK = kValue
        prevD = dValue
        k.push(kValue)
        d.push(dValue)
        j.push(3 * kValue - 2 * dValue)
      }
      return { k, d, j }
    }

    function rsiSeries(closes, length) {
      const out = new Array(closes.length).fill(null)
      if (closes.length <= length) return out
      let gain = 0
      let loss = 0
      for (let index = 1; index <= length; index += 1) {
        const delta = closes[index] - closes[index - 1]
        if (delta >= 0) gain += delta
        else loss -= delta
      }
      let avgGain = gain / length
      let avgLoss = loss / length
      out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      for (let index = length + 1; index < closes.length; index += 1) {
        const delta = closes[index] - closes[index - 1]
        avgGain = (avgGain * (length - 1) + Math.max(delta, 0)) / length
        avgLoss = (avgLoss * (length - 1) + Math.max(-delta, 0)) / length
        out[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      }
      return out
    }

    function drawKChart(canvas, model, store, cursor, settings, texts) {
      const tokens = chartTokens()
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
      const W = Math.max(240, Math.round(canvas.clientWidth || canvas.width || 760))
      const H = Math.max(200, Math.round(canvas.clientHeight || canvas.height || 420))
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr)
        canvas.height = Math.round(H * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx || typeof ctx.setTransform !== 'function') return false
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.font = '10px -apple-system, "PingFang SC", "Segoe UI", sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = tokens['--dsw-alias-bg-layer-1']
      ctx.fillRect(0, 0, W, H)

      const isTrend = model !== null && model.kind === 'trend'
      const data = model === null ? [] : isTrend ? model.series : model.bars
      const total = data.length
      if (model === null || total === 0) {
        ctx.fillStyle = tokens['--dsw-alias-label-secondary']
        ctx.textAlign = 'center'
        ctx.fillText(texts.empty, W / 2, H / 2)
        return true
      }

      const hasSub = !isTrend && settings.sub !== 'NONE'
      const layout = chartLayout(W, H, hasSub)
      const plotW = layout.plotW
      const view = resolveView(store, total, isTrend ? total : 120)
      const count = view.count
      const start = view.start
      const end = view.end
      const barW = plotW / count
      const centerX = index => (index - start + 0.5) * barW
      const up = tokens['--ar-up']
      const down = tokens['--ar-down']
      const brand = tokens['--dsw-alias-brand-primary']
      const warn = tokens['--dsw-alias-state-warn-primary']
      const idle = tokens['--dsw-alias-state-idle-primary']
      const muted = tokens['--dsw-alias-label-secondary']
      const strong = tokens['--dsw-alias-label-primary']

      let low = Infinity
      let high = -Infinity
      for (let index = start; index <= end; index += 1) {
        const item = data[index]
        if (item === null || item === undefined) continue
        const itemHigh = isTrend ? item.price : item.h
        const itemLow = isTrend ? item.price : item.l
        if (itemHigh > high) high = itemHigh
        if (itemLow < low) low = itemLow
      }
      if (!Number.isFinite(low) || !Number.isFinite(high)) {
        ctx.fillStyle = muted
        ctx.textAlign = 'center'
        ctx.fillText(texts.empty, W / 2, H / 2)
        return true
      }
      if (isTrend && typeof model.prevClose === 'number' && model.prevClose > 0) {
        const deviation = Math.max(high - model.prevClose, model.prevClose - low, model.prevClose * 0.003)
        low = model.prevClose - deviation
        high = model.prevClose + deviation
        const limits = model.limits
        if (limits !== null && limits !== undefined) {
          if (typeof limits.up === 'number' && limits.up <= high + deviation * 1.2) high = Math.max(high, limits.up + deviation * 0.05)
          if (typeof limits.down === 'number' && limits.down >= low - deviation * 1.2) low = Math.min(low, limits.down - deviation * 0.05)
        }
      }
      const span = high - low || Math.max(high * 0.01, 0.01)
      const yMin = isTrend ? low : low - span * 0.06
      const yMax = isTrend ? high : high + span * 0.06
      const yMain = value => layout.mainTop + layout.mainH - ((value - yMin) / (yMax - yMin)) * layout.mainH
  
      let maxVol = 0
      for (let index = start; index <= end; index += 1) {
        const item = data[index]
        if (item === null || item === undefined) continue
        const volume = isTrend ? item.volume : item.v
        if (typeof volume === 'number' && volume > maxVol) maxVol = volume
      }

      // grid + price axis
      ctx.strokeStyle = tokens['--dsw-alias-border-l1']
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      for (let step = 0; step <= 4; step += 1) {
        const y = layout.mainTop + (layout.mainH * step) / 4
        ctx.beginPath()
        ctx.moveTo(0, y + 0.5)
        ctx.lineTo(plotW, y + 0.5)
        ctx.stroke()
        ctx.fillStyle = muted
        ctx.textAlign = 'left'
        ctx.fillText(chartPrice(yMax - ((yMax - yMin) * step) / 4), plotW + 6, y)
      }
      ctx.setLineDash([])

      if (isTrend) {
        const prevClose = model.prevClose
        if (typeof prevClose === 'number' && prevClose > yMin && prevClose < yMax) {
          const y = yMain(prevClose)
          ctx.strokeStyle = idle
          ctx.setLineDash([5, 4])
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(plotW, y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = muted
          ctx.textAlign = 'left'
          ctx.fillText(chartPrice(prevClose), plotW + 6, y)
        }
        const limits = model.limits
        if (limits !== null && limits !== undefined) {
          const rows = [
            { value: limits.up, color: up },
            { value: limits.down, color: down },
          ]
          for (const row of rows) {
            if (typeof row.value !== 'number' || row.value <= yMin || row.value >= yMax) continue
            const y = yMain(row.value)
            ctx.strokeStyle = row.color
            ctx.setLineDash([4, 4])
            ctx.globalAlpha = 0.6
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(plotW, y)
            ctx.stroke()
            ctx.globalAlpha = 1
            ctx.setLineDash([])
            ctx.fillStyle = row.color
            ctx.textAlign = 'left'
            ctx.fillText(chartPrice(row.value), plotW + 6, y)
          }
        }
      }

      // main series
      if (isTrend) {
        const path = []
        const avgPath = []
        for (let index = start; index <= end; index += 1) {
          const point = data[index]
          if (point === null || point === undefined) continue
          path.push({ x: centerX(index), y: yMain(point.price) })
          if (typeof point.avg === 'number') avgPath.push({ x: centerX(index), y: yMain(point.avg) })
        }
        if (path.length > 1) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(path[0].x, path[0].y)
          for (let index = 1; index < path.length; index += 1) ctx.lineTo(path[index].x, path[index].y)
          ctx.lineTo(path[path.length - 1].x, layout.mainTop + layout.mainH)
          ctx.lineTo(path[0].x, layout.mainTop + layout.mainH)
          ctx.closePath()
          ctx.clip()
          for (let band = 0; band < 24; band += 1) {
            ctx.globalAlpha = 0.2 * (1 - band / 24)
            ctx.fillStyle = brand
            ctx.fillRect(0, layout.mainTop + (layout.mainH * band) / 24, plotW, layout.mainH / 24 + 1)
          }
          ctx.restore()
          ctx.globalAlpha = 1
          ctx.strokeStyle = brand
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(path[0].x, path[0].y)
          for (let index = 1; index < path.length; index += 1) ctx.lineTo(path[index].x, path[index].y)
          ctx.stroke()
        }
        if (avgPath.length > 1) {
          ctx.strokeStyle = warn
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(avgPath[0].x, avgPath[0].y)
          for (let index = 1; index < avgPath.length; index += 1) ctx.lineTo(avgPath[index].x, avgPath[index].y)
          ctx.stroke()
        }
      } else {
        for (let index = start; index <= end; index += 1) {
          const bar = data[index]
          if (bar === null || bar === undefined) continue
          const x = centerX(index)
          const rising = bar.c >= bar.o
          const color = rising ? up : down
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, yMain(bar.h))
          ctx.lineTo(x, yMain(bar.l))
          ctx.stroke()
          const top = yMain(Math.max(bar.o, bar.c))
          const bottom = yMain(Math.min(bar.o, bar.c))
          const width = Math.max(1, barW * 0.62)
          if (rising) {
            ctx.strokeRect(x - width / 2, top, Math.max(1, width - 1), Math.max(1, bottom - top))
          } else {
            ctx.fillRect(x - width / 2, top, Math.max(1, width - 1), Math.max(1, bottom - top))
          }
        }
        if (settings.ma) {
          const closes = model.bars.map(bar => bar.c)
          const specs = [
            { length: 5, color: brand },
            { length: 10, color: warn },
            { length: 20, color: idle },
          ]
          for (const spec of specs) {
            const series = movingAvg(closes, spec.length)
            ctx.strokeStyle = spec.color
            ctx.lineWidth = 1
            ctx.beginPath()
            let started = false
            for (let index = start; index <= end; index += 1) {
              const value = series[index]
              if (value === null || value === undefined) {
                started = false
                continue
              }
              const x = centerX(index)
              const y = yMain(value)
              if (started) ctx.lineTo(x, y)
              else {
                ctx.moveTo(x, y)
                started = true
              }
            }
            ctx.stroke()
          }
        }
      }

      // volume pane
      ctx.strokeStyle = tokens['--dsw-alias-border-l1']
      ctx.beginPath()
      ctx.moveTo(0, layout.volTop + 0.5)
      ctx.lineTo(plotW, layout.volTop + 0.5)
      ctx.stroke()
      for (let index = start; index <= end; index += 1) {
        const item = data[index]
        if (item === null || item === undefined) continue
        const volume = isTrend ? item.volume : item.v
        if (typeof volume !== 'number' || maxVol === 0) continue
        const rising = isTrend ? item.price >= model.prevClose : item.c >= item.o
        const height = Math.max(0.6, (volume / maxVol) * (layout.volH - 2))
        ctx.fillStyle = rising ? up : down
        ctx.globalAlpha = 0.55
        ctx.fillRect(centerX(index) - barW * 0.3, layout.volTop + layout.volH - height, Math.max(1, barW * 0.6), height)
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = muted
      ctx.textAlign = 'left'
      ctx.fillText(chartVolume(maxVol), plotW + 6, layout.volTop + 6)

      // sub indicator
      if (hasSub) {
        ctx.strokeStyle = tokens['--dsw-alias-border-l1']
        ctx.beginPath()
        ctx.moveTo(0, layout.subTop + 0.5)
        ctx.lineTo(plotW, layout.subTop + 0.5)
        ctx.stroke()
        const closes = model.bars.map(bar => bar.c)
        if (settings.sub === 'MACD') {
          const macd = macdSeries(closes)
          let peak = 0
          for (let index = start; index <= end; index += 1) {
            peak = Math.max(peak, Math.abs(macd.dif[index]), Math.abs(macd.dea[index]), Math.abs(macd.hist[index]))
          }
          peak = peak || 1
          const mid = layout.subTop + layout.subH / 2
          const ySub = value => mid - (value / peak) * (layout.subH / 2 - 2)
          ctx.strokeStyle = tokens['--dsw-alias-border-l1']
          ctx.beginPath()
          ctx.moveTo(0, mid + 0.5)
          ctx.lineTo(plotW, mid + 0.5)
          ctx.stroke()
          for (let index = start; index <= end; index += 1) {
            const value = macd.hist[index]
            if (value === null || value === undefined) continue
            const zero = ySub(0)
            const y = ySub(value)
            ctx.fillStyle = value >= 0 ? up : down
            ctx.globalAlpha = 0.55
            ctx.fillRect(centerX(index) - barW * 0.3, Math.min(y, zero), Math.max(1, barW * 0.6), Math.max(1, Math.abs(y - zero)))
          }
          ctx.globalAlpha = 1
          for (const line of [
            { series: macd.dif, color: brand },
            { series: macd.dea, color: warn },
          ]) {
            ctx.strokeStyle = line.color
            ctx.lineWidth = 1
            ctx.beginPath()
            let started = false
            for (let index = start; index <= end; index += 1) {
              const value = line.series[index]
              if (value === null || value === undefined) {
                started = false
                continue
              }
              const x = centerX(index)
              const y = ySub(value)
              if (started) ctx.lineTo(x, y)
              else {
                ctx.moveTo(x, y)
                started = true
              }
            }
            ctx.stroke()
          }
        } else if (settings.sub === 'KDJ') {
          const kdj = kdjSeries(model.bars)
          const ySub = value => layout.subTop + layout.subH - (Math.max(0, Math.min(100, value)) / 100) * (layout.subH - 2)
          for (const line of [
            { series: kdj.k, color: brand },
            { series: kdj.d, color: warn },
            { series: kdj.j, color: idle },
          ]) {
            ctx.strokeStyle = line.color
            ctx.lineWidth = 1
            ctx.beginPath()
            let started = false
            for (let index = start; index <= end; index += 1) {
              const value = line.series[index]
              if (value === null || value === undefined) {
                started = false
                continue
              }
              const x = centerX(index)
              const y = ySub(value)
              if (started) ctx.lineTo(x, y)
              else {
                ctx.moveTo(x, y)
                started = true
              }
            }
            ctx.stroke()
          }
        } else {
          const ySub = value => layout.subTop + layout.subH - (Math.max(0, Math.min(100, value)) / 100) * (layout.subH - 2)
          for (const spec of [
            { length: 6, color: brand },
            { length: 12, color: warn },
            { length: 24, color: idle },
          ]) {
            const series = rsiSeries(closes, spec.length)
            ctx.strokeStyle = spec.color
            ctx.lineWidth = 1
            ctx.beginPath()
            let started = false
            for (let index = start; index <= end; index += 1) {
              const value = series[index]
              if (value === null || value === undefined) {
                started = false
                continue
              }
              const x = centerX(index)
              const y = ySub(value)
              if (started) ctx.lineTo(x, y)
              else {
                ctx.moveTo(x, y)
                started = true
              }
            }
            ctx.stroke()
          }
        }
      }

      // date axis
      ctx.fillStyle = muted
      ctx.textAlign = 'center'
      const axisY = H - layout.axisBottom / 2
      if (isTrend) {
        const days = model.dates.length
        const ticks = []
        for (let day = 0; day < days; day += 1) {
          const base = day * model.slotCount
          ticks.push({ index: base, label: days === 1 ? SESSION_TIMES[0] : model.dates[day] })
          ticks.push({ index: base + Math.floor(model.slotCount / 2), label: days === 1 ? SESSION_TIMES[Math.floor(model.slotCount / 2)] : '' })
          ticks.push({ index: base + model.slotCount - 1, label: days === 1 ? SESSION_TIMES[model.slotCount - 1] : '' })
        }
        if (days > 1) {
          for (let day = 1; day < days; day += 1) {
            const x = centerX(day * model.slotCount)
            ctx.strokeStyle = tokens['--dsw-alias-border-l1']
            ctx.setLineDash([2, 4])
            ctx.beginPath()
            ctx.moveTo(x, layout.top)
            ctx.lineTo(x, H - layout.axisBottom)
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
        for (const tick of ticks) {
          if (tick.label === '' || tick.index < start || tick.index > end) continue
          ctx.fillStyle = muted
          ctx.fillText(tick.label, Math.max(18, Math.min(plotW - 18, centerX(tick.index))), axisY)
        }
      } else {
        const step = Math.max(1, Math.floor(count / 5))
        for (let index = start; index <= end; index += step) {
          const bar = data[index]
          if (bar === null || bar === undefined) continue
          const label = model.period !== undefined && (model.period === 'month' || model.period === 'week') ? bar.d.slice(2) : bar.d.slice(5)
          ctx.fillStyle = muted
          ctx.fillText(label, Math.max(18, Math.min(plotW - 18, centerX(index))), axisY)
        }
      }

      // last price badge
      let lastIndex = -1
      for (let index = end; index >= start; index -= 1) {
        if (data[index] !== null && data[index] !== undefined) {
          lastIndex = index
          break
        }
      }
      if (lastIndex >= 0) {
        const lastBar = data[lastIndex]
        const lastPrice = isTrend ? lastBar.price : lastBar.c
        const rising = isTrend ? lastPrice >= model.prevClose : lastBar.c >= lastBar.o
        const color = rising ? up : down
        const y = Math.max(layout.mainTop + 6, Math.min(layout.mainTop + layout.mainH - 6, yMain(lastPrice)))
        ctx.fillStyle = color
        ctx.fillRect(plotW + 1, y - 8, 54, 16)
        ctx.fillStyle = tokens['--dsw-alias-bg-layer-1']
        ctx.textAlign = 'left'
        ctx.fillText(chartPrice(lastPrice), plotW + 6, y)
        ctx.strokeStyle = color
        ctx.setLineDash([3, 3])
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(plotW, y)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.setLineDash([])
      }

      // crosshair
      let focusIndex = lastIndex
      if (cursor !== null && cursor !== undefined) {
        focusIndex = Math.max(start, Math.min(end, Math.round(start + (cursor.x / Math.max(1, plotW)) * count - 0.5)))
        if (data[focusIndex] === null || data[focusIndex] === undefined) {
          for (let scan = focusIndex; scan >= start; scan -= 1) {
            if (data[scan] !== null && data[scan] !== undefined) {
              focusIndex = scan
              break
            }
          }
        }
        const x = centerX(focusIndex)
        ctx.strokeStyle = muted
        ctx.setLineDash([3, 3])
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.moveTo(x + 0.5, layout.top)
        ctx.lineTo(x + 0.5, H - layout.axisBottom)
        ctx.stroke()
        if (cursor.y > layout.mainTop && cursor.y < layout.mainTop + layout.mainH) {
          ctx.beginPath()
          ctx.moveTo(0, cursor.y + 0.5)
          ctx.lineTo(plotW, cursor.y + 0.5)
          ctx.stroke()
          const value = yMax - ((cursor.y - layout.mainTop) / layout.mainH) * (yMax - yMin)
          ctx.setLineDash([])
          ctx.fillStyle = tokens['--dsw-alias-label-primary']
          ctx.fillRect(plotW + 1, cursor.y - 8, 54, 16)
          ctx.fillStyle = tokens['--dsw-alias-bg-layer-1']
          ctx.textAlign = 'left'
          ctx.fillText(chartPrice(value), plotW + 6, cursor.y)
        }
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        const bar = data[focusIndex]
        const label = isTrend ? (bar.d || '') + ' ' + bar.t : bar.d
        ctx.fillStyle = tokens['--dsw-alias-label-primary']
        const width = Math.max(60, ctx.measureText(label).width + 14)
        const left = Math.max(0, Math.min(plotW - width, x - width / 2))
        ctx.fillRect(left, H - layout.axisBottom, width, layout.axisBottom - 2)
        ctx.fillStyle = tokens['--dsw-alias-bg-layer-1']
        ctx.textAlign = 'center'
        ctx.fillText(label, left + width / 2, H - layout.axisBottom + layout.axisBottom / 2 - 1)
      }

      // legend
      ctx.textAlign = 'left'
      const focus = focusIndex >= 0 ? data[focusIndex] : null
      let legendX = 2
      if (isTrend) {
        const parts = [
          { text: '均价 ' + chartPrice(focus !== null ? focus.avg : null), color: warn },
          { text: '昨收 ' + chartPrice(model.prevClose), color: muted },
        ]
        for (const part of parts) {
          ctx.fillStyle = part.color
          ctx.fillText(part.text, legendX, 8)
          legendX += ctx.measureText(part.text).width + 12
        }
      } else if (settings.ma && model.bars.length > 0) {
        const closes = model.bars.map(bar => bar.c)
        const specs = [
          { label: 'MA5', length: 5, color: brand },
          { label: 'MA10', length: 10, color: warn },
          { label: 'MA20', length: 20, color: idle },
        ]
        for (const spec of specs) {
          const series = movingAvg(closes, spec.length)
          const value = focusIndex >= 0 ? series[focusIndex] : null
          const text = spec.label + ' ' + chartPrice(value)
          ctx.fillStyle = spec.color
          ctx.fillText(text, legendX, 8)
          legendX += ctx.measureText(text).width + 12
        }
      }

      if (focus !== null) {
        const prevBar = focusIndex > 0 ? data[focusIndex - 1] : null
        const close = isTrend ? focus.price : focus.c
        const open = isTrend ? focus.price : focus.o
        const barHigh = isTrend ? focus.price : focus.h
        const barLow = isTrend ? focus.price : focus.l
        const reference = isTrend ? model.prevClose : prevBar !== null ? prevBar.c : open
        const change = reference > 0 ? (close - reference) / reference : 0
        const volume = isTrend ? focus.volume : focus.v
        const stamp = isTrend ? (focus.d || '') + ' ' + focus.t : focus.d
        const segments = [
          { text: stamp, color: muted },
          { text: '开 ' + chartPrice(open), color: strong },
          { text: '高 ' + chartPrice(barHigh), color: up },
          { text: '低 ' + chartPrice(barLow), color: down },
          { text: '收 ' + chartPrice(close), color: strong },
          { text: (change >= 0 ? '+' : '') + (change * 100).toFixed(2) + '%', color: change >= 0 ? up : down },
          { text: '量 ' + chartVolume(volume), color: muted },
        ]
        let x = 2
        for (const segment of segments) {
          ctx.fillStyle = segment.color
          ctx.fillText(segment.text, x, 20)
          x += ctx.measureText(segment.text).width + 10
        }
      }
      return true
    }

    function KChart(props) {
      const holderRef = useRef(null)
      const canvasRef = useRef(null)
      const propsRef = useRef(props)
      propsRef.current = props
      const storeRef = useRef({ count: undefined, end: undefined })
      const cursorRef = useRef(null)
      const frameRef = useRef(0)
      const dragRef = useRef(null)
      const pointersRef = useRef(new Map())
      const pinchRef = useRef(null)
      const resetRef = useRef(props.resetKey)

      if (resetRef.current !== props.resetKey) {
        resetRef.current = props.resetKey
        storeRef.current = { count: undefined, end: undefined }
        cursorRef.current = null
      }

      // Wheel must be a native non-passive listener so the page does not scroll;
      // it is attached from the paint effect because that is the first one that
      // runs after the canvas ref exists.
      const wheelBoundRef = useRef(false)
      const onWheel = event => {
        if (event.preventDefault) event.preventDefault()
        const metricsValue = metrics()
        if (metricsValue === null) return
        const ratio = Math.max(0, Math.min(1, (event.clientX - metricsValue.rect.left) / metricsValue.plotW))
        const anchor = metricsValue.view.start + ratio * metricsValue.view.count
        const factor = event.deltaY > 0 ? 1.25 : 0.8
        const nextCount = Math.max(20, Math.min(metricsValue.total, Math.round(metricsValue.view.count * factor)))
        storeRef.current.count = nextCount
        storeRef.current.end = Math.max(nextCount - 1, Math.min(metricsValue.total - 1, Math.round(anchor + (1 - ratio) * nextCount) - 1))
        schedule()
      }

      const paintRef = useRef(() => {})
      paintRef.current = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        drawKChart(canvas, propsRef.current.model, storeRef.current, cursorRef.current, propsRef.current.settings, propsRef.current.texts)
      }
      const schedule = () => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
          paintRef.current()
          return
        }
        if (frameRef.current !== 0) return
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = 0
          paintRef.current()
        })
      }

      const metrics = () => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.clientWidth, height: canvas.clientHeight }
        const model = propsRef.current.model
        if (model === null) return null
        const isTrend = model.kind === 'trend'
        const total = isTrend ? model.series.length : model.bars.length
        if (total === 0) return null
        const view = resolveView(storeRef.current, total, isTrend ? total : 120)
        const plotW = Math.max(1, rect.width - 58)
        return { rect, view, plotW, total, isTrend }
      }

      const pointerPosition = event => {
        const metricsValue = metrics()
        if (metricsValue === null) return null
        const x = Math.max(0, Math.min(metricsValue.plotW, event.clientX - metricsValue.rect.left))
        const y = Math.max(0, event.clientY - metricsValue.rect.top)
        const index = Math.max(metricsValue.view.start, Math.min(metricsValue.view.end, Math.round(metricsValue.view.start + (x / metricsValue.plotW) * metricsValue.view.count - 0.5)))
        return Object.assign({ x, y, index }, metricsValue)
      }

      useEffect(() => {
        const canvas = canvasRef.current
        if (canvas && !wheelBoundRef.current && typeof canvas.addEventListener === 'function') {
          wheelBoundRef.current = true
          canvas.addEventListener('wheel', onWheel, { passive: false })
        }
        schedule()
      })

      useEffect(() => {
        const holder = holderRef.current
        if (!holder) return undefined
        let observer = null
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(() => schedule())
          observer.observe(holder)
        }
        const onResize = () => schedule()
        if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onResize)
        schedule()
        return () => {
          if (observer !== null) observer.disconnect()
          if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onResize)
        }
      }, [])

      const onPointerDown = event => {
        const metricsValue = metrics()
        if (metricsValue === null) return
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointersRef.current.size === 2) {
          const values = [...pointersRef.current.values()]
          pinchRef.current = { distance: Math.abs(values[0].x - values[1].x), count: metricsValue.view.count }
          dragRef.current = null
          return
        }
        dragRef.current = { x: event.clientX, end: metricsValue.view.end, moved: false }
        if (canvasRef.current && typeof canvasRef.current.setPointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            canvasRef.current.setPointerCapture(event.pointerId)
          } catch {
            /* capture is optional */
          }
        }
      }

      const onPointerMove = event => {
        const metricsValue = metrics()
        if (metricsValue === null) return
        if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointersRef.current.size === 2 && pinchRef.current !== null) {
          const values = [...pointersRef.current.values()]
          const distance = Math.abs(values[0].x - values[1].x)
          if (pinchRef.current.distance > 0) {
            const nextCount = Math.max(20, Math.min(metricsValue.total, Math.round(pinchRef.current.count * (pinchRef.current.distance / Math.max(1, distance)))))
            storeRef.current.count = nextCount
            storeRef.current.end = Math.min(metricsValue.total - 1, Math.max(nextCount - 1, metricsValue.view.end))
            schedule()
          }
          return
        }
        if (dragRef.current !== null) {
          const deltaBars = Math.round((event.clientX - dragRef.current.x) / (metricsValue.plotW / metricsValue.view.count))
          if (Math.abs(event.clientX - dragRef.current.x) > 2) dragRef.current.moved = true
          const end = dragRef.current.end - deltaBars
          storeRef.current.end = Math.max(metricsValue.view.count - 1, Math.min(metricsValue.total - 1, end))
          cursorRef.current = null
          schedule()
          return
        }
        const position = pointerPosition(event)
        if (position === null) return
        cursorRef.current = { x: position.x, y: position.y }
        schedule()
      }

      const endPointer = event => {
        pointersRef.current.delete(event.pointerId)
        if (pointersRef.current.size < 2) pinchRef.current = null
        dragRef.current = null
      }

      const onPointerLeave = () => {
        if (dragRef.current !== null) return
        cursorRef.current = null
        schedule()
      }

      const onDoubleClick = () => {
        storeRef.current = { count: undefined, end: undefined }
        cursorRef.current = null
        schedule()
      }

      const onKeyDown = event => {
        const metricsValue = metrics()
        if (metricsValue === null) return
        const total = metricsValue.total
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const step = event.key === 'ArrowLeft' ? -1 : 1
          const current = cursorRef.current === null ? metricsValue.view.end : Math.round(metricsValue.view.start + (cursorRef.current.x / metricsValue.plotW) * metricsValue.view.count)
          const next = Math.max(metricsValue.view.start, Math.min(metricsValue.view.end, current + step))
          cursorRef.current = { x: ((next - metricsValue.view.start + 0.5) / metricsValue.view.count) * metricsValue.plotW, y: 10 }
          schedule()
          if (event.preventDefault) event.preventDefault()
          return
        }
        if (event.key === '+' || event.key === '=' || event.key === '-') {
          const factor = event.key === '-' ? 1.25 : 0.8
          const nextCount = Math.max(20, Math.min(total, Math.round(metricsValue.view.count * factor)))
          storeRef.current.count = nextCount
          storeRef.current.end = Math.min(total - 1, Math.max(nextCount - 1, metricsValue.view.end))
          schedule()
          if (event.preventDefault) event.preventDefault()
          return
        }
        if (event.key === '0' || event.key === 'Home') {
          storeRef.current = { count: undefined, end: undefined }
          cursorRef.current = null
          schedule()
          if (event.preventDefault) event.preventDefault()
        }
      }

      return h(
        'div',
        { className: 'ar-chart-holder', ref: holderRef, style: { height: props.height + 'px' } },
        h('canvas', {
          ref: canvasRef,
          className: 'ar-canvas',
          tabIndex: 0,
          role: 'img',
          'aria-label': props.label,
          onPointerDown,
          onPointerMove,
          onPointerUp: endPointer,
          onPointerCancel: endPointer,
          onPointerLeave,
          onDoubleClick,
          onKeyDown,
        }),
        h(
          'div',
          { className: 'ar-chart-hint' },
          props.hint,
        ),
      )
    }

    async function loadFlow(code, secid, signal) {
      const target =
        API +
        '/flow?code=' +
        code +
        (secid === undefined || secid === null ? '' : '&secid=' + encodeURIComponent(secid))
      const response = await fetch(endpoint(target), { cache: 'no-store', signal })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const body = await response.json()
      return body !== null && typeof body === 'object' && body.flow ? body.flow : null
    }

    function BookGrid(props) {
      const { t, info, stats, limits, isIndex, volumeState } = props
      const prev = info.prevClose
      const versusPrev = value => (value === null || value === undefined || prev === null || prev === undefined ? null : value - prev)
      const amplitude =
        info.high !== null && info.low !== null && prev !== null && prev !== undefined && prev !== 0
          ? ((info.high - info.low) / prev) * 100
          : null
      const cells = [
        { key: 'open', label: t('book.open'), value: price(info.open), tone: toneOf(versusPrev(info.open)) },
        { key: 'high', label: t('book.high'), value: price(info.high), tone: toneOf(versusPrev(info.high)) },
        { key: 'low', label: t('book.low'), value: price(info.low), tone: toneOf(versusPrev(info.low)) },
        { key: 'prev', label: t('book.prev'), value: price(prev), tone: '' },
        { key: 'limitUp', label: t('book.limitUp'), value: limits !== null && limits !== undefined && limits.up !== null ? price(limits.up) : '—', tone: 'ar-up', stockOnly: true },
        { key: 'limitDown', label: t('book.limitDown'), value: limits !== null && limits !== undefined && limits.down !== null ? price(limits.down) : '—', tone: 'ar-down', stockOnly: true },
        { key: 'amplitude', label: t('book.amplitude'), value: amplitude === null ? '—' : amplitude.toFixed(2) + '%', tone: '' },
        { key: 'turnover', label: t('book.turnover'), value: info.turnover === null || info.turnover === undefined ? '—' : info.turnover + '%', tone: '', stockOnly: true },
        { key: 'volume', label: t('book.volume'), value: info.volume === null || info.volume === undefined ? '—' : chartVolume(info.volume) + t('book.lot'), tone: '' },
        { key: 'amount', label: t('book.amount'), value: yi(info.amount), tone: '' },
        { key: 'volRatio', label: t('book.volRatio'), value: typeof info.volRatio === 'number' ? info.volRatio.toFixed(2) : '—', tone: '' },
        { key: 'avgVol5', label: t('book.avgVol5'), value: stats !== null && stats !== undefined && stats.avgVolume5 !== null ? chartVolume(stats.avgVolume5) + t('book.lot') : '—', tone: '' },
        {
          key: 'volumeState',
          label: t('vol.title'),
          value: volumeState === null || volumeState === undefined ? '—' : t('vol.' + volumeState.label),
          tone: volumeTone(volumeState),
        },
        { key: 'mktCap', label: t('book.mktCap'), value: yi(info.mktCap, 0), tone: '', stockOnly: true },
        { key: 'floatCap', label: t('book.floatCap'), value: yi(info.floatCap, 0), tone: '', stockOnly: true },
        { key: 'pe', label: t('book.pe'), value: info.pe === null || info.pe === undefined ? '—' : info.pe > 0 ? info.pe : t('book.loss'), tone: '', stockOnly: true },
        { key: 'pb', label: t('book.pb'), value: info.pb === null || info.pb === undefined ? '—' : info.pb, tone: '', stockOnly: true },
      ].filter(cell => !isIndex || cell.stockOnly !== true)
      return h(
        'div',
        { className: 'ar-panel' },
        h('h3', null, h('span', null, t('book.title'))),
        h(
          'div',
          { className: 'ar-book' },
          cells.map(cell =>
            h(
              'div',
              { className: 'ar-book-cell', key: cell.key },
              h('span', null, cell.label),
              h('b', { className: cell.tone }, cell.value),
            ),
          ),
        ),
      )
    }

    function FlowCurve(props) {
      const series = props.series
      const values = series.map(point => point.main || 0)
      if (values.length < 2) return null
      const min = Math.min(0, Math.min.apply(null, values))
      const max = Math.max(0, Math.max.apply(null, values))
      const span = max - min || 1
      const W = 300
      const H = 44
      const x = index => (index / (values.length - 1)) * W
      const y = value => H - ((value - min) / span) * H
      const path = values.map((value, index) => (index === 0 ? 'M' : 'L') + x(index).toFixed(1) + ' ' + y(value).toFixed(1)).join(' ')
      const rising = values[values.length - 1] >= 0
      return h(
        'svg',
        { className: 'ar-flow-curve', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': true },
        h('line', { x1: 0, x2: W, y1: y(0), y2: y(0), stroke: 'var(--dsw-alias-border-l1)', strokeDasharray: '3 3' }),
        h('path', {
          d: path,
          fill: 'none',
          stroke: rising ? 'var(--ar-up)' : 'var(--ar-down)',
          strokeWidth: 1.4,
        }),
      )
    }

    function FlowPanel(props) {
      const { t, flow } = props
      if (flow === null || flow === undefined || flow.latest === null || flow.latest === undefined) {
        return h('div', { className: 'ar-panel' }, h('h3', null, h('span', null, t('flow.title'))), h('div', { className: 'ar-empty' }, t('flow.empty')))
      }
      const latest = flow.latest
      const rows = [
        { key: 'super', label: t('flow.super'), value: latest.super },
        { key: 'large', label: t('flow.large'), value: latest.large },
        { key: 'medium', label: t('flow.medium'), value: latest.medium },
        { key: 'small', label: t('flow.small'), value: latest.small },
      ]
      const max = Math.max(1, Math.abs(latest.main || 0), ...rows.map(row => Math.abs(row.value || 0)))
      return h(
        'div',
        { className: 'ar-panel' },
        h(
          'h3',
          null,
          h('span', null, t('flow.title')),
          h('b', { className: 'ar-flow-main ' + toneOf(latest.main) }, (latest.main > 0 ? '+' : '') + yi(latest.main)),
        ),
        rows.map(row =>
          h(
            'div',
            { className: 'ar-flow-row', key: row.key },
            h('span', null, row.label),
            h(
              'span',
              { className: 'ar-flow-track' },
              h('i', {
                className: row.value !== null && row.value >= 0 ? 'ar-up' : 'ar-down',
                style:
                  row.value === null
                    ? { width: '0%', left: '50%' }
                    : row.value >= 0
                      ? { left: '50%', width: (Math.abs(row.value) / max) * 50 + '%' }
                      : { left: 50 - (Math.abs(row.value) / max) * 50 + '%', width: (Math.abs(row.value) / max) * 50 + '%' },
              }),
            ),
            h('span', { className: toneOf(row.value) }, row.value === null ? '—' : (row.value > 0 ? '+' : '') + yi(row.value)),
          ),
        ),
        flow.series.length > 1
          ? h('div', { className: 'ar-flow-block' }, h('div', { className: 'ar-flow-legend' }, h('span', null, t('flow.intraday'))), h(FlowCurve, { series: flow.series }))
          : null,
        flow.history.length > 0
          ? h(
              'div',
              { className: 'ar-flow-block' },
              h('div', { className: 'ar-flow-legend' }, h('span', null, t('flow.history'))),
              flow.history
                .slice()
                .reverse()
                .map(day =>
                  h(
                    'div',
                    { className: 'ar-flow-day', key: day.d },
                    h('span', null, day.d.slice(5)),
                    h('span', { className: toneOf(day.pct) }, day.pct === null ? '—' : (day.pct > 0 ? '+' : '') + day.pct + '%'),
                    h('span', { className: toneOf(day.main) }, day.main === null ? '—' : (day.main > 0 ? '+' : '') + yi(day.main)),
                  ),
                ),
            )
          : null,
      )
    }

    function TechPanel(props) {
      const { t, stats, live } = props
      if (stats === null || stats === undefined) {
        return h('div', { className: 'ar-panel' }, h('h3', null, h('span', null, t('tech.title'))), h('div', { className: 'ar-empty' }, t('tech.empty')))
      }
      const mas = [
        { label: 'MA5', value: stats.ma5 },
        { label: 'MA10', value: stats.ma10 },
        { label: 'MA20', value: stats.ma20 },
        { label: 'MA60', value: stats.ma60 },
      ]
      const bull = stats.ma5 !== null && stats.ma10 !== null && stats.ma20 !== null && stats.ma5 > stats.ma10 && stats.ma10 > stats.ma20
      const bear = stats.ma5 !== null && stats.ma10 !== null && stats.ma20 !== null && stats.ma5 < stats.ma10 && stats.ma10 < stats.ma20
      const arrangement = bull ? t('tech.bull') : bear ? t('tech.bear') : t('tech.mixed')
      const macd = stats.macd
      const macdState =
        macd === null
          ? '—'
          : macd.hist > 0 && macd.dif > macd.dea
            ? t('tech.goldenCross')
            : macd.hist < 0 && macd.dif < macd.dea
              ? t('tech.deadCross')
              : t('tech.neutral')
      const kdj = stats.kdj
      const kdjState = kdj === null ? '—' : kdj.j > 90 || kdj.k > 85 ? t('tech.overbought') : kdj.j < 10 || kdj.k < 15 ? t('tech.oversold') : t('tech.neutral')
      const ranges = [
        { key: '20', label: t('tech.range20'), position: stats.position20, low: stats.low20, high: stats.high20 },
        { key: '60', label: t('tech.range60'), position: stats.position60, low: stats.low60, high: stats.high60 },
      ]
      return h(
        'div',
        { className: 'ar-panel' },
        h('h3', null, h('span', null, t('tech.title')), h('span', { className: 'ar-card-note' }, arrangement)),
        h(
          'div',
          { className: 'ar-tech-mas' },
          mas.map(row =>
            h(
              'div',
              { className: 'ar-tech-ma', key: row.label },
              h('span', null, row.label),
              h('b', { className: toneOf(live !== null && row.value !== null ? live - row.value : null) }, chartPrice(row.value)),
            ),
          ),
        ),
        h(
          'div',
          { className: 'ar-tech-chips' },
          h('span', { className: 'ar-tag' }, 'MACD ' + macdState),
          h('span', { className: 'ar-tag' }, 'KDJ ' + kdjState),
          h('span', { className: 'ar-tag' }, 'RSI6 ' + (stats.rsi6 === null ? '—' : stats.rsi6)),
          h('span', { className: 'ar-tag' }, t('book.volRatio') + ' ' + (stats.volumeRatio5 === null ? '—' : stats.volumeRatio5.toFixed(2))),
        ),
        ranges.map(range =>
          h(
            'div',
            { className: 'ar-tech-range', key: range.key },
            h('div', { className: 'ar-flow-legend' }, h('span', null, range.label), h('span', null, chartPrice(range.low) + ' — ' + chartPrice(range.high))),
            h(
              'div',
              { className: 'ar-range' },
              h('i', { style: { left: Math.max(0, Math.min(100, range.position === null ? 50 : range.position)) + '%' } }),
            ),
            h('div', { className: 'ar-flow-legend' }, h('span', null, t('tech.position') + ' ' + (range.position === null ? '—' : range.position + '%'))),
          ),
        ),
      )
    }

    function TradePanel(props) {
      const { t, code, name, price, account, onTrade } = props
      const [shares, setShares] = useState(100)
      const [flash, setFlash] = useState(null)
      const position = account.positions[code] || null
      const lots = position === null ? 0 : position.qty
      const float = position === null || price === null ? null : (price - position.cost) * position.qty
      const submit = side => {
        const result = onTrade(side, Math.floor(Number(shares) || 0), price, { code, name })
        setFlash(result)
      }
      return h(
        'div',
        { className: 'ar-trade' },
        h(
          'div',
          { className: 'ar-trade-meta' },
          h('span', null, t('trade.cash'), ' ', h('b', null, '¥' + account.cash.toFixed(0))),
          h('span', null, t('trade.position'), ' ', h('b', null, lots === 0 ? '—' : lots + ' 股')),
          position === null ? null : h('span', null, t('trade.cost'), ' ', h('b', null, price2(position.cost))),
          position === null ? null : h('span', { className: toneOf(float) }, t('trade.float'), ' ', h('b', null, (float > 0 ? '+' : '') + float.toFixed(0))),
          h('span', null, t('trade.realized'), ' ', h('b', { className: toneOf(account.realized) }, account.realized.toFixed(0))),
        ),
        h(
          'div',
          { className: 'ar-trade-row' },
          h('input', {
            className: 'ar-input',
            type: 'number',
            min: 100,
            step: 100,
            value: shares,
            'aria-label': t('trade.qty'),
            onChange: event => setShares(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') submit('buy')
            },
          }),
          h('button', { type: 'button', className: 'ar-btn ar-buy', onClick: () => submit('buy') }, t('trade.buy')),
          h(
            'button',
            {
              type: 'button',
              className: 'ar-btn ar-sell',
              disabled: position === null,
              onClick: () => submit('sell'),
            },
            t('trade.sell'),
          ),
          h('span', { className: 'ar-paper-note' }, t('trade.hint')),
        ),
        flash === null ? null : h('div', { className: 'ar-flash ' + (flash.ok ? 'ar-ok' : 'ar-bad') }, flash.message),
        account.trades.length === 0
          ? null
          : h(
              'div',
              { className: 'ar-trades' },
              account.trades.slice(0, 6).map(trade =>
                h(
                  'div',
                  { key: trade.id },
                  h('span', null, clockText(trade.at) + ' ' + (trade.side === 'buy' ? t('trade.buy') : t('trade.sell')) + ' ' + trade.name),
                  h('span', null, trade.qty + ' @ ' + price2(trade.price)),
                ),
              ),
            ),
      )
    }

    const PERIOD_TABS = [
      { id: 'trend', key: 'detail.trend' },
      { id: 'trend5', key: 'detail.trend5' },
      { id: 'day', key: 'detail.day' },
      { id: 'week', key: 'detail.week' },
      { id: 'month', key: 'detail.month' },
      { id: 'm60', key: 'detail.m60' },
      { id: 'm30', key: 'detail.m30' },
      { id: 'm15', key: 'detail.m15' },
      { id: 'm5', key: 'detail.m5' },
      { id: 'm1', key: 'detail.m1' },
    ]

    function clientLimits(code, name, prevClose) {
      let ratio = 0.1
      if (/^[48]/.test(code)) ratio = 0.3
      else if (/^(30|68)/.test(code)) ratio = 0.2
      if (typeof name === 'string' && name.indexOf('ST') !== -1) ratio = 0.05
      if (prevClose === null || prevClose === undefined) return { pct: ratio, up: null, down: null }
      return {
        pct: ratio,
        up: Math.round(prevClose * (1 + ratio) * 100) / 100,
        down: Math.round(prevClose * (1 - ratio) * 100) / 100,
      }
    }

    function buildChartModel(data, period) {
      if (data === null || data === undefined) return null
      if (period === 'trend' || period === 'trend5') {
        const trend = data.trend
        const points = trend !== null && trend !== undefined && Array.isArray(trend.points) ? trend.points : []
        const built = buildTrendSeries(points)
        return {
          kind: 'trend',
          days: period === 'trend5' ? 5 : 1,
          dates: built.dates,
          series: built.series,
          slotCount: built.slotCount,
          prevClose: trend !== null && trend !== undefined ? trend.prevClose : null,
          limits: data.limits || null,
        }
      }
      const bars = Array.isArray(data.bars) ? data.bars.slice() : []
      const quote = data.quote
      const trading = data.market !== null && data.market !== undefined && data.market.trading
      if (trading && quote !== null && quote !== undefined && typeof quote.price === 'number' && bars.length > 0) {
        const last = Object.assign({}, bars[bars.length - 1])
        last.c = quote.price
        if (quote.price > last.h) last.h = quote.price
        if (quote.price < last.l) last.l = quote.price
        bars[bars.length - 1] = last
      }
      return { kind: 'kline', period, bars }
    }

    function BoardTags(props) {
      const { t, boards, industry, onOpen } = props
      const list = (boards || [])
        .filter(board => board.name !== industry)
        .slice()
        .sort((a, b) => (b.thematic === true ? 1 : 0) - (a.thematic === true ? 1 : 0))
        .slice(0, 10)
      if (list.length === 0) return null
      return h(
        'div',
        { className: 'ar-panel' },
        h('h3', null, h('span', null, t('detail.boards'))),
        h(
          'div',
          { className: 'ar-strategy-row' },
          list.map(board =>
            h(
              'button',
              {
                key: board.code,
                type: 'button',
                className: 'ar-chip',
                title: t('detail.toBoard'),
                onClick: () => onOpen({ code: board.code, name: board.name }),
              },
              h('span', null, board.name),
              h('em', { className: 'ar-chip-pct ' + toneOf(board.pct) }, pctText(board.pct)),
            ),
          ),
        ),
      )
    }

    function NewsPanel(props) {
      const { t, data } = props
      const news = data !== null && data !== undefined && Array.isArray(data.news) ? data.news : []
      const announcements = data !== null && data !== undefined && Array.isArray(data.announcements) ? data.announcements : []
      const renderItem = (item, key) =>
        h(
          'a',
          { key: key, className: 'ar-news-item', href: item.url, target: '_blank', rel: 'noreferrer' },
          h('span', { className: 'ar-news-title' }, item.title),
          h('span', { className: 'ar-news-meta' }, item.date + (item.source === undefined || item.source === '' ? '' : ' · ' + item.source)),
        )
      return h(
        'div',
        { className: 'ar-panel' },
        h('h3', null, h('span', null, t('news.title'))),
        h(
          'div',
          { className: 'ar-news-cols' },
          h(
            'div',
            { className: 'ar-news-col' },
            h('div', { className: 'ar-flow-legend' }, h('span', null, t('news.latest'))),
            news.length === 0
              ? h('div', { className: 'ar-empty' }, t('news.empty'))
              : news.slice(0, 6).map((item, index) => renderItem(item, 'n' + index)),
          ),
          h(
            'div',
            { className: 'ar-news-col' },
            h('div', { className: 'ar-flow-legend' }, h('span', null, t('news.announcements'))),
            announcements.length === 0
              ? h('div', { className: 'ar-empty' }, t('news.empty'))
              : announcements.slice(0, 6).map((item, index) => renderItem(item, 'a' + index)),
          ),
        ),
      )
    }

    function AnalysisCards(props) {
      const { t, data } = props
      const dimensions = Array.isArray(data.dimensions) ? data.dimensions : []
      const tone = verdict => (verdict === '偏多' ? 'ar-up' : verdict === '偏空' ? 'ar-down' : 'ar-flat')
      return h(
        'div',
        { className: 'ar-ai-result' },
        h(
          'div',
          { className: 'ar-ai-summary' },
          h('span', { className: 'ar-ai-verdict ' + tone(data.verdict) }, data.verdict || '—'),
          h('p', null, data.summary || ''),
          data.confidence === undefined || data.confidence === null
            ? null
            : h('span', { className: 'ar-card-note' }, t('ai.confidence') + ' ' + data.confidence),
        ),
        h(
          'div',
          { className: 'ar-ai-dims' },
          dimensions.map(dimension =>
            h(
              'div',
              { className: 'ar-ai-dim', key: dimension.id || dimension.label },
              h(
                'div',
                { className: 'ar-ai-dim-head' },
                h('b', null, dimension.label || dimension.id || ''),
                h('span', { className: tone(dimension.verdict) }, dimension.verdict || ''),
                h('em', null, typeof dimension.score === 'number' ? dimension.score : '—'),
              ),
              h('div', { className: 'ar-meter' }, h('i', { style: { width: Math.max(0, Math.min(100, dimension.score || 0)) + '%' } })),
              dimension.reason ? h('p', null, dimension.reason) : null,
              dimension.risk ? h('p', { className: 'ar-ai-risk' }, t('ai.risk') + '：' + dimension.risk) : null,
            ),
          ),
        ),
        data.levels === undefined || data.levels === null
          ? null
          : h(
              'div',
              { className: 'ar-ai-levels' },
              h('span', null, t('ai.support') + ' ' + (data.levels.support === undefined || data.levels.support === null ? '—' : data.levels.support)),
              h('span', null, t('ai.resistance') + ' ' + (data.levels.resistance === undefined || data.levels.resistance === null ? '—' : data.levels.resistance)),
              h('span', null, t('ai.target') + ' ' + (data.levels.target || '—')),
            ),
        Array.isArray(data.risks) && data.risks.length > 0
          ? h('ul', { className: 'ar-reasons' }, data.risks.map((risk, index) => h('li', { key: 'r' + index }, String(risk))))
          : null,
      )
    }

    function AIPanel(props) {
      const { t, stock } = props
      const [turns, setTurns] = useState([])
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const [draft, setDraft] = useState('')
      const [live, setLive] = useState('')
      const [modelLabel, setModelLabel] = useState('')

      const run = async question => {
        if (busy) return
        const history = turns.map(turn => ({ role: turn.role, content: turn.content }))
        setBusy(true)
        setError(null)
        setLive('')
        if (question !== '') setTurns(previous => previous.concat([{ role: 'user', content: question }]))
        let text = ''
        let parsed = null
        let wasTruncated = false
        try {
          const response = await fetch(endpoint(API + '/analyze'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: stock.code, name: stock.name, question, history }),
          })
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            throw new Error(body !== null && body.error ? body.error : 'HTTP ' + response.status)
          }
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            buffer += decoder.decode(chunk.value, { stream: true })
            let index = buffer.indexOf('\n')
            while (index !== -1) {
              const line = buffer.slice(0, index).trim()
              buffer = buffer.slice(index + 1)
              index = buffer.indexOf('\n')
              if (line === '') continue
              let event
              try {
                event = JSON.parse(line)
              } catch {
                continue
              }
              if (event.type === 'delta') {
                text += event.text
                setLive(text)
              } else if (event.type === 'meta') {
                setModelLabel(String(event.model || ''))
              } else if (event.type === 'error') {
                throw new Error(event.message || '模型调用失败')
              } else if (event.type === 'done') {
                parsed = event.parsed === undefined || event.parsed === null ? null : event.parsed
                wasTruncated = event.truncated === true
              }
            }
          }
          setTurns(previous =>
            previous.concat([{ role: 'assistant', content: text, parsed, followUp: question !== '', truncated: wasTruncated }]),
          )
          setLive('')
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'ar-panel ar-ai' },
        h(
          'h3',
          null,
          h('span', null, t('ai.title')),
          modelLabel === '' ? null : h('span', { className: 'ar-card-note' }, modelLabel),
        ),
        turns.length === 0 && !busy
          ? h(
              'div',
              { className: 'ar-ai-intro' },
              h('p', null, t('ai.intro')),
              h('button', { type: 'button', className: 'ar-btn ar-primary', onClick: () => run('') }, t('ai.run')),
            )
          : null,
        turns.map((turn, index) =>
          turn.role === 'user'
            ? h('div', { className: 'ar-ai-user', key: 'u' + index }, turn.content)
            : turn.followUp
              ? h('div', { className: 'ar-ai-answer', key: 'a' + index }, turn.content)
              : turn.parsed
                ? h(AnalysisCards, { key: 'a' + index, t, data: turn.parsed })
                : h(
                    'div',
                    { className: 'ar-ai-fallback', key: 'a' + index },
                    turn.truncated === true ? h('div', { className: 'ar-ai-status' }, t('ai.truncated')) : null,
                    h('pre', { className: 'ar-ai-raw' }, turn.content),
                  ),
        ),
        busy
          ? h(
              'div',
              { className: 'ar-ai-live' },
              h('div', { className: 'ar-ai-status' }, t('ai.running')),
              live === '' ? null : h('pre', { className: 'ar-ai-raw' }, live),
            )
          : null,
        error === null ? null : h('div', { className: 'ar-flash ar-bad' }, error),
        h(
          'div',
          { className: 'ar-ai-input' },
          h('input', {
            className: 'ar-input',
            value: draft,
            placeholder: t('ai.ask'),
            onChange: event => setDraft(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter' && !busy) {
                const question = draft.trim()
                if (question !== '') {
                  setDraft('')
                  run(question)
                }
              }
            },
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'ar-btn',
              disabled: busy || draft.trim() === '',
              onClick: () => {
                const question = draft.trim()
                if (question === '') return
                setDraft('')
                run(question)
              },
            },
            t('ai.send'),
          ),
        ),
        h('div', { className: 'ar-paper-note' }, t('ai.disclaimer')),
      )
    }

    function DetailModal(props) {
      const { t, stock, account, onTrade, onClose, trading, watched, onToggleWatch, watchFull, onOpenBoard } = props
      const isIndex = stock.kind === 'index'
      const [period, setPeriod] = useState('trend')
      const [adjust, setAdjust] = useState(1)
      const [sub, setSub] = useState('MACD')
      const [showMA, setShowMA] = useState(true)
      const [wide, setWide] = useState(false)
      const [data, setData] = useState(null)
      const [flow, setFlow] = useState(null)
      const [news, setNews] = useState(null)
      const [error, setError] = useState(null)

      useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        const load = async () => {
          try {
            const fresh = !document.hidden
            const body = await loadDetail(stock.code, period, adjust, fresh, controller.signal, stock.secid, isIndex)
            if (cancelled) return
            setData(body)
            setError(null)
          } catch (cause) {
            if (!cancelled && cause && cause.name !== 'AbortError') setError(cause.message || String(cause))
          }
        }
        load()
        // A 5-day intraday series is ~1.1k points; refreshing it every five
        // seconds would move a lot of bytes for very little change.
        const interval = period === 'trend5' ? 15000 : trading ? 5000 : 30000
        const timer = window.setInterval(() => {
          if (!document.hidden) load()
        }, interval)
        return () => {
          cancelled = true
          controller.abort()
          window.clearInterval(timer)
        }
      }, [stock.code, stock.secid, period, adjust, trading])

      useEffect(() => {
        if (isIndex) {
          setFlow(null)
          return undefined
        }
        let cancelled = false
        const controller = new AbortController()
        const load = async () => {
          try {
            const body = await loadFlow(stock.code, stock.secid, controller.signal)
            if (!cancelled) setFlow(body)
          } catch (cause) {
            if (!cancelled && cause && cause.name !== 'AbortError') setFlow(null)
          }
        }
        load()
        const timer = window.setInterval(() => {
          if (!document.hidden) load()
        }, trading ? 15000 : 60000)
        return () => {
          cancelled = true
          controller.abort()
          window.clearInterval(timer)
        }
      }, [stock.code, stock.secid, isIndex, trading])

      useEffect(() => {
        if (isIndex) {
          setNews(null)
          return undefined
        }
        let cancelled = false
        const controller = new AbortController()
        const load = async () => {
          try {
            const target = API + '/news?code=' + stock.code + '&name=' + encodeURIComponent(stock.name || '')
            const response = await fetch(endpoint(target), { cache: 'no-store', signal: controller.signal })
            if (!response.ok) return
            const body = await response.json()
            if (!cancelled) setNews(body)
          } catch {
            /* keep whatever we already showed */
          }
        }
        load()
        const timer = window.setInterval(() => {
          if (!document.hidden) load()
        }, 300000)
        return () => {
          cancelled = true
          controller.abort()
          window.clearInterval(timer)
        }
      }, [stock.code, stock.name, isIndex])

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])

      const isTrend = period === 'trend' || period === 'trend5'
      const boardList = data !== null && Array.isArray(data.boards) ? data.boards : []
      const boardCodeOf = name => {
        const hit = boardList.find(board => board.name === name)
        return hit === undefined ? null : hit.code
      }
      const stats = data !== null && data.stats !== undefined ? data.stats : null
      const info = data !== null && data.quote !== null && data.quote !== undefined ? Object.assign({}, stock, data.quote) : stock
      const industryBoard = boardList.find(board => board.name === info.industry)
      const model = buildChartModel(data, period)
      const quotePrice = data !== null && data.quote !== null && data.quote !== undefined && typeof data.quote.price === 'number' ? data.quote.price : null
      const trendPoints = data !== null && data.trend !== null && data.trend !== undefined && Array.isArray(data.trend.points) ? data.trend.points : []
      const lastPoint = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1] : null
      const live = quotePrice !== null ? quotePrice : lastPoint !== null ? lastPoint.price : stock.price
      const base =
        data !== null && data.trend !== null && data.trend !== undefined && typeof data.trend.prevClose === 'number'
          ? data.trend.prevClose
          : info.prevClose !== null && info.prevClose !== undefined
            ? info.prevClose
            : null
      const pct = live !== null && base ? ((live - base) / base) * 100 : info.pct
      const barsForTech = model !== null && model.kind === 'kline' ? model.bars : []
      const closes = barsForTech.map(bar => bar.c)
      const ma20 = closes.length >= 20 ? movingAvg(closes, 20) : []
      const lastMa20 = ma20.length > 0 ? ma20[ma20.length - 1] : null
      const bias = lastMa20 !== null && live !== null ? ((live - lastMa20) / lastMa20) * 100 : null
      const rsi = closes.length > 6 ? rsiOf(closes, 6) : null
      const chartHeight = wide
        ? Math.max(420, Math.round(((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.66)))
        : 430

      return portal(
        h(
          'div',
          { className: 'ar-modal-backdrop', onMouseDown: onClose },
          h(
            'div',
            {
              className: 'ar-modal' + (wide ? ' ar-wide' : ''),
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': stock.name + ' ' + stock.code,
              onMouseDown: event => event.stopPropagation(),
            },
            h(
              'div',
              { className: 'ar-modal-head' },
              h(
                'div',
                { style: { minWidth: 0 } },
                h(
                  'div',
                  { className: 'ar-modal-title' },
                  h('h2', null, stock.name),
                  h('span', null, stock.code),
                  isIndex
                    ? h('span', null, t('detail.index'))
                    : info.industry === null || info.industry === undefined
                      ? null
                      : boardCodeOf(info.industry) === null
                        ? h('span', null, info.industry)
                        : h(
                            'button',
                            {
                              type: 'button',
                              className: 'ar-chip ar-industry',
                              title: t('detail.toBoard'),
                              onClick: () => onOpenBoard({ code: boardCodeOf(info.industry), name: info.industry }),
                            },
                            h('span', null, info.industry),
                            h(
                              'em',
                              { className: 'ar-chip-pct ' + toneOf(industryBoard === undefined ? null : industryBoard.pct) },
                              pctText(industryBoard === undefined ? null : industryBoard.pct),
                            ),
                          ),
                  isIndex || info.pe === null || info.pe === undefined || info.pe <= 0 ? null : h('span', null, 'PE ' + info.pe),
                ),
                h(
                  'div',
                  { className: 'ar-modal-price' },
                  h('b', { className: toneOf(pct) }, price(live)),
                  h('i', { className: toneOf(pct) }, pctText(pct)),
                  h('span', { className: 'ar-card-note' }, t('detail.turnover') + ' ' + yi(info.amount)),
                  h('span', { className: 'ar-card-note' }, t('detail.volRatio') + ' ' + (typeof info.volRatio === 'number' ? info.volRatio.toFixed(2) : '—')),
                ),
              ),
              h(
                'div',
                { className: 'ar-modal-actions' },
                isIndex
                  ? null
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'ar-btn ar-watch-toggle' + (watched ? ' ar-on' : ''),
                        'aria-pressed': watched === true,
                        disabled: watched !== true && watchFull === true,
                        title: watched === true ? t('detail.unwatch') : watchFull === true ? t('detail.watchFull') : t('detail.watch'),
                        onClick: () => onToggleWatch(stock),
                      },
                      watched === true ? t('detail.unwatch') : t('detail.watch'),
                    ),
                h('button', { type: 'button', className: 'ar-close', 'aria-label': t('detail.close'), onClick: onClose }, '×'),
              ),
            ),
            h(
              'div',
              { className: 'ar-modal-body' },
              h(
                'div',
                { className: 'ar-chart-toolbar' },
                h(
                  'div',
                  { className: 'ar-periods', role: 'tablist' },
                  PERIOD_TABS.map(tab =>
                    h(
                      'button',
                      {
                        key: tab.id,
                        type: 'button',
                        role: 'tab',
                        'aria-selected': period === tab.id,
                        className: 'ar-period' + (period === tab.id ? ' ar-on' : ''),
                        onClick: () => setPeriod(tab.id),
                      },
                      t(tab.key),
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'ar-chart-tools' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ar-chip' + (showMA ? ' ar-on' : ''),
                      onClick: () => setShowMA(value => !value),
                      title: t('detail.maHint'),
                    },
                    'MA',
                  ),
                  h(Segmented, {
                    value: sub,
                    onChange: setSub,
                    options: [
                      { id: 'MACD', label: 'MACD' },
                      { id: 'KDJ', label: 'KDJ' },
                      { id: 'RSI', label: 'RSI' },
                      { id: 'NONE', label: t('detail.subNone') },
                    ],
                  }),
                  h(
                    'select',
                    {
                      className: 'ar-select',
                      value: String(adjust),
                      'aria-label': t('detail.adjust'),
                      disabled: isTrend,
                      onChange: event => setAdjust(Number(event.target.value)),
                    },
                    [
                      h('option', { key: '1', value: '1' }, t('detail.adjustFwd')),
                      h('option', { key: '0', value: '0' }, t('detail.adjustNone')),
                      h('option', { key: '2', value: '2' }, t('detail.adjustBack')),
                    ],
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'ar-btn', onClick: () => setWide(value => !value) },
                    wide ? t('detail.narrow') : t('detail.wide'),
                  ),
                ),
              ),
              error === null ? null : h('div', { className: 'ar-legend' }, h('span', { className: 'ar-flag ar-warn' }, error)),
              data !== null && data.barsStale === true
                ? h('div', { className: 'ar-legend' }, h('span', { className: 'ar-flag ar-warn' }, t('detail.staleBars')))
                : null,
              h(KChart, {
                model,
                settings: { sub: isTrend ? 'NONE' : sub, ma: showMA },
                texts: { empty: t('detail.noData') },
                label: stock.name + ' ' + stock.code + ' ' + t('detail.chart'),
                hint: t('detail.hint'),
                resetKey: stock.code + ':' + period + ':' + adjust,
                height: chartHeight,
              }),
              h(BookGrid, {
                  t,
                  info,
                  stats,
                  limits:
                    data !== null && data.limits !== null && data.limits !== undefined
                      ? data.limits
                      : isIndex
                        ? null
                        : clientLimits(stock.code, info.name, base),
                  isIndex,
                  volumeState: data !== null && data.volumeState !== undefined ? data.volumeState : null,
                }),
              isIndex ? null : h(BoardTags, { t, boards: boardList, industry: info.industry, onOpen: onOpenBoard }),
              h(
                'div',
                { className: 'ar-detail-panels' },
                isIndex ? null : h(FlowPanel, { t, flow }),
                h(TechPanel, { t, stats, live }),
              ),
              isIndex ? null : h(NewsPanel, { t, data: news }),
              isIndex ? null : h(AIPanel, { t, stock: { code: stock.code, name: info.name || stock.name } }),
              isIndex
                ? h('div', { className: 'ar-empty' }, t('detail.noTrade'))
                : h(TradePanel, { t, code: stock.code, name: info.name || stock.name, price: live, account, onTrade }),
            ),
          ),
        ),
      )
    }

    function PositionsCard(props) {
      const { t, account, quotes, onOpen } = props
      const codes = Object.keys(account.positions)
      const priceOf = code => {
        const row = (quotes || []).find(item => item.code === code)
        return row !== undefined && typeof row.price === 'number' ? row.price : null
      }
      let marketValue = 0
      let floating = 0
      for (const code of codes) {
        const position = account.positions[code]
        const live = priceOf(code)
        marketValue += (live === null ? position.cost : live) * position.qty
        if (live !== null) floating += (live - position.cost) * position.qty
      }
      const equity = account.cash + marketValue
      return h(
        Card,
        { title: t('positions.title') },
        h(
          'div',
          { className: 'ar-trade-meta', style: { marginBottom: 6 } },
          h('span', null, t('positions.equity'), ' ', h('b', null, '¥' + equity.toFixed(0))),
          h('span', null, t('positions.value'), ' ', h('b', null, '¥' + marketValue.toFixed(0))),
          h('span', { className: toneOf(floating) }, t('positions.pnl'), ' ', h('b', null, (floating > 0 ? '+' : '') + floating.toFixed(0))),
        ),
        codes.length === 0
          ? h('div', { className: 'ar-empty' }, t('positions.empty'))
          : codes.map(code => {
              const position = account.positions[code]
              const live = priceOf(code)
              const pnl = live === null ? null : (live - position.cost) * position.qty
              return h(
                'div',
                {
                  key: code,
                  className: 'ar-watch-row',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => onOpen({ code, name: position.name }),
                  onKeyDown: event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpen({ code, name: position.name })
                    }
                  },
                },
                h('div', { className: 'ar-watch-name' }, h('b', null, position.name), h('span', null, code)),
                h(
                  'div',
                  { className: 'ar-watch-price' },
                  h('b', { className: toneOf(pnl) }, live === null ? '—' : price(live)),
                  h('i', { className: toneOf(pnl) }, (pnl === null ? '—' : (pnl > 0 ? '+' : '') + pnl.toFixed(0))),
                ),
                h('div', { className: 'ar-watch-meta' }, h('span', null, position.qty + ' 股 · ' + t('trade.cost') + ' ' + price(position.cost))),
              )
            }),
      )
    }

    const BOARD_SORTS = [
      { id: 'f3', key: 'board.sortPct' },
      { id: 'f62', key: 'board.sortFlow' },
      { id: 'f10', key: 'board.sortVol' },
      { id: 'f8', key: 'board.sortTurnover' },
      { id: 'f22', key: 'board.sortSpeed' },
      { id: 'f20', key: 'board.sortCap' },
    ]

    function BoardModal(props) {
      const { t, board, account, onOpenStock, onClose, trading } = props
      const [sort, setSort] = useState('f3')
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)

      useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        const load = async () => {
          try {
            const response = await fetch(endpoint(API + '/board?code=' + board.code + '&sort=' + sort + '&limit=50'), {
              cache: 'no-store',
              signal: controller.signal,
            })
            const body = await response.json()
            if (cancelled) return
            if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status)
            setData(body)
            setError(null)
          } catch (cause) {
            if (!cancelled && cause && cause.name !== 'AbortError') setError(cause.message || String(cause))
          }
        }
        load()
        const timer = window.setInterval(() => {
          if (!document.hidden) load()
        }, 15000)
        return () => {
          cancelled = true
          controller.abort()
          window.clearInterval(timer)
        }
      }, [board.code, sort])

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])

      const stocks = data !== null && Array.isArray(data.stocks) ? data.stocks : []
      const sparks = useSparks(stocks.slice(0, 50).map(stock => stock.code).join(','), trading, true)
      const sparkOf = stock => (sparks === null || sparks === undefined ? null : sparks[stock.code])
      return portal(
        h(
          'div',
          { className: 'ar-modal-backdrop', onMouseDown: onClose },
          h(
            'div',
            {
              className: 'ar-modal ar-board-modal',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': (board.label || board.name) + ' ' + t('board.constituents'),
              onMouseDown: event => event.stopPropagation(),
            },
            h(
              'div',
              { className: 'ar-modal-head' },
              h(
                'div',
                { style: { minWidth: 0 } },
                h('div', { className: 'ar-modal-title' }, h('h2', null, board.label || board.name), h('span', null, board.code)),
                h(
                  'div',
                  { className: 'ar-modal-price' },
                  h('b', { className: toneOf(board.pct) }, pctText(board.pct)),
                  h('span', { className: 'ar-card-note' }, t('sector.flow') + ' ' + yi(board.mainNet)),
                  h(
                    'span',
                    { className: 'ar-card-note' },
                    t('sector.width') + ' ' + (board.up === null || board.up === undefined ? '—' : board.up) + '/' + (board.down === null || board.down === undefined ? '—' : board.down),
                  ),
                  board.leader === null || board.leader === undefined
                    ? null
                    : h('span', { className: 'ar-card-note' }, t('sector.leader') + ' ' + board.leader + ' ' + pctText(board.leaderPct)),
                ),
              ),
              h('button', { type: 'button', className: 'ar-close', 'aria-label': t('detail.close'), onClick: onClose }, '×'),
            ),
            h(
              'div',
              { className: 'ar-modal-body' },
              h(
                'div',
                { className: 'ar-chart-toolbar' },
                h(
                  'div',
                  { className: 'ar-periods', role: 'tablist' },
                  BOARD_SORTS.map(option =>
                    h(
                      'button',
                      {
                        key: option.id,
                        type: 'button',
                        role: 'tab',
                        'aria-selected': sort === option.id,
                        className: 'ar-period' + (sort === option.id ? ' ar-on' : ''),
                        onClick: () => setSort(option.id),
                      },
                      t(option.key),
                    ),
                  ),
                ),
                h(
                  'span',
                  { className: 'ar-card-note' },
                  t('board.total') +
                    ' ' +
                    (data === null ? '—' : data.total) +
                    ' ' +
                    t('board.unit') +
                    (data !== null && data.total > stocks.length ? ' · ' + t('board.showing') + ' ' + stocks.length : '') +
                    ' · ' +
                    t('board.hint'),
                ),
              ),
              error === null ? null : h('div', { className: 'ar-legend' }, h('span', { className: 'ar-flag ar-warn' }, error)),
              stocks.length === 0
                ? h(
                    'div',
                    { className: 'ar-empty' },
                    data === null && error === null
                      ? t('loading')
                      : data !== null && data.note === 'no-constituents'
                        ? t('board.noConstituents')
                        : t('board.empty'),
                  )
                : h(
                    'div',
                    { className: 'ar-board' },
                    h(
                      'div',
                      { className: 'ar-board-row ar-board-head' },
                      h('span', null, t('board.constituents')),
                      h('span', null, ''),
                      h('span', null, t('board.price')),
                      h('span', null, t('board.sortPct')),
                      h('span', null, t('board.sortVol')),
                      h('span', null, t('board.sortFlow')),
                    ),
                    stocks.map(stock =>
                      h(
                        'div',
                        {
                          key: stock.code,
                          className: 'ar-board-row',
                          role: 'button',
                          tabIndex: 0,
                          onClick: () => onOpenStock(stock),
                          onKeyDown: event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onOpenStock(stock)
                            }
                          },
                        },
                        h(
                          'span',
                          { className: 'ar-board-name' },
                          h('b', null, stock.name),
                          h('i', null, stock.code),
                          account.positions[stock.code] === undefined
                            ? null
                            : h('em', { className: 'ar-held' }, account.positions[stock.code].qty),
                          h(SparkFlag, { t, spark: sparkOf(stock), code: stock.code }),
                        ),
                        h(MiniTrend, { spark: sparkOf(stock), code: stock.code, width: 74, height: 22 }),
                        h('span', { className: toneOf(stock.pct) }, price(stock.price)),
                        h('span', { className: toneOf(stock.pct) }, pctText(stock.pct)),
                        h('span', null, stock.volRatio === null ? '—' : stock.volRatio),
                        h('span', { className: toneOf(stock.mainNet) }, yi(stock.mainNet)),
                      ),
                    ),
                  ),
            ),
          ),
        ),
      )
    }

    function Page() {
      const locale = useLocale()
      const t = locale.t
      const [snap, setSnap] = useState(null)
      const [error, setError] = useState(null)
      const [speed, setSpeed] = useState(loadSpeed)
      const [watch, setWatch] = useState(loadWatch)
      const [kind, setKind] = useState('industry')
      const [filter, setFilter] = useState(null)
      const [feed, setFeed] = useState([])
      const [query, setQuery] = useState('')
      const [results, setResults] = useState([])
      const [searching, setSearching] = useState(false)
      const [tick, setTick] = useState(0)
      const [account, setAccount] = useState(loadAccount)
      const [detailStock, setDetailStock] = useState(null)
      const [board, setBoard] = useState(null)
      const [trading, setTrading] = useState(true)
      const primed = useRef(false)
      const seenFlags = useRef(new Set())

      const codes = watch.join(',')
      const positionsKey = Object.keys(account.positions || {}).join(',')

      useEffect(() => {
        persist(WATCH_KEY, watch)
      }, [watch])

      useEffect(() => {
        persist(SPEED_KEY, String(speed))
      }, [speed])

      useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        const pull = async mode => {
          try {
            const held = Object.keys(account.positions || {}).join(',')
            const target =
              API +
              '/snapshot?mode=' + mode +
              '&limit=8&codes=' + encodeURIComponent(codes) +
              (held === '' ? '' : '&holdings=' + encodeURIComponent(held))
            const response = await fetch(endpoint(target), {
              signal: controller.signal,
              cache: 'no-store',
            })
            const body = await response.json()
            if (cancelled) return
            if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status)
            setSnap(previous => {
              if (previous === null) return body
              if (body.mode === 'light') {
                return Object.assign({}, previous, body, {
                  sectors: previous.sectors,
                  picks: previous.picks,
                  strategies: previous.strategies,
                })
              }
              return Object.assign({}, previous, body)
            })
            if (body.market !== null && body.market !== undefined) setTrading(body.market.trading === true)
            setError(null)
          } catch (cause) {
            if (cancelled || (cause && cause.name === 'AbortError')) return
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        }

        pull('full')
        let lightTimer = null
        let fullTimer = null
        if (speed > 0) {
          // Outside the session the tape only changes when the next print lands,
          // so a five-second poll would just burn requests.
          const cadence = trading ? speed : Math.max(30_000, speed)
          lightTimer = window.setInterval(() => {
            if (!document.hidden) pull('light')
          }, cadence)
          fullTimer = window.setInterval(() => {
            if (!document.hidden) pull('full')
          }, Math.max(30_000, cadence * 4))
        }
        const onVisible = () => {
          if (!document.hidden) pull('light')
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          cancelled = true
          controller.abort()
          if (lightTimer !== null) window.clearInterval(lightTimer)
          if (fullTimer !== null) window.clearInterval(fullTimer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [codes, speed, tick, trading, positionsKey])

      // Alert feed: a flag that was not set on the previous snapshot is news.
      useEffect(() => {
        if (snap === null || !Array.isArray(snap.watchlist)) return
        const additions = []
        const now = Date.now()
        for (const stock of snap.watchlist) {
          const live = new Set()
          for (const flag of stock.flags || []) {
            const key = stock.code + ':' + flag.k
            live.add(key)
            if (!seenFlags.current.has(key)) {
              seenFlags.current.add(key)
              if (primed.current) {
                additions.push({
                  id: key + ':' + now,
                  at: now,
                  code: stock.code,
                  name: stock.name,
                  text: flag.text,
                  level: flag.level,
                  pct: stock.pct,
                })
              }
            }
          }
          for (const key of [...seenFlags.current]) {
            if (key.indexOf(stock.code + ':') === 0 && !live.has(key)) seenFlags.current.delete(key)
          }
        }
        primed.current = true
        if (additions.length > 0) setFeed(previous => additions.reverse().concat(previous).slice(0, 60))
      }, [snap])

      // Debounced symbol search.
      useEffect(() => {
        const keyword = query.trim()
        if (keyword === '' || /^\d{6}$/.test(keyword)) {
          setResults([])
          setSearching(false)
          return undefined
        }
        let cancelled = false
        setSearching(true)
        const timer = window.setTimeout(async () => {
          try {
            const target = API + '/search?q=' + encodeURIComponent(keyword)
            const response = await fetch(endpoint(target), { cache: 'no-store' })
            const body = await response.json()
            if (cancelled) return
            setResults(Array.isArray(body.items) ? body.items : [])
          } catch {
            if (!cancelled) setResults([])
          } finally {
            if (!cancelled) setSearching(false)
          }
        }, 260)
        return () => {
          cancelled = true
          window.clearTimeout(timer)
        }
      }, [query])

      const addStock = useCallback(
        value => {
          const text = String(value || '').trim()
          const match = text.match(/(\d{6})/)
          if (match === null) return
          setWatch(previous => (previous.indexOf(match[1]) === -1 ? previous.concat(match[1]).slice(0, 30) : previous))
          setQuery('')
          setResults([])
        },
        [],
      )

      const removeStock = useCallback(code => {
        setWatch(previous => previous.filter(item => item !== code))
      }, [])

      const refresh = useCallback(() => setTick(value => value + 1), [])

      const openDetail = useCallback(stock => {
        setBoard(null)
        setDetailStock(stock)
      }, [])
      const closeDetail = useCallback(() => setDetailStock(null), [])
      const toggleWatch = useCallback(stock => {
        setWatch(previous => {
          if (previous.indexOf(stock.code) !== -1) return previous.filter(code => code !== stock.code)
          if (previous.length >= 30) return previous
          return previous.concat(stock.code)
        })
      }, [])
      const openBoard = useCallback(next => {
        setDetailStock(null)
        setBoard(next)
      }, [])
      const closeBoard = useCallback(() => setBoard(null), [])

      const openStockFromBoard = useCallback(stock => {
        setBoard(null)
        setDetailStock(stock)
      }, [])

      const openBoardOf = useCallback(
        target => {
          const lists = []
          if (snap !== null && snap !== undefined && snap.sectors !== undefined) {
            if (Array.isArray(snap.sectors.industry)) lists.push(...snap.sectors.industry)
            if (Array.isArray(snap.sectors.concept)) lists.push(...snap.sectors.concept)
          }
          const known =
            lists.find(board => target.code !== undefined && board.code === target.code) ||
            lists.find(board => board.name === target.name || board.label === target.name)
          setDetailStock(null)
          setBoard(known || { code: target.code, name: target.name, label: target.name })
        },
        [snap],
      )

      const placeTrade = useCallback(
        (side, qty, priceValue, stock) => {
          if (!Number.isFinite(qty) || qty <= 0) return { ok: false, message: t('trade.badQty') }
          if (qty % 100 !== 0) return { ok: false, message: t('trade.lot') }
          if (!Number.isFinite(priceValue) || priceValue <= 0) return { ok: false, message: t('trade.badQty') }
          const next = {
            cash: account.cash,
            positions: Object.assign({}, account.positions),
            trades: account.trades.slice(),
            realized: account.realized,
          }
          const current = next.positions[stock.code]
          if (side === 'buy') {
            const cost = qty * priceValue
            if (cost > next.cash) return { ok: false, message: t('trade.needCash') }
            next.cash = Math.round((next.cash - cost) * 100) / 100
            if (current === undefined) {
              next.positions[stock.code] = { code: stock.code, name: stock.name, qty, cost: priceValue }
            } else {
              const total = current.qty + qty
              next.positions[stock.code] = Object.assign({}, current, {
                name: stock.name,
                qty: total,
                cost: (current.qty * current.cost + cost) / total,
              })
            }
          } else {
            if (current === undefined || current.qty < qty) return { ok: false, message: t('trade.needStock') }
            const proceeds = qty * priceValue
            next.cash = Math.round((next.cash + proceeds) * 100) / 100
            next.realized = Math.round((next.realized + qty * (priceValue - current.cost)) * 100) / 100
            if (current.qty === qty) delete next.positions[stock.code]
            else next.positions[stock.code] = Object.assign({}, current, { qty: current.qty - qty })
          }
          const now = Date.now()
          next.trades = [{ id: now, at: now, code: stock.code, name: stock.name, side, qty, price: priceValue }]
            .concat(next.trades)
            .slice(0, 60)
          setAccount(next)
          persist(ACCOUNT_KEY, next)
          return {
            ok: true,
            message: (side === 'buy' ? t('trade.buy') : t('trade.sell')) + ' ' + qty + ' @ ' + price2(priceValue),
          }
        },
        [account, t],
      )

      const liveStock =
        detailStock === null
          ? null
          : detailStock.kind === 'index'
            ? Object.assign(
                {},
                detailStock,
                snap !== null && Array.isArray(snap.indices)
                  ? snap.indices.find(item => item.secid === detailStock.secid) || {}
                  : {},
              )
            : (snap !== null && Array.isArray(snap.watchlist) ? snap.watchlist.find(item => item.code === detailStock.code) : undefined) ||
              (snap !== null && Array.isArray(snap.picks) ? snap.picks.find(item => item.code === detailStock.code) : undefined) ||
              detailStock

      const indices = snap === null ? [] : snap.indices
      const market = snap === null ? null : snap.market
      const statusLabel = market === null ? '' : t('phase.' + market.phase)
      const turnover =
        snap === null || !Array.isArray(snap.indices)
          ? null
          : snap.indices
              .filter(index => index.code === '000001' || index.code === '399001')
              .reduce((total, index) => total + (typeof index.amount === 'number' ? index.amount : 0), 0)

      return h(
        'div',
        { className: 'ar-page' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'ar-head' },
          h(
            'div',
            { className: 'ar-head-row' },
            h(
              'div',
              { className: 'ar-brand' },
              h(RadarGlyph, { size: 26, active: true }),
              h(
                'div',
                null,
                h('h1', null, t('page.title')),
                h('p', null, t('page.subtitle')),
              ),
            ),
            h(
              'div',
              { className: 'ar-controls' },
              h(
                'span',
                { className: 'ar-pill ' + (market !== null && market.trading ? 'ar-live' : '') },
                h('i', { className: 'ar-dot' }),
                statusLabel,
              ),
              turnover === null ? null : h('span', { className: 'ar-pill' }, t('page.turnover') + ' ' + bigMoney(turnover)),
              market === null ? null : h('span', { className: 'ar-pill' }, t('page.updated') + ' ' + market.time),
              snap === null ? null : h('span', { className: 'ar-pill' }, t('detail.dataAt') + ' ' + clockText(snap.asOf)),
              h(
                'select',
                {
                  className: 'ar-select',
                  value: String(speed),
                  'aria-label': t('page.speed'),
                  onChange: event => setSpeed(Number(event.target.value)),
                },
                [3000, 5000, 10000, 30000, 0].map(value =>
                  h('option', { key: value, value: String(value) }, t('speed.' + (value === 0 ? '0' : String(value / 1000)))),
                ),
              ),
              h('button', { type: 'button', className: 'ar-btn', onClick: refresh }, t('page.refresh')),
            ),
          ),
          indices.length > 0 ? h(IndexTape, { indices, onOpen: openDetail, hint: t('tape.hint') }) : null,
        ),
        error !== null
          ? h(
              'div',
              { className: 'ar-banner' },
              h('span', null, t('error.title') + '：' + error),
              h('button', { type: 'button', className: 'ar-btn', onClick: refresh }, t('error.retry')),
            )
          : null,
        snap === null
          ? h(
              'div',
              { className: 'ar-body' },
              h('div', { className: 'ar-col' }, h('div', { className: 'ar-skeleton' }), h('div', { className: 'ar-skeleton' }), h('div', { className: 'ar-skeleton' })),
              h('div', { className: 'ar-side' }, h('div', { className: 'ar-skeleton' })),
            )
          : h(
              'div',
              { className: 'ar-body' },
              h(
                'div',
                { className: 'ar-col' },
                h(SentimentCard, { t, sentiment: snap.sentiment }),
                h(SectorCard, { t, sectors: snap.sectors, kind, onKind: setKind, onOpen: openBoard }),
                h(SectorTrendCard, { t, trading }),
                h(PickCard, {
                  t,
                  picks: snap.picks,
                  strategies: snap.strategies,
                  filter,
                  onFilter: setFilter,
                  onOpen: openDetail,
                  account,
                  trading,
                }),
              ),
              h(
                'div',
                { className: 'ar-side' },
                h(WatchCard, {
                  t,
                  watchlist: snap.watchlist,
                  onRemove: removeStock,
                  onOpen: openDetail,
                  account,
                  trading,
                  results,
                  query,
                  onQuery: setQuery,
                  onAdd: addStock,
                  searching,
                }),
                h(PositionsCard, { t, account, quotes: snap.holdings, onOpen: openDetail }),
                h(AlertCard, { t, feed }),
              ),
            ),
        h(
          'footer',
          { className: 'ar-foot' },
          h('span', null, t('footer.source') + '：' + (snap === null ? '—' : snap.source)),
          h('span', null, t('footer.disclaimer')),
        ),
        liveStock === null
          ? null
          : h(DetailModal, {
              t,
              stock: liveStock,
              account,
              onTrade: placeTrade,
              onClose: closeDetail,
              trading,
              watched: liveStock.kind !== 'index' && watch.indexOf(liveStock.code) !== -1,
              onToggleWatch: toggleWatch,
              watchFull: watch.length >= 30,
              onOpenBoard: openBoardOf,
            }),
        board === null
          ? null
          : h(BoardModal, { t, board, account, onOpenStock: openStockFromBoard, onClose: closeBoard, trading }),
      )
    }

    /* ---------------------------------------------------------------- *
     * Locale binding: prefer the host locale service, fall back to zh
     * ---------------------------------------------------------------- */

    const listeners = new Set()
    let localeService = null

    function detectLocale() {
      if (localeService !== null && typeof localeService.getLocale === 'function') {
        try {
          const snapshot = localeService.getLocale()
          const id = snapshot && (snapshot.id || snapshot.locale || snapshot.language)
          if (typeof id === 'string') return id.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
        } catch {
          /* fall through */
        }
      }
      return 'zh'
    }

    function useLocale() {
      const [locale, setLocale] = useState(detectLocale)
      useEffect(() => {
        if (localeService === null || typeof localeService.subscribe !== 'function') return undefined
        let unsubscribe = null
        try {
          unsubscribe = localeService.subscribe(() => setLocale(detectLocale()))
        } catch {
          unsubscribe = null
        }
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [])
      const dict = DICT[locale] || DICT.zh
      const t = useCallback(
        key => {
          const value = dict[key]
          return value === undefined ? key : value
        },
        [locale],
      )
      return { locale, t }
    }

    /* ---------------------------------------------------------------- *
     * Plugin
     * ---------------------------------------------------------------- */

    return {
      name: NS,
      inject: ['slots'],
      apply(ctx) {
        localeService = typeof ctx.get === 'function' ? ctx.get('locale') || null : null
        if (localeService !== null && typeof localeService.register === 'function') {
          try {
            const disposer = localeService.register(NS, DICT)
            if (typeof disposer === 'function') ctx.effect(() => disposer)
          } catch {
            /* the panel still renders through its own dictionary */
          }
        }

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(Page)),
        )
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 25, label: () => (DICT[detectLocale()] || DICT.zh)['nav.title'] },
            props => h(RadarGlyph, { size: props.size, active: props.active }),
          ),
        )
      },
    }
  },
})
