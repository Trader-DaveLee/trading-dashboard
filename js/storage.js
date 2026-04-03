import { recalcTrade } from './calc.js';
import { idbGet, idbSet, idbDelete } from './idb.js';

export const STORAGE_KEY = 'trading_desk_dashboard_v3';
export const LEGACY_STORAGE_KEYS = [
  'trading_desk_dashboard_v3',
  'btc_trading_research_dashboard_v2'
];
export const DRAFT_KEY = 'trading_desk_dashboard_v3_draft';
const IDB_DB_KEY = 'main-db';
const IDB_DRAFT_KEY = 'draft';

const DEFAULT_CONTEXT_PROMPTS = {
  structure: '시장 구조: \n유동성 위치: \n상위 타임프레임 방향: \n세션 성격: ',
  catalyst: '촉매 / 뉴스: \n시장 테마: \n주의해야 할 이벤트: '
};

const DEFAULT_LOGIC_PROMPTS = {
  trigger: '엔트리 트리거: \n추가 진입 조건: \n확인해야 할 가격 행동: ',
  invalidation: '무효화 기준: \n청산 계획: \n계획이 틀렸다고 인정할 조건: '
};

const DEFAULT_SETUP_TEMPLATES = {
  'BREAKOUT': {
    riskPct: 0.75,
    plannerMode: 'BALANCED',
    plannerLegs: 3,
    plannerWeightMode: 'BACKLOADED',
    stopType: 'T',
    tags: ['trend', 'breakout'],
    checklistHints: ['손절 설정 확인', '상위 구조와 방향 일치', '유동성/거래량 확인'],
    contextPrompt: '시장 구조: 박스 상단 돌파 또는 고점 갱신 구조 확인\n유동성 위치: 돌파 직전/직후 스탑 유동성 집중 구간\n상위 타임프레임 방향: 상방 모멘텀 유지 여부 확인',
    thesisPrompt: '엔트리 트리거: 돌파 후 지지 전환 또는 재확인\n추가 진입 조건: 돌파 후 눌림이 얕고 거래량 유지\n무효화 기준: 돌파 실패 후 박스 안 재진입'
  },
  'BREAKOUT RETEST': {
    riskPct: 0.8,
    plannerMode: 'AVERAGING',
    plannerLegs: 2,
    plannerWeightMode: 'BACKLOADED',
    stopType: 'T',
    tags: ['breakout', 'retest'],
    checklistHints: ['손절 설정 확인', '돌파 레벨 재확인', '재테스트 거래량 확인'],
    contextPrompt: '시장 구조: 돌파 후 되돌림 재테스트 구조\n유동성 위치: 돌파 레벨 바로 아래 유동성 확인\n세션 성격: 모멘텀 유지 여부 체크',
    thesisPrompt: '엔트리 트리거: 돌파 레벨 재지지 확인\n추가 진입 조건: 되돌림 저점 유지 + 거래량 재확인\n무효화 기준: 재테스트 실패 후 돌파 레벨 하향 이탈'
  },
  'RECLAIM': {
    riskPct: 0.75,
    plannerMode: 'BALANCED',
    plannerLegs: 2,
    plannerWeightMode: 'BACKLOADED',
    stopType: 'M',
    tags: ['reclaim', 'support'],
    checklistHints: ['손절 설정 확인', '핵심 레벨 재탈환 확인', '실패 시 즉시 무효화'],
    contextPrompt: '시장 구조: 핵심 레벨 이탈 후 재탈환 구조\n유동성 위치: 레벨 아래 스탑 소화 여부\n상위 타임프레임 방향: 재탈환 후 추세 전환 가능성 확인',
    thesisPrompt: '엔트리 트리거: 레벨 재탈환 후 종가 안착\n추가 진입 조건: 재테스트 성공 또는 저점 상승\n무효화 기준: 재탈환 실패 후 다시 레벨 하향 이탈'
  },
  'LIQUIDITY SWEEP RECLAIM': {
    riskPct: 0.9,
    plannerMode: 'BALANCED',
    plannerLegs: 2,
    plannerWeightMode: 'FRONTLOADED',
    stopType: 'M',
    tags: ['sweep', 'reclaim', 'liquidity'],
    checklistHints: ['유동성 스윕 확인', '재탈환 확인', '즉시 무효화 수준 명확'],
    contextPrompt: '시장 구조: 저점/고점 스윕 후 빠른 재탈환\n유동성 위치: 스윕 구간 아래/위 스탑 소화 확인\n세션 성격: 개장 직후 변동성 과열 여부 체크',
    thesisPrompt: '엔트리 트리거: 스윕 후 레벨 재탈환\n추가 진입 조건: 첫 눌림이 얕고 재매수/재매도 유입\n무효화 기준: 스윕 저점/고점 재이탈'
  },
  'RANGE SWEEP': {
    riskPct: 0.6,
    plannerMode: 'SINGLE',
    plannerLegs: 1,
    plannerWeightMode: 'EQUAL',
    stopType: 'M',
    tags: ['range', 'sweep', 'mean-reversion'],
    checklistHints: ['레인지 상/하단 명확', '스윕 후 반응 확인', '과도한 추세장 회피'],
    contextPrompt: '시장 구조: 박스권 상단/하단 근처 스윕 구조\n유동성 위치: 레인지 밖 스탑 쏠림 구간\n환경: 강한 추세장인지 여부 확인',
    thesisPrompt: '엔트리 트리거: 스윕 직후 빠른 복귀\n추가 진입 조건: 복귀 확인 후만 제한적으로\n무효화 기준: 레인지 복귀 실패'
  },
  'TREND CONTINUATION': {
    riskPct: 0.8,
    plannerMode: 'AVERAGING',
    plannerLegs: 2,
    plannerWeightMode: 'BACKLOADED',
    stopType: 'T',
    tags: ['trend', 'continuation'],
    checklistHints: ['상위 추세 유지', '되돌림 깊이 점검', '추세 손상 시 철수'],
    contextPrompt: '시장 구조: 상위 추세 지속 구간\n유동성 위치: 직전 고점/저점 돌파 대기\n환경: 추세 피로/과열 여부 확인',
    thesisPrompt: '엔트리 트리거: 눌림 후 추세 재개\n추가 진입 조건: 고점/저점 갱신 후 피라미딩 가능\n무효화 기준: 추세 저점/고점 훼손'
  },
  'PYRAMID CONTINUATION': {
    riskPct: 0.6,
    plannerMode: 'PYRAMID',
    plannerLegs: 3,
    plannerWeightMode: 'FRONTLOADED',
    stopType: 'T',
    tags: ['trend', 'pyramid'],
    checklistHints: ['초기 진입 수익 보호', '추격 진입은 분할', '평균단가 악화 주의'],
    contextPrompt: '시장 구조: 이미 추세가 확인된 구간에서 고점/저점 갱신 지속\n유동성 위치: 이전 돌파 레벨 위/아래 추세 지지 확인\n환경: 강한 모멘텀 장인지 체크',
    thesisPrompt: '엔트리 트리거: 돌파 이후 재가속\n추가 진입 조건: 이전 수익 보호된 상태에서만 피라미딩\n무효화 기준: 마지막 돌파 구조 무효화'
  },
  'OPEN DRIVE': {
    riskPct: 0.5,
    plannerMode: 'SINGLE',
    plannerLegs: 1,
    plannerWeightMode: 'EQUAL',
    stopType: 'T',
    tags: ['open-drive', 'momentum'],
    checklistHints: ['개장 초반 변동성 확인', '과도한 추격 금지', '첫 5~15분 구조 확인'],
    contextPrompt: '시장 구조: 개장 직후 방향성 드라이브\n유동성 위치: 오픈레인지 상하단\n환경: 개장 뉴스/경제지표 여부 확인',
    thesisPrompt: '엔트리 트리거: 오픈레인지 이탈 후 확장\n추가 진입 조건: 첫 눌림 지지 확인 시만\n무효화 기준: 오픈레인지 재진입'
  }
};

