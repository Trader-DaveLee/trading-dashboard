import { recalcTrade } from './calc.js';

export const STORAGE_KEY = 'trading_desk_dashboard_v3';
export const LEGACY_STORAGE_KEYS = [
  'trading_desk_dashboard_v3',
  'btc_trading_research_dashboard_v2'
];
export const DRAFT_KEY = 'trading_desk_dashboard_v3_draft';
export const PREFS_KEY = 'trading_desk_dashboard_v3_prefs';

export const DEFAULT_DB = {
  schemaVersion: 3,
  meta: {
    tickers: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    entrySetups: ['BREAKOUT', 'RECLAIM', 'RANGE SWEEP', 'TREND CONTINUATION'],
    exitSetups: ['TRAIL STOP', 'FIXED TARGET', 'TIME STOP'],
    emotions: ['CALM', 'FOCUSED', 'FOMO', 'TIRED', 'REVENGE'],
    tagPresets: ['trend', 'sweep', 'reclaim', 'breakout', 'ny-open'],
    mistakePresets: ['fomo', 'oversize', 'early exit', 'late stop', 'countertrend'],
    accountBalance: 10000,
    balanceHistory: [],
    rules: '',
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
      if (migrated.schemaVersion === 3) return migrated;
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
  link.download = `trading_dashboard_v3_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
}

export function parseImport(text) {
  const parsed = JSON.parse(text);
  return migrateDB(parsed);
}

export function migrateDB(input) {
  if (!input) return structuredClone(DEFAULT_DB);

  if (Array.isArray(input)) {
    return {
      schemaVersion: 3,
      meta: structuredClone(DEFAULT_DB.meta),
      trades: input.map(fromV5Trade).map(normalizeTrade),
    };
  }

  if (input.schemaVersion === 3 && Array.isArray(input.trades)) {
    return {
      schemaVersion: 3,
      meta: normalizeMeta(input.meta),
      trades: input.trades.map(normalizeTrade),
    };
  }

  if (Array.isArray(input.trades)) {
    return {
      schemaVersion: 3,
      meta: normalizeMeta(input.meta),
      trades: input.trades.map(fromV2Trade).map(normalizeTrade),
    };
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
    emotions: normalizeUpperList(meta.emotions || base.emotions),
    tagPresets: normalizeLowerList(meta.tagPresets || base.tagPresets),
    mistakePresets: normalizeLowerList(meta.mistakePresets || base.mistakePresets),
    balanceHistory: Array.isArray(meta.balanceHistory) ? meta.balanceHistory.map(normalizeBalancePoint) : [],
    accountBalance: Number(meta.accountBalance || base.accountBalance),
    rules: String(meta.rules || ''),
  };
}

function normalizeBalancePoint(row) {
  return {
    id: row.id || Date.now(),
    date: normalizeDate(row.date),
    val: Number(row.val || 0),
    cash: Number(row.cash || 0),
    crypto: Number(row.crypto || 0),
    usdt: Number(row.usdt || 0),
    stock: Number(row.stock || 0),
    memo: String(row.memo || '').trim(),
  };
}

function fromV2Trade(t) {
  const artifacts = Array.isArray(t.artifacts) ? t.artifacts : [];
  return {
    ...t,
    playbookScore: Number(t.playbookScore || 5),
    book: t.book || 'INTRADAY',
    marketRegime: t.marketRegime || 'TREND',
    biasTimeframe: t.biasTimeframe || 'NEUTRAL',
    catalyst: t.catalyst || '',
    invalidationNote: t.invalidationNote || '',
    checklist: normalizeList(t.checklist),
    verdict: t.verdict || 'NEUTRAL',
    improvements: normalizeList(t.improvements),
    markPrice: Number(t.markPrice || 0),
    stopMoved: Boolean(t.stopMoved),
    breakevenMoved: Boolean(t.breakevenMoved),
    liveNotes: t.liveNotes || '',
    evidence: t.evidence || {
      entryChart: artifacts[0] || '',
      exitChart: artifacts[1] || '',
      extra: artifacts.slice(2),
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
    session: 'NEW YORK',
    book: 'INTRADAY',
    marketRegime: 'TREND',
    biasTimeframe: 'NEUTRAL',
    setupEntry: t.setupE || '',
    setupExit: t.setupX || '',
    grade: t.grade || 'B',
    playbookScore: 5,
    accountSize: Number(t.acc || 10000),
    riskPct: Number(t.risk || 0.5),
    leverage: Number(t.lev || 5),
    makerFee: Number(t.fM || 0.02),
    takerFee: Number(t.fT || 0.05),
    stopPrice: Number(t.sl || 0),
    stopType: t.slT || 'M',
    adjustment: Number(t.fine || 0),
    markPrice: 0,
    stopMoved: false,
    breakevenMoved: false,
    context: '',
    thesis: '',
    catalyst: '',
    invalidationNote: '',
    review: t.memo || '',
    liveNotes: '',
    tags: [],
    mistakes: [],
    emotion: '',
    verdict: 'NEUTRAL',
    checklist: [],
    improvements: [],
    evidence: {
      entryChart: t.img1 || '',
      exitChart: t.img2 || '',
      extra: [],
    },
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
    session: String(t.session || 'NEW YORK').trim().toUpperCase(),
    book: String(t.book || 'INTRADAY').trim().toUpperCase(),
    marketRegime: String(t.marketRegime || 'TREND').trim().toUpperCase(),
    biasTimeframe: String(t.biasTimeframe || 'NEUTRAL').trim().toUpperCase(),
    setupEntry: String(t.setupEntry || '').trim().toUpperCase(),
    setupExit: String(t.setupExit || '').trim().toUpperCase(),
    grade: String(t.grade || 'B').trim().toUpperCase(),
    playbookScore: clamp(Math.round(Number(t.playbookScore || 5)), 1, 10),

    accountSize: Math.max(0, Number(t.accountSize || 10000)),
    riskPct: Math.max(0, Number(t.riskPct || 0.5)),
    leverage: Math.max(1, Number(t.leverage || 5)),
    makerFee: Math.max(0, Number(t.makerFee || 0.02)),
    takerFee: Math.max(0, Number(t.takerFee || 0.05)),
    stopPrice: Number(t.stopPrice || 0),
    stopType: String(t.stopType || 'M').toUpperCase(),
    adjustment: Number(t.adjustment || 0),
    markPrice: Number(t.markPrice || 0),
    stopMoved: Boolean(t.stopMoved),
    breakevenMoved: Boolean(t.breakevenMoved),

    context: String(t.context || '').trim(),
    thesis: String(t.thesis || '').trim(),
    catalyst: String(t.catalyst || '').trim(),
    invalidationNote: String(t.invalidationNote || '').trim(),
    review: String(t.review || '').trim(),
    liveNotes: String(t.liveNotes || '').trim(),

    emotion: String(t.emotion || '').trim().toUpperCase(),
    verdict: String(t.verdict || 'NEUTRAL').trim().toUpperCase(),
    tags: normalizeLowerList(t.tags),
    mistakes: normalizeLowerList(t.mistakes),
    checklist: normalizeList(t.checklist),
    improvements: normalizeList(t.improvements),

    evidence: normalizeEvidence(t.evidence, t.artifacts),
    entries: normalizeLegs(t.entries, true),
    exits: normalizeLegs(t.exits, false),
  };

  trade.metrics = recalcTrade(trade);
  return trade;
}

function normalizeEvidence(evidence, artifacts) {
  const fallback = Array.isArray(artifacts) ? artifacts : [];
  const obj = evidence && typeof evidence === 'object' ? evidence : {};
  return {
    entryChart: String(obj.entryChart || fallback[0] || '').trim(),
    exitChart: String(obj.exitChart || fallback[1] || '').trim(),
    extra: Array.isArray(obj.extra)
      ? obj.extra.map(v => String(v).trim()).filter(Boolean)
      : fallback.slice(2).map(v => String(v).trim()).filter(Boolean),
  };
}

function normalizeLegs(value, withDefault) {
  const rows = Array.isArray(value) ? value : [];
  const mapped = rows.map(row => ({
    price: Number(row.price || 0),
    type: String(row.type || 'M').toUpperCase() === 'T' ? 'T' : 'M',
    weight: Math.max(0, Number(row.weight || 0)),
  }));
  if (!mapped.length && withDefault) return [{ price: 0, type: 'M', weight: 100 }];
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
