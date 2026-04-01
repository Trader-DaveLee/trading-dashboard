import { recalcTrade } from './calc.js';

export const STORAGE_KEY = 'trading_desk_dashboard_v3';
export const LEGACY_STORAGE_KEYS = [
  'trading_desk_dashboard_v3',
  'btc_trading_research_dashboard_v2'
];
export const DRAFT_KEY = 'trading_desk_dashboard_v3_draft';

export const DEFAULT_DB = {
  schemaVersion: 4,
  meta: {
    tickers: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    entrySetups: ['BREAKOUT', 'RECLAIM', 'RANGE SWEEP', 'TREND CONTINUATION'],
    exitSetups: ['TRAIL STOP', 'FIXED TARGET', 'TIME STOP'],
    tagPresets: ['trend', 'sweep', 'reclaim', 'breakout', 'ny-open'],
    mistakePresets: ['fomo', 'oversize', 'early exit', 'late stop', 'countertrend'],
    accountBalance: 10000,
    balanceHistory: [],
    rules: '',
    checklists: ['손절 설정 확인', 'A급 셋업 여부', '리스크 1% 이하'],
    lastTradeForm: null,
    quickLinks: [
      { name: 'TradingView', url: 'https://tradingview.com', icon: '📈' },
      { name: 'CoinMarketCap', url: 'https://coinmarketcap.com', icon: '🪙' },
      { name: 'Economic Calendar', url: 'https://kr.investing.com/economic-calendar/', icon: '📅' }
    ]
  },
  trades: [],
};

export function loadDB() {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const migrated = migrateDB(parsed);
      if (migrated.schemaVersion >= 3) return migrated;
    }
    return structuredClone(DEFAULT_DB);
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

export function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function exportDB(db) {
  const payload = { exportedAt: new Date().toISOString(), ...db };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const localDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  
  link.download = `trading_dashboard_v6_${localDateStr}.json`;
  link.click();
}

export function parseImport(text) {
  const parsed = JSON.parse(text);
  const migrated = migrateDB(parsed);
  if (!migrated || !Array.isArray(migrated.trades)) {
    throw new Error('Invalid import payload');
  }
  const looksEmpty = migrated.trades.length === 0 && (!parsed || (typeof parsed === 'object' && !Array.isArray(parsed) && !Array.isArray(parsed.trades)));
  if (looksEmpty) throw new Error('Unsupported import schema');
  return migrated;
}


export function migrateDB(input) {
  if (!input) return structuredClone(DEFAULT_DB);

  if ((input.schemaVersion === 4 || input.schemaVersion === 3 || input.schemaVersion === 2) && Array.isArray(input.trades)) {
    return {
      schemaVersion: 4,
      meta: normalizeMeta(input.meta),
      trades: input.trades.filter(Boolean).map(fromV2Trade).map(normalizeTrade),
    };
  }

  if (Array.isArray(input)) {
    return {
      schemaVersion: 4,
      meta: structuredClone(DEFAULT_DB.meta),
      trades: input.filter(Boolean).map(fromV5Trade).map(normalizeTrade),
    };
  }

  if (input && Array.isArray(input.trades)) {
    return {
      schemaVersion: 4,
      meta: normalizeMeta(input.meta),
      trades: input.trades.filter(Boolean).map(fromV2Trade).map(normalizeTrade),
    };
  }

  if (input && typeof input === 'object') {
    const possibleTrades = Array.isArray(input.rows) ? input.rows : Array.isArray(input.items) ? input.items : null;
    if (possibleTrades) {
      return {
        schemaVersion: 4,
        meta: normalizeMeta(input.meta),
        trades: possibleTrades.filter(Boolean).map(fromV2Trade).map(normalizeTrade),
      };
    }
  }

  return structuredClone(DEFAULT_DB);
}


function normalizeMeta(meta = {}) {
  const base = structuredClone(DEFAULT_DB.meta);
  return {
    ...base,
    ...meta,
    tickers: normalizeUpperList(meta.tickers || base.tickers),
    entrySetups: normalizeUpperList(meta.entrySetups || base.entrySetups),
    exitSetups: normalizeUpperList(meta.exitSetups || base.exitSetups),
    tagPresets: normalizeLowerList(meta.tagPresets || base.tagPresets),
    mistakePresets: normalizeLowerList(meta.mistakePresets || base.mistakePresets),
    balanceHistory: Array.isArray(meta.balanceHistory) ? meta.balanceHistory.map(normalizeBalancePoint) : [],
    accountBalance: Number(meta.accountBalance || base.accountBalance),
    rules: String(meta.rules || ''),
    checklists: normalizeList(meta.checklists || base.checklists),
    lastTradeForm: meta.lastTradeForm || null,
    quickLinks: normalizeQuickLinks(meta.quickLinks, base.quickLinks)
  };
}