export const DEFAULT_DB = {
  schemaVersion: 5,
  _sync: { revision: 0, lastSavedAt: '', source: 'seed' },
  meta: {
    tickers: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ETHBTC', 'BNBUSDT', 'XRPUSDT'],
    entrySetups: [
      'BREAKOUT',
      'BREAKOUT RETEST',
      'RECLAIM',
      'LIQUIDITY SWEEP RECLAIM',
      'RANGE SWEEP',
      'TREND CONTINUATION',
      'PYRAMID CONTINUATION',
      'OPEN DRIVE'
    ],
    exitSetups: ['TRAIL STOP', 'FIXED TARGET', 'TIME STOP', 'SCALE OUT', 'B/E PROTECT'],
    tagPresets: ['trend', 'breakout', 'reclaim', 'sweep', 'liquidity', 'continuation', 'pyramid', 'range', 'open-drive', 'news', 'htf-aligned', 'a-plus'],
    mistakePresets: ['fomo', 'oversize', 'early exit', 'late stop', 'countertrend', 'revenge', 'no-confirmation', 'ignored-plan', 'overtrade', 'late-entry'],
    accountBalance: 10000,
    balanceHistory: [],
    rules: '1) 손절이 명확하지 않으면 진입 금지\n2) 리스크 한도 초과 금지\n3) 계획 외 추가 진입 금지\n4) 손실 복구 목적의 감정 매매 금지',
    checklists: ['손절 설정 확인', '리스크 1% 이하 또는 계획 범위 내', '상위 구조와 방향 일치', '엔트리 트리거 확인', '무효화 기준 명확', '추가 진입 조건 명확'],
    lastTradeForm: null,
    quickLinks: [
      { name: 'TradingView', url: 'https://tradingview.com', icon: '📈' },
      { name: 'CoinMarketCap', url: 'https://coinmarketcap.com', icon: '🪙' },
      { name: 'Economic Calendar', url: 'https://kr.investing.com/economic-calendar/', icon: '📅' }
    ],
    setupTemplates: DEFAULT_SETUP_TEMPLATES,
    contextPrompts: DEFAULT_CONTEXT_PROMPTS,
    thesisPrompts: DEFAULT_LOGIC_PROMPTS,
    lastSavedAt: ''
  },
  trades: [],
};

