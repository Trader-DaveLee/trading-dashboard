import { recalcTrade } from './calc.js';

export const STORAGE_KEY = 'btc_trading_research_dashboard_v2';
export const DRAFT_KEY = 'btc_trading_research_dashboard_v2_draft';
export const PREFS_KEY = 'btc_trading_research_dashboard_v2_prefs';

const DEFAULT_DB = {
  schemaVersion: 2,
  meta: {
    tickers: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    entrySetups: ['BREAKOUT', 'RECLAIM', 'RANGE SWEEP', 'TREND CONTINUATION'],
    exitSetups: ['TRAIL STOP', 'FIXED TARGET', 'TIME STOP'],
  },
  trades: [],
};

export function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DB);
    const parsed = JSON.parse(raw);
    return migrateDB(parsed);
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
  link.download = `btc_trading_dashboard_v2_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
}

export function parseImport(text) {
  const parsed = JSON.parse(text);
  return migrateDB(parsed);
}

function migrateDB(input) {
  if (input && input.schemaVersion === 2 && Array.isArray(input.trades)) {
    return {
      schemaVersion: 2,
      meta: { ...structuredClone(DEFAULT_DB.meta), ...(input.meta || {}) },
      trades: input.trades.map(normalizeTrade),
    };
  }

  if (Array.isArray(input)) {
    return {
      schemaVersion: 2,
      meta: structuredClone(DEFAULT_DB.meta),
      trades: input.map(fromV5Trade),
    };
  }

  if (input && Array.isArray(input.trades)) {
    return {
      schemaVersion: 2,
      meta: { ...structuredClone(DEFAULT_DB.meta), ...(input.meta || {}) },
      trades: input.trades.map(normalizeTrade),
    };
  }

  return structuredClone(DEFAULT_DB);
}

function fromV5Trade(t) {
  return normalizeTrade({
    id: t.id || crypto.randomUUID(),
    date: t.date ? `${t.date}T00:00` : new Date().toISOString().slice(0, 16),
    ticker: t.ticker || 'BTCUSDT',
    status: t.status || 'CLOSED',
    side: t.dir === -1 ? 'SHORT' : 'LONG',
    session: 'NEW YORK',
    setupEntry: t.setupE || '',
    setupExit: t.setupX || '',
    grade: t.grade || 'B',
    accountSize: Number(t.acc || 10000),
    riskPct: Number(t.risk || 0.5),
    leverage: Number(t.lev || 10),
    makerFee: Number(t.fM || 0.02),
    takerFee: Number(t.fT || 0.05),
    stopPrice: Number(t.sl || 0),
    stopType: t.slT || 'M',
    playbookScore: 5,
    context: '',
    thesis: '',
    review: t.memo || '',
    tags: [],
    mistakes: [],
    emotion: '',
    artifacts: [t.img1, t.img2].filter(Boolean),
    entries: (t.entries || []).map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    exits: (t.exits || []).map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    adjustment: Number(t.fine || 0),
  });
}

export function normalizeTrade(t) {
  const trade = {
    id: t.id || crypto.randomUUID(),
    date: normalizeDate(t.date),
    ticker: String(t.ticker || 'BTCUSDT').toUpperCase(),
    status: t.status || 'CLOSED',
    side: t.side || 'LONG',
    session: t.session || 'NEW YORK',
    setupEntry: String(t.setupEntry || '').toUpperCase(),
    setupExit: String(t.setupExit || '').toUpperCase(),
    grade: t.grade || 'B',
    accountSize: Number(t.accountSize || 10000),
    riskPct: Number(t.riskPct || 0.5),
    leverage: Number(t.leverage || 10),
    makerFee: Number(t.makerFee || 0.02),
    takerFee: Number(t.takerFee || 0.05),
    stopPrice: Number(t.stopPrice || 0),
    stopType: t.stopType || 'M',
    playbookScore: Number(t.playbookScore || 5),
    context: t.context || '',
    thesis: t.thesis || '',
    review: t.review || '',
    tags: normalizeList(t.tags),
    mistakes: normalizeList(t.mistakes),
    emotion: t.emotion || '',
    artifacts: normalizeArtifacts(t.artifacts),
    entries: normalizeLegs(t.entries, true),
    exits: normalizeLegs(t.exits, false),
    adjustment: Number(t.adjustment || 0),
  };
  trade.metrics = recalcTrade(trade);
  return trade;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  if (value.includes('T')) return new Date(value).toISOString();
  return new Date(`${value}T00:00`).toISOString();
}
function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}
function normalizeArtifacts(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '').split('\n').map(v => v.trim()).filter(Boolean);
}
function normalizeLegs(value, defaultEntry) {
  if (!Array.isArray(value) || !value.length) return defaultEntry ? [{ price: 0, type: 'M', weight: 100 }] : [];
  return value.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) }));
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
    return raw ? JSON.parse(raw) : { compactTable: false };
  } catch {
    return { compactTable: false };
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