function normalizeQuickLinks(links, fallback) {
  const source = Array.isArray(links) && links.length ? links : fallback;
  return source.map(row => ({
    name: String(row?.name || '').trim() || '링크',
    url: sanitizeUrl(row?.url || ''),
    icon: String(row?.icon || '🔗').trim() || '🔗',
  })).filter(row => row.url);
}

function normalizeBalancePoint(row) {

  return {
    id: row.id || Date.now(),
    date: normalizeDate(row.date),
    val: Number(row.val || 0),
    delta: Number(row.delta || 0),
    cash: Number(row.cash || 0),
    crypto: Number(row.crypto || 0),
    usdt: Number(row.usdt || 0),
    stock: Number(row.stock || 0),
    type: String(row.type || 'PNL').toUpperCase(),
    memo: String(row.memo || '').trim(),
  };
}

function fromV2Trade(t) {
  const artifacts = Array.isArray(t.artifacts) ? t.artifacts : [];
  return {
    ...t,
    grade: t.grade || 'B',
    markPrice: Number(t.markPrice || 0),
    targetPrice: Number(t.targetPrice || 0),
    liveNotes: t.liveNotes || '',
    evidence: t.evidence || {
      entryCharts: [artifacts[0]].filter(Boolean),
      exitCharts: [artifacts[1]].filter(Boolean),
      liveCharts: artifacts.slice(2).filter(Boolean),
    },
  };
}

function fromV5Trade(t) {
  return {
    id: t.id || crypto.randomUUID(),
    date: t.date ? `${t.date}T00:00` : new Date().toISOString(),
    ticker: t.ticker || 'BTCUSDT',
    status: t.status || 'CLOSED',
    side: t.dir === -1 ? 'SHORT' : 'LONG',
    setupEntry: t.setupE || '',
    setupExit: t.setupX || '',
    grade: t.grade || 'B',
    accountSize: Number(t.acc || 10000),
    riskPct: Number(t.risk || 0.5),
    leverage: Number(t.lev || 5),
    currentPrice: 0,
    plannerMode: 'BALANCED',
    plannerLegs: 3,
    plannerWeightMode: 'BACKLOADED',
    makerFee: Number(t.fM || 0.02),
    takerFee: Number(t.fT || 0.05),
    stopPrice: Number(t.sl || 0),
    targetPrice: Number(t.targetPrice || 0), // ✨ 추가
    stopType: t.slT || 'M',
    markPrice: 0,
    context: '',
    thesis: '',
    review: t.memo || '',
    liveNotes: '',
    tags: [],
    mistakes: [],
    checkedRules: [],
    evidence: { entryCharts: [t.img1].filter(Boolean), exitCharts: [t.img2].filter(Boolean), liveCharts: [] },
    entries: (t.entries || []).map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    exits: (t.exits || []).map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
  };
}