function nowIso() {
  return new Date().toISOString();
}

function toValidIso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function parseLocalDateTimeString(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0), 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDate(value) {
  if (!value) return nowIso();
  if (typeof value === 'string') {
    const localDate = parseLocalDateTimeString(value);
    if (localDate) return localDate.toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return nowIso();
  return date.toISOString();
}

function timestampOf(value) {
  const iso = toValidIso(value);
  return iso ? Date.parse(iso) : 0;
}

function normalizeSync(value = {}, fallback = {}) {
  const revision = Math.max(0, Number(value.revision ?? value.rev ?? fallback.revision ?? 0) || 0);
  const lastSavedAt = toValidIso(value.lastSavedAt || value.savedAt || fallback.lastSavedAt || fallback.savedAt || '');
  const source = String(value.source || fallback.source || 'legacy').trim() || 'legacy';
  return { revision, lastSavedAt, source };
}

function deriveDbLatestTimestamp(db) {
  const candidates = [
    timestampOf(db?.meta?.lastSavedAt),
    timestampOf(db?._sync?.lastSavedAt),
    timestampOf(db?.exportedAt),
    timestampOf(db?.savedAt)
  ];
  for (const trade of Array.isArray(db?.trades) ? db.trades : []) {
    candidates.push(timestampOf(trade?.updatedAt));
    candidates.push(timestampOf(trade?.closedAt));
    candidates.push(timestampOf(trade?.date));
  }
  return Math.max(0, ...candidates);
}

function dbSyncOf(db) {
  return normalizeSync(db?._sync || db?.sync || {}, {
    source: 'db',
    lastSavedAt: deriveDbLatestTimestamp(db) ? new Date(deriveDbLatestTimestamp(db)).toISOString() : ''
  });
}

function draftSyncOf(draft) {
  return normalizeSync(draft?._sync || draft?.sync || {}, {
    source: 'draft',
    lastSavedAt: draft?.savedAt || ''
  });
}

function compareSync(a, b) {
  const left = normalizeSync(a);
  const right = normalizeSync(b);
  if (left.revision !== right.revision) return left.revision - right.revision;
  const leftTs = timestampOf(left.lastSavedAt);
  const rightTs = timestampOf(right.lastSavedAt);
  if (leftTs !== rightTs) return leftTs - rightTs;
  return 0;
}

function compareDbFreshness(a, b) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;
  const syncCompare = compareSync(dbSyncOf(a), dbSyncOf(b));
  if (syncCompare) return syncCompare;
  const latestCompare = deriveDbLatestTimestamp(a) - deriveDbLatestTimestamp(b);
  if (latestCompare) return latestCompare;
  return (Array.isArray(a?.trades) ? a.trades.length : 0) - (Array.isArray(b?.trades) ? b.trades.length : 0);
}

function compareDraftFreshness(a, b) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;
  const syncCompare = compareSync(draftSyncOf(a), draftSyncOf(b));
  if (syncCompare) return syncCompare;
  return timestampOf(a?.savedAt) - timestampOf(b?.savedAt);
}

function stampDb(db, source = 'runtime') {
  const current = dbSyncOf(db);
  const next = {
    revision: current.revision + 1,
    lastSavedAt: nowIso(),
    source,
  };
  db._sync = next;
  if (db.meta && typeof db.meta === 'object') db.meta.lastSavedAt = next.lastSavedAt;
  return db;
}

function stampDraftPayload(draft, source = 'runtime') {
  const current = draftSyncOf(draft);
  const stampedAt = nowIso();
  return {
    ...draft,
    savedAt: stampedAt,
    _sync: {
      revision: current.revision + 1,
      lastSavedAt: stampedAt,
      source,
    }
  };
}

function persistDbSnapshot(snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return idbSet(IDB_DB_KEY, snapshot);
}

function persistDraftSnapshot(snapshot) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  return idbSet(IDB_DRAFT_KEY, snapshot);
}

export function loadDB() {
  try {
    let best = null;
    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const migrated = migrateDB(parsed);
        if (!best || compareDbFreshness(migrated, best) > 0) best = migrated;
      } catch (error) {
        console.warn('[loadDB parse failed]', key, error);
      }
    }
    return best || structuredClone(DEFAULT_DB);
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

let indexedDbSaveTimer = null;
let latestQueuedDB = null;

export function saveDB(db) {
  stampDb(db, 'localStorage');
  const snapshot = structuredClone(db);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  latestQueuedDB = snapshot;
  if (indexedDbSaveTimer) clearTimeout(indexedDbSaveTimer);
  indexedDbSaveTimer = setTimeout(() => {
    const toSave = latestQueuedDB;
    latestQueuedDB = null;
    indexedDbSaveTimer = null;
    if (!toSave) return;
    idbSet(IDB_DB_KEY, toSave).catch(err => console.error('[IndexedDB saveDB]', err));
  }, 120);
}

export async function hydrateDBFromIndexedDB(currentDb = null) {
  try {
    const localDb = currentDb ? migrateDB(currentDb) : loadDB();
    const raw = await idbGet(IDB_DB_KEY);
    const idbDb = raw ? migrateDB(raw) : null;
    const winner = compareDbFreshness(idbDb, localDb) > 0 ? idbDb : localDb;
    if (!winner) return null;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(winner));
    if (compareDbFreshness(localDb, idbDb) >= 0) {
      await idbSet(IDB_DB_KEY, winner);
    }
    return winner;
  } catch (error) {
    console.error('[IndexedDB hydrateDBFromIndexedDB]', error);
    return currentDb ? migrateDB(currentDb) : loadDB();
  }
}