export function normalizeTrade(t = {}) {
  const trade = {
    id: t.id || crypto.randomUUID(),
    date: normalizeDate(t.date),
    ticker: String(t.ticker || 'BTCUSDT').trim().toUpperCase(),
    status: String(t.status || 'OPEN').toUpperCase(),
    side: String(t.side || 'LONG').toUpperCase(),
    setupEntry: String(t.setupEntry || '').trim().toUpperCase(),
    setupExit: String(t.setupExit || '').trim().toUpperCase(),
    grade: String(t.grade || 'B').trim().toUpperCase(),

    accountSize: Math.max(0, Number(t.accountSize || 10000)),
    riskPct: Math.max(0, Number(t.riskPct || 0.5)),
    leverage: Math.max(1, Number(t.leverage || 5)),
    currentPrice: Number(t.currentPrice || t.markPrice || 0),
    plannerMode: normalizePlannerMode(t.plannerMode),
    plannerLegs: Math.max(1, Number(t.plannerLegs || 3)),
    plannerWeightMode: normalizePlannerWeightMode(t.plannerWeightMode),
    makerFee: Math.max(0, Number(t.makerFee || 0.02)),
    takerFee: Math.max(0, Number(t.takerFee || 0.05)),
    stopPrice: Number(t.stopPrice || 0),
    targetPrice: Number(t.targetPrice || 0), // ✨ 추가
    stopType: String(t.stopType || 'M').toUpperCase(),
    markPrice: Number(t.markPrice || 0),

    context: String(t.context || '').trim(),
    thesis: String(t.thesis || '').trim(),
    review: String(t.review || '').trim(),
    liveNotes: String(t.liveNotes || '').trim(),

    tags: normalizeLowerList(t.tags),
    mistakes: normalizeLowerList(t.mistakes),
    checkedRules: normalizeList(t.checkedRules),

    evidence: normalizeEvidence(t.evidence, t.artifacts, t.entryChart, t.exitChart),
    entries: normalizeLegs(t.entries, { kind: 'entry', withDefault: true, defaultLeverage: Math.max(1, Number(t.leverage || 5)) }),
    exits: normalizeLegs(t.exits, { kind: 'exit', withDefault: false, tradeStatus: String(t.status || 'OPEN').toUpperCase() }),
  };

  trade.metrics = recalcTrade(trade);
  return trade;
}

function normalizePlannerMode(value) {
  const raw = String(value || 'BALANCED').trim().toUpperCase();
  if (raw === 'LADDER' || raw === 'LADDER_TIGHT') return 'BALANCED';
  if (raw === 'LADDER_DEEP') return 'AVERAGING';
  if (['SINGLE','BALANCED','AVERAGING','PYRAMID'].includes(raw)) return raw;
  return 'BALANCED';
}

function normalizePlannerWeightMode(value) {
  const raw = String(value || 'BACKLOADED').trim().toUpperCase();
  return ['EQUAL','FRONTLOADED','BACKLOADED'].includes(raw) ? raw : 'BACKLOADED';
}

export function sanitizeUrl(url) {
  if (!url) return '';
  let trimmed = String(url).trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function normalizeEvidence(evidence, artifacts, legacyEntry, legacyExit) {
  const fallback = Array.isArray(artifacts) ? artifacts : [];
  const obj = evidence && typeof evidence === 'object' ? evidence : {};
  
  let entryArray = Array.isArray(obj.entryCharts) ? obj.entryCharts : [];
  if (entryArray.length === 0 && (obj.entryChart || fallback[0] || legacyEntry)) {
      entryArray = [obj.entryChart || fallback[0] || legacyEntry];
  }
  
  let exitArray = Array.isArray(obj.exitCharts) ? obj.exitCharts : [];
  if (exitArray.length === 0 && (obj.exitChart || fallback[1] || legacyExit)) {
      exitArray = [obj.exitChart || fallback[1] || legacyExit];
  }

  return {
    entryCharts: entryArray.map(v => sanitizeUrl(v)).filter(Boolean),
    exitCharts: exitArray.map(v => sanitizeUrl(v)).filter(Boolean),
    liveCharts: Array.isArray(obj.liveCharts) ? obj.liveCharts.map(v => sanitizeUrl(v)).filter(Boolean) : [],
  };
}

function normalizeLegs(value, options = {}) {
  const { kind = 'entry', withDefault = false, defaultLeverage = 1, tradeStatus = 'OPEN' } = options;
  const rows = Array.isArray(value) ? value : [];
  const mapped = rows.map(row => ({
    price: Number(row.price || 0),
    type: String(row.type || 'M').toUpperCase() === 'T' ? 'T' : 'M',
    weight: Math.max(0, Number(row.weight || 0)),
    leverage: kind === 'entry' ? Math.max(1, Number(row.leverage || defaultLeverage || 1)) : undefined,
    status: kind === 'exit' ? String(row.status || (tradeStatus === 'CLOSED' ? 'FILLED' : 'PLANNED')).toUpperCase() : undefined,
  }));
  if (!mapped.length && withDefault) return [{ price: 0, type: 'M', weight: 100, leverage: Math.max(1, Number(defaultLeverage || 1)) }];
  return mapped;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function normalizeUpperList(value) {
  return normalizeList(value).map(v => v.toUpperCase());
}

function normalizeLowerList(value) {
  return normalizeList(value).map(v => v.toLowerCase());
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), ...draft }));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