export function exportDB(db) {
  const payload = { exportedAt: nowIso(), ...db };
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

  if ((input.schemaVersion === 5 || input.schemaVersion === 4 || input.schemaVersion === 3 || input.schemaVersion === 2) && Array.isArray(input.trades)) {
    const db = {
      schemaVersion: 5,
      _sync: normalizeSync(input._sync || input.sync, { source: 'migrated', lastSavedAt: input.meta?.lastSavedAt || input.savedAt || input.exportedAt || '' }),
      meta: normalizeMeta(input.meta),
      trades: input.trades.filter(Boolean).map(fromV2Trade).map(normalizeTrade),
    };
    if (!db._sync.lastSavedAt) db._sync.lastSavedAt = deriveDbLatestTimestamp(db) ? new Date(deriveDbLatestTimestamp(db)).toISOString() : '';
    return db;
  }

  if (Array.isArray(input)) {
    const db = {
      schemaVersion: 5,
      _sync: normalizeSync({}, { source: 'legacy-array', lastSavedAt: input.savedAt || '' }),
      meta: structuredClone(DEFAULT_DB.meta),
      trades: input.filter(Boolean).map(fromV5Trade).map(normalizeTrade),
    };
    if (!db._sync.lastSavedAt) db._sync.lastSavedAt = deriveDbLatestTimestamp(db) ? new Date(deriveDbLatestTimestamp(db)).toISOString() : '';
    return db;
  }

  if (input && Array.isArray(input.trades)) {
    const db = {
      schemaVersion: 5,
      _sync: normalizeSync(input._sync || input.sync, { source: 'legacy-object', lastSavedAt: input.meta?.lastSavedAt || input.savedAt || input.exportedAt || '' }),
      meta: normalizeMeta(input.meta),
      trades: input.trades.filter(Boolean).map(fromV2Trade).map(normalizeTrade),
    };
    if (!db._sync.lastSavedAt) db._sync.lastSavedAt = deriveDbLatestTimestamp(db) ? new Date(deriveDbLatestTimestamp(db)).toISOString() : '';
    return db;
  }

  if (input && typeof input === 'object') {
    const possibleTrades = Array.isArray(input.rows) ? input.rows : Array.isArray(input.items) ? input.items : null;
    if (possibleTrades) {
      const db = {
        schemaVersion: 5,
        _sync: normalizeSync(input._sync || input.sync, { source: 'salvage', lastSavedAt: input.savedAt || input.exportedAt || '' }),
        meta: normalizeMeta(input.meta),
        trades: possibleTrades.filter(Boolean).map(fromV2Trade).map(normalizeTrade),
      };
      if (!db._sync.lastSavedAt) db._sync.lastSavedAt = deriveDbLatestTimestamp(db) ? new Date(deriveDbLatestTimestamp(db)).toISOString() : '';
      return db;
    }
  }

  return structuredClone(DEFAULT_DB);
}

function mergeUniqueList(current, defaults, normalizer = normalizeList) {
  const merged = [...normalizer(defaults), ...normalizer(current)];
  return [...new Set(merged)];
}

function normalizeSetupTemplates(templates = {}) {
  const merged = { ...DEFAULT_SETUP_TEMPLATES, ...(templates || {}) };
  return Object.fromEntries(Object.entries(merged).map(([key, value]) => {
    const template = value && typeof value === 'object' ? value : {};
    return [String(key).trim().toUpperCase(), {
      riskPct: Math.max(0, Number(template.riskPct ?? 0.75)),
      plannerMode: normalizePlannerMode(template.plannerMode),
      plannerLegs: Math.max(1, Number(template.plannerLegs ?? 2)),
      plannerWeightMode: normalizePlannerWeightMode(template.plannerWeightMode),
      stopType: String(template.stopType || 'M').toUpperCase() === 'T' ? 'T' : 'M',
      tags: normalizeLowerList(template.tags),
      checklistHints: normalizeList(template.checklistHints),
      contextPrompt: String(template.contextPrompt || '').trim(),
      thesisPrompt: String(template.thesisPrompt || '').trim(),
    }];
  }));
}

function normalizePromptGroup(group, defaults) {
  const raw = group && typeof group === 'object' ? group : {};
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value || '').trim()])),
  };
}

function normalizeMeta(meta = {}) {
  const base = structuredClone(DEFAULT_DB.meta);
  return {
    ...base,
    ...meta,
    tickers: mergeUniqueList(meta.tickers || base.tickers, base.tickers, normalizeUpperList),
    entrySetups: mergeUniqueList(meta.entrySetups || base.entrySetups, base.entrySetups, normalizeUpperList),
    exitSetups: mergeUniqueList(meta.exitSetups || base.exitSetups, base.exitSetups, normalizeUpperList),
    tagPresets: mergeUniqueList(meta.tagPresets || base.tagPresets, base.tagPresets, normalizeLowerList),
    mistakePresets: mergeUniqueList(meta.mistakePresets || base.mistakePresets, base.mistakePresets, normalizeLowerList),
    balanceHistory: Array.isArray(meta.balanceHistory) ? meta.balanceHistory.map(normalizeBalancePoint) : [],
    accountBalance: Number(meta.accountBalance || base.accountBalance),
    rules: String(meta.rules || base.rules || ''),
    checklists: mergeUniqueList(meta.checklists || base.checklists, base.checklists, normalizeList),
    lastTradeForm: meta.lastTradeForm || null,
    quickLinks: normalizeQuickLinks(meta.quickLinks, base.quickLinks),
    setupTemplates: normalizeSetupTemplates(meta.setupTemplates),
    contextPrompts: normalizePromptGroup(meta.contextPrompts, DEFAULT_CONTEXT_PROMPTS),
    thesisPrompts: normalizePromptGroup(meta.thesisPrompts, DEFAULT_LOGIC_PROMPTS),
    lastSavedAt: toValidIso(meta.lastSavedAt || '')
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
    date: t.date ? `${t.date}T00:00` : nowIso(),
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
    targetPrice: Number(t.targetPrice || 0),
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
    targetPrice: Number(t.targetPrice || 0),
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
    closedAt: t.closedAt ? normalizeDate(t.closedAt) : '',
    updatedAt: t.updatedAt ? normalizeDate(t.updatedAt) : '',
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
  if (!/^https?:\/\//i.test(trimmed)) trimmed = 'https://' + trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function normalizeEvidenceItem(value, defaultTimeframe = 'Day') {
  if (!value) return null;

  if (typeof value === 'object' && value !== null) {
    const timeframeRaw = String(value.timeframe || defaultTimeframe).trim();
    const timeframe = timeframeRaw || defaultTimeframe;
    const url = sanitizeUrl(value.url || value.href || value.src || '');
    return url ? { timeframe, url } : null;
  }

  const raw = String(value).trim();
  if (!raw || raw === '[object Object]' || raw === 'https://[object Object]') return null;
  const url = sanitizeUrl(raw);
  return url ? { timeframe: defaultTimeframe, url } : null;
}

function normalizeEvidenceArray(values, defaultTimeframe = 'Day') {
  if (!Array.isArray(values)) return [];
  return values.map(v => normalizeEvidenceItem(v, defaultTimeframe)).filter(Boolean);
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
    entryCharts: normalizeEvidenceArray(entryArray),
    exitCharts: normalizeEvidenceArray(exitArray),
    liveCharts: normalizeEvidenceArray(Array.isArray(obj.liveCharts) ? obj.liveCharts : []),
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

function normalizeDraftPayload(draft) {
  if (!draft || typeof draft !== 'object') return null;
  const payload = {
    ...draft,
    savedAt: toValidIso(draft.savedAt || '') || nowIso(),
    _sync: draftSyncOf(draft),
  };
  if (draft.trade) payload.trade = normalizeTrade(draft.trade);
  return payload;
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return normalizeDraftPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function hydrateDraftFromIndexedDB(currentDraft = null) {
  try {
    const localDraft = currentDraft ? normalizeDraftPayload(currentDraft) : loadDraft();
    const raw = await idbGet(IDB_DRAFT_KEY);
    const idbDraft = normalizeDraftPayload(raw);
    const winner = compareDraftFreshness(idbDraft, localDraft) > 0 ? idbDraft : localDraft;
    if (!winner) return null;
    await persistDraftSnapshot(winner);
    return winner;
  } catch (error) {
    console.error('[IndexedDB hydrateDraftFromIndexedDB]', error);
    return currentDraft ? normalizeDraftPayload(currentDraft) : loadDraft();
  }
}

export function saveDraft(draft) {
  const payload = stampDraftPayload(normalizeDraftPayload(draft) || { trade: normalizeTrade({}) }, 'localStorage');
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[saveDraft localStorage]', error);
  }
  idbSet(IDB_DRAFT_KEY, payload).catch(err => console.error('[IndexedDB saveDraft]', err));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  idbDelete(IDB_DRAFT_KEY).catch(err => console.error('[IndexedDB clearDraft]', err));
}
