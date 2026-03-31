import { recalcTrade } from './calc.js';
import {
  summarize, groupAverageR, tagStats, emotionStats, playbookBuckets,
  recentWindowStats, sessionSetupStats, gradeStats, filterTradesByDate
} from './analytics.js';
import {
  loadDB, saveDB, exportDB, parseImport, normalizeTrade,
  loadDraft, saveDraft, clearDraft, loadPrefs, savePrefs
} from './storage.js';

const state = {
  db: loadDB(),
  prefs: loadPrefs(),
  view: 'overview',
  month: new Date(),
  selectedTradeId: null,
  filteredTrades: [],
  draftEntries: [{ price: 0, type: 'M', weight: 100 }],
  draftExits: [],
  dirty: false,
};

const views = ['overview', 'journal', 'library', 'playbook'];
const els = {};
let draftTimer = null;

const ID_LIST = [
  'nav','force-save-draft','export-json','import-json-btn','import-json','journal-status','draft-saved-at',
  'view-overview','metrics','overview-from','overview-to','overview-clear','prev-month','calendar-title','next-month','calendar','equity-chart','setup-chart','mistake-list','research-notes','recent-window','emotion-board','playbook-board','overview-portfolio',
  'view-journal','trade-form','trade-id','trade-date','btn-now','ticker','btn-manage-ticker','status','session','side','book','market-regime','bias-timeframe','setup-entry','btn-manage-setup-entry','setup-exit','btn-manage-setup-exit',
  'account-size','risk-pct','leverage','maker-fee','taker-fee','stop-price','mark-price','stop-type','adjustment','stop-moved','breakeven-moved',
  'context','thesis','catalyst','invalidation-note','checklist','review','chart-entry','chart-exit','extra-evidence','tags','mistakes','emotion','btn-manage-emotion','verdict',
  'add-entry','entries','add-exit','exits','calc-summary','quick-tags','quick-mistakes','live-notes','btn-insert-time',
  'bal-cash','bal-crypto','bal-usdt','bal-stock','bal-total','balance-memo','btn-update-balance','balance-history',
  'duplicate-trade','reset-form','delete-trade','grade','playbook-score','deep-review-r','playbook-indicator',
  'desk-rules','risk-risk-dollar','risk-qty','risk-margin','risk-slider','risk-notional','risk-stop-distance','risk-fees','risk-realized','risk-unrealized','risk-residual',
  'view-library','q','f-from','f-to','f-status','f-side','f-session','f-setup','f-emotion','f-tag','f-mistake','f-grade','f-playbook-min','sort','clear-filters','library-result-count','review-position','review-breadcrumb','prev-trade','next-trade','filter-same-setup','filter-same-ticker','clear-quick-filter','trade-table','detail','detail-insights',
  'view-playbook','playbook-gallery','improvements'
];

window.__desk = {
  selectTrade: id => selectTrade(id),
  applySameSetupFilter: () => filterBySelectedSetup(),
  applySameTickerFilter: () => filterBySelectedTicker(),
};

// ✨ 캘린더에서 일자 클릭 시 해당 일자의 Library로 점프하는 글로벌 함수
window.__desk_jump_date = (dateString) => {
  setVal('f-from', dateString);
  setVal('f-to', dateString);
  state.view = 'library';
  renderViews();
  // 부드러운 스크롤 탑
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

bootstrap();

function bootstrap() {
  cacheEls();
  bindEvents();
  initMeta();
  renderNav();
  hydrateInitialForm();
  restoreDraftIfPresent();
  render();
}

function cacheEls() {
  ID_LIST.forEach(id => {
    els[id] = document.getElementById(id);
  });
}

function initMeta() {
  state.db.meta.emotions = state.db.meta.emotions || ['CALM', 'FOCUSED', 'FOMO', 'TIRED', 'REVENGE'];
  state.db.meta.tagPresets = state.db.meta.tagPresets || ['trend', 'sweep'];
  state.db.meta.mistakePresets = state.db.meta.mistakePresets || ['fomo', 'early exit'];
  state.db.meta.balanceHistory = Array.isArray(state.db.meta.balanceHistory) ? state.db.meta.balanceHistory : [];
  renderDropdowns();
  renderQuickChips();
  renderAccountBalance();
}

function bindEvents() {
  els['btn-manage-ticker'].onclick = () => manageList('tickers', 'Ticker', 'upper');
  els['btn-manage-setup-entry'].onclick = () => manageList('entrySetups', 'Entry Setup', 'upper');
  els['btn-manage-setup-exit'].onclick = () => manageList('exitSetups', 'Exit Setup', 'upper');
  els['btn-manage-emotion'].onclick = () => manageList('emotions', 'Emotion', 'upper');

  els['btn-now'].onclick = () => {
    setVal('trade-date', inputDate(new Date().toISOString()));
    markDirty();
    updatePreview();
  };

  els['prev-month'].onclick = () => {
    state.month.setMonth(state.month.getMonth() - 1);
    renderCalendar();
  };
  els['next-month'].onclick = () => {
    state.month.setMonth(state.month.getMonth() + 1);
    renderCalendar();
  };

  els['add-entry'].onclick = () => {
    state.draftEntries.push({ price: 0, type: 'M', weight: 0 });
    renderLegs('entry');
    updatePreview();
  };
  els['add-exit'].onclick = () => {
    state.draftExits.push({ price: 0, type: 'M', weight: 0 });
    renderLegs('exit');
    updatePreview();
  };

  els['reset-form'].onclick = resetForm;
  els['delete-trade'].onclick = deleteTrade;
  els['duplicate-trade'].onclick = duplicateTrade;
  els['trade-form'].addEventListener('submit', handleSubmit);

  els['force-save-draft'].onclick = () => {
    persistDraft(true);
    saveDB(state.db);
    refreshJournalStatus('임시저장 완료');
  };

  els['export-json'].onclick = () => exportDB(state.db);
  els['import-json-btn'].onclick = () => els['import-json'].click();
  els['import-json'].onchange = handleImport;

  ['overview-from', 'overview-to'].forEach(id => els[id].addEventListener('change', renderOverview));
  els['overview-clear'].onclick = () => {
    setVal('overview-from', '');
    setVal('overview-to', '');
    renderOverview();
  };

  const filterIds = ['q','f-from','f-to','f-status','f-side','f-session','f-setup','f-emotion','f-tag','f-mistake','f-grade','f-playbook-min','sort'];
  filterIds.forEach(id => els[id].addEventListener('input', renderLibrary));
  filterIds.forEach(id => els[id].addEventListener('change', renderLibrary));
  els['clear-filters'].onclick = clearFilters;

  els['prev-trade'].onclick = () => stepSelectedTrade(-1);
  els['next-trade'].onclick = () => stepSelectedTrade(1);
  els['filter-same-setup'].onclick = filterBySelectedSetup;
  els['filter-same-ticker'].onclick = filterBySelectedTicker;
  els['clear-quick-filter'].onclick = clearQuickFilter;

  els['btn-insert-time'].onclick = () => insertLiveNote('');
  document.querySelectorAll('.btn-live-action').forEach(btn => {
    btn.onclick = () => insertLiveNote(btn.dataset.text || '');
  });

  ['bal-cash','bal-crypto','bal-usdt','bal-stock'].forEach(id => {
    els[id].addEventListener('input', calcTotalBalance);
    els[id].addEventListener('change', calcTotalBalance);
  });

  els['btn-update-balance'].onclick = updateBalance;
  els['desk-rules'].addEventListener('input', () => {
    state.db.meta.rules = els['desk-rules'].value;
    saveDB(state.db);
  });

  bindKeyboardShortcuts();

  [
    'trade-date','ticker','status','session','side','book','market-regime','bias-timeframe','setup-entry','setup-exit',
    'account-size','risk-pct','leverage','maker-fee','taker-fee','stop-price','mark-price','stop-type','adjustment',
    'context','thesis','catalyst','invalidation-note','checklist','review','chart-entry','chart-exit','extra-evidence',
    'tags','mistakes','emotion','verdict','grade','playbook-score','live-notes','improvements'
  ].forEach(id => {
    if (!els[id]) return;
    els[id].addEventListener('input', handleFormMutation);
    els[id].addEventListener('change', handleFormMutation);
  });

  ['stop-moved','breakeven-moved'].forEach(id => {
    els[id].addEventListener('change', handleFormMutation);
  });
}

function handleFormMutation() {
  markDirty();
  updatePreview();
  persistDraft();
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    const targetTag = (event.target?.tagName || '').toLowerCase();
    const typing = ['input', 'textarea', 'select'].includes(targetTag);

    if ((event.metaKey || event.ctrlKey) && key === 's') {
      event.preventDefault();
      if (typing) {
        persistDraft(true);
      } else {
        handleSubmit(event);
      }
    }

    if (state.view === 'library' && !typing) {
      if (key === 'j') {
        event.preventDefault();
        stepSelectedTrade(1);
      }
      if (key === 'k') {
        event.preventDefault();
        stepSelectedTrade(-1);
      }
    }

    if ((event.metaKey || event.ctrlKey) && key === 'd') {
      event.preventDefault();
      duplicateTrade();
    }
  });
}

function renderNav() {
  els['nav'].innerHTML = views.map(view => `
    <button type="button" class="${state.view === view ? 'active' : ''}" data-view="${view}">
      ${titleCase(view)}
    </button>
  `).join('');

  els['nav'].querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      state.view = button.dataset.view;
      renderViews();
    };
  });
}

function renderViews() {
  views.forEach(view => {
    els[`view-${view}`].classList.toggle('active', state.view === view);
  });
  renderNav();
  if (state.view === 'library') renderLibrary();
  if (state.view === 'playbook') renderPlaybook();
  if (state.view === 'overview') renderOverview();
}

function render() {
  renderViews();
  renderOverview();
  renderLibrary();
  renderPlaybook();
  renderAccountBalance();
  updatePreview();
}

function renderDropdowns() {
  populateSelect('ticker', state.db.meta.tickers);
  populateSelect('setup-entry', state.db.meta.entrySetups);
  populateSelect('setup-exit', state.db.meta.exitSetups);
  populateSelect('emotion', state.db.meta.emotions);
}

function populateSelect(id, rows) {
  const current = getVal(id);
  els[id].innerHTML = rows.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  if (rows.includes(current)) els[id].value = current;
}

function renderQuickChips() {
  els['quick-tags'].innerHTML = state.db.meta.tagPresets.map(tag => `<button type="button" class="chip-btn" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('');
  els['quick-mistakes'].innerHTML = state.db.meta.mistakePresets.map(tag => `<button type="button" class="chip-btn" data-mistake="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');

  els['quick-tags'].querySelectorAll('button').forEach(btn => {
    btn.onclick = () => appendCsvValue('tags', btn.dataset.tag);
  });
  els['quick-mistakes'].querySelectorAll('button').forEach(btn => {
    btn.onclick = () => appendCsvValue('mistakes', btn.dataset.mistake);
  });
}

function manageList(key, label, casing = 'upper') {
  const arr = state.db.meta[key];
  const action = (prompt(`${label} 관리\n추가하려면 ADD, 삭제하려면 DEL 입력`) || '').trim().toUpperCase();
  if (!action) return;
  if (action === 'ADD') {
    const raw = prompt(`새 ${label}:`);
    if (!raw) return;
    const value = casing === 'upper' ? raw.trim().toUpperCase() : raw.trim().toLowerCase();
    if (!value) return;
    if (!arr.includes(value)) arr.push(value);
  }
  if (action === 'DEL') {
    const raw = prompt(`삭제할 ${label}:`);
    if (!raw) return;
    const value = casing === 'upper' ? raw.trim().toUpperCase() : raw.trim().toLowerCase();
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
  }
  saveDB(state.db);
  renderDropdowns();
  renderQuickChips();
}

function hydrateInitialForm() {
  setVal('trade-date', inputDate(new Date().toISOString()));
  setVal('account-size', Math.round(Number(state.db.meta.accountBalance || 10000)));
  setVal('desk-rules', state.db.meta.rules || '');
  state.draftEntries = [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = [];
  renderLegs('entry');
  renderLegs('exit');
  calcTotalBalance();
}

function restoreDraftIfPresent() {
  const draft = loadDraft();
  if (!draft?.trade) return;
  applyTradeToForm(draft.trade, { keepId: Boolean(draft.trade.id) });
  if (draft.savedAt) {
    setText('draft-saved-at', `Draft ${formatDateTime(draft.savedAt)} 저장`);
  }
}

function renderLegs(kind) {
  const key = kind === 'entry' ? 'draftEntries' : 'draftExits';
  const target = els[kind === 'entry' ? 'entries' : 'exits'];
  target.innerHTML = state[key].map((leg, index) => `
    <div class="leg-row" data-kind="${kind}" data-index="${index}">
      <input type="number" step="0.01" class="leg-price" value="${safeNumber(leg.price)}" placeholder="Price" />
      <select class="leg-type">
        <option value="M" ${leg.type === 'M' ? 'selected' : ''}>Maker</option>
        <option value="T" ${leg.type === 'T' ? 'selected' : ''}>Taker</option>
      </select>
      <input type="number" step="0.01" class="leg-weight" value="${safeNumber(leg.weight)}" placeholder="Weight %" />
      <button type="button" class="tool-btn leg-delete">삭제</button>
    </div>
  `).join('');

  target.querySelectorAll('.leg-row').forEach(row => {
    const index = Number(row.dataset.index);
    row.querySelector('.leg-price').addEventListener('input', event => updateLeg(kind, index, 'price', event.target.value));
    row.querySelector('.leg-type').addEventListener('change', event => updateLeg(kind, index, 'type', event.target.value));
    row.querySelector('.leg-weight').addEventListener('input', event => updateLeg(kind, index, 'weight', event.target.value));
    row.querySelector('.leg-delete').onclick = () => deleteLeg(kind, index);
  });
}

function updateLeg(kind, index, field, value) {
  const rows = kind === 'entry' ? state.draftEntries : state.draftExits;
  rows[index][field] = field === 'type' ? value : Number(value || 0);
  markDirty();
  updatePreview();
  persistDraft();
}

function deleteLeg(kind, index) {
  const rows = kind === 'entry' ? state.draftEntries : state.draftExits;
  rows.splice(index, 1);
  if (kind === 'entry' && !rows.length) rows.push({ price: 0, type: 'M', weight: 100 });
  renderLegs(kind);
  markDirty();
  updatePreview();
  persistDraft();
}

function resetForm() {
  if (state.dirty && !confirm('현재 편집 내용을 초기화하시겠습니까?')) return;
  clearDraft();
  state.selectedTradeId = null;
  state.dirty = false;

  [
    'trade-id','context','thesis','catalyst','invalidation-note','checklist','review','chart-entry','chart-exit','extra-evidence','tags','mistakes','live-notes',
    'mark-price','adjustment','stop-price','improvements'
  ].forEach(id => setVal(id, ''));

  setVal('trade-date', inputDate(new Date().toISOString()));
  setVal('status', 'OPEN');
  setVal('side', 'LONG');
  setVal('book', 'SCALP');
  setVal('market-regime', 'TREND');
  setVal('bias-timeframe', 'HTF_BULL');
  setVal('grade', 'B');
  setVal('playbook-score', 5);
  setVal('verdict', 'FOLLOWED_PLAN');
  setVal('account-size', Math.round(Number(state.db.meta.accountBalance || 10000)));
  setVal('risk-pct', 0.5);
  setVal('leverage', 5);
  setVal('maker-fee', 0.02);
  setVal('taker-fee', 0.05);
  setVal('stop-type', 'M');
  setVal('ticker', state.db.meta.tickers[0] || 'BTCUSDT');
  setVal('emotion', state.db.meta.emotions[0] || 'CALM');
  setVal('setup-entry', state.db.meta.entrySetups[0] || '');
  setVal('setup-exit', state.db.meta.exitSetups[0] || '');
  els['stop-moved'].checked = false;
  els['breakeven-moved'].checked = false;

  state.draftEntries = [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = [];
  renderLegs('entry');
  renderLegs('exit');
  updatePreview();
  refreshJournalStatus('새 폼 준비');
}

function duplicateTrade() {
  const trade = readForm();
  if (!trade) return;
  applyTradeToForm({ ...trade, id: '', date: new Date().toISOString() }, { keepId: false });
  refreshJournalStatus('복제본 편집 중');
}

function deleteTrade() {
  const id = getVal('trade-id');
  if (!id) return;
  if (!confirm('이 트레이드를 삭제하시겠습니까?')) return;
  state.db.trades = state.db.trades.filter(trade => trade.id !== id);
  saveDB(state.db);
  resetForm();
  render();
  refreshJournalStatus('트레이드 삭제 완료');
}

function readForm() {
  const trade = {
    id: getVal('trade-id') || crypto.randomUUID(),
    date: getVal('trade-date') ? new Date(getVal('trade-date')).toISOString() : new Date().toISOString(),
    ticker: getVal('ticker'),
    status: getVal('status'),
    side: getVal('side'),
    session: getVal('session'),
    book: getVal('book'),
    marketRegime: getVal('market-regime'),
    biasTimeframe: getVal('bias-timeframe'),
    setupEntry: getVal('setup-entry'),
    setupExit: getVal('setup-exit'),
    grade: getVal('grade'),
    playbookScore: Number(getVal('playbook-score') || 5),
    accountSize: Number(getVal('account-size') || 0),
    riskPct: Number(getVal('risk-pct') || 0),
    leverage: Number(getVal('leverage') || 0),
    makerFee: Number(getVal('maker-fee') || 0),
    takerFee: Number(getVal('taker-fee') || 0),
    stopPrice: Number(getVal('stop-price') || 0),
    markPrice: Number(getVal('mark-price') || 0),
    stopType: getVal('stop-type'),
    adjustment: Number(getVal('adjustment') || 0),
    stopMoved: els['stop-moved'].checked,
    breakevenMoved: els['breakeven-moved'].checked,
    context: getVal('context'),
    thesis: getVal('thesis'),
    catalyst: getVal('catalyst'),
    invalidationNote: getVal('invalidation-note'),
    checklist: splitCsv(getVal('checklist')),
    review: getVal('review'),
    liveNotes: getVal('live-notes'),
    emotion: getVal('emotion'),
    verdict: getVal('verdict'),
    tags: splitCsv(getVal('tags')),
    mistakes: splitCsv(getVal('mistakes')),
    improvements: splitCsv(getVal('improvements')),
    evidence: {
      entryChart: getVal('chart-entry'),
      exitChart: getVal('chart-exit'),
      extra: splitLines(getVal('extra-evidence')),
    },
    entries: cloneRows(state.draftEntries),
    exits: cloneRows(state.draftExits),
  };
  return normalizeTrade(trade);
}

function handleSubmit(event) {
  if (event) event.preventDefault();
  const trade = readForm();
  if (!trade.metrics.valid) {
    alert('손절가와 진입 비중(합계 100%)을 먼저 확인해 주세요.');
    return;
  }

  const existingIndex = state.db.trades.findIndex(row => row.id === trade.id);
  if (existingIndex >= 0) {
    state.db.trades[existingIndex] = trade;
  } else {
    state.db.trades.unshift(trade);
  }

  syncMetaFromTrade(trade);
  state.db.meta.rules = getVal('desk-rules');
  state.db.meta.accountBalance = Number(state.db.meta.accountBalance || trade.accountSize || 0);
  saveDB(state.db);
  clearDraft();
  state.selectedTradeId = trade.id;
  setVal('trade-id', trade.id);
  state.dirty = false;
  render();
  refreshJournalStatus('트레이드 저장 완료');
}

function syncMetaFromTrade(trade) {
  pushUnique(state.db.meta.tickers, trade.ticker);
  pushUnique(state.db.meta.entrySetups, trade.setupEntry);
  pushUnique(state.db.meta.exitSetups, trade.setupExit);
  pushUnique(state.db.meta.emotions, trade.emotion);
  trade.tags.forEach(tag => pushUnique(state.db.meta.tagPresets, tag));
  trade.mistakes.forEach(tag => pushUnique(state.db.meta.mistakePresets, tag));
  renderDropdowns();
  renderQuickChips();
}

function pushUnique(arr, value) {
  if (!value) return;
  if (!arr.includes(value)) arr.push(value);
}

function persistDraft(force = false) {
  clearTimeout(draftTimer);
  const run = () => {
    const trade = readForm();
    saveDraft({ trade });
    setText('draft-saved-at', `${formatDateTime(new Date())} 임시저장`);
  };
  if (force) return run();
  draftTimer = setTimeout(run, 350);
}

function applyTradeToForm(trade, options = {}) {
  setVal('trade-id', options.keepId === false ? '' : (trade.id || ''));
  setVal('trade-date', inputDate(trade.date));
  setVal('ticker', trade.ticker);
  setVal('status', trade.status);
  setVal('side', trade.side);
  setVal('session', trade.session);
  setVal('book', trade.book || 'INTRADAY');
  setVal('market-regime', trade.marketRegime || 'TREND');
  setVal('bias-timeframe', trade.biasTimeframe || 'NEUTRAL');
  setVal('setup-entry', trade.setupEntry);
  setVal('setup-exit', trade.setupExit);
  setVal('grade', trade.grade);
  setVal('playbook-score', trade.playbookScore);
  setVal('account-size', trade.accountSize);
  setVal('risk-pct', trade.riskPct);
  setVal('leverage', trade.leverage);
  setVal('maker-fee', trade.makerFee);
  setVal('taker-fee', trade.takerFee);
  setVal('stop-price', trade.stopPrice || '');
  setVal('mark-price', trade.markPrice || '');
  setVal('stop-type', trade.stopType);
  setVal('adjustment', trade.adjustment || 0);
  els['stop-moved'].checked = Boolean(trade.stopMoved);
  els['breakeven-moved'].checked = Boolean(trade.breakevenMoved);
  setVal('context', trade.context || '');
  setVal('thesis', trade.thesis || '');
  setVal('catalyst', trade.catalyst || '');
  setVal('invalidation-note', trade.invalidationNote || '');
  setVal('checklist', (trade.checklist || []).join(', '));
  setVal('review', trade.review || '');
  setVal('live-notes', trade.liveNotes || '');
  setVal('emotion', trade.emotion || '');
  setVal('verdict', trade.verdict || 'NEUTRAL');
  setVal('tags', (trade.tags || []).join(', '));
  setVal('mistakes', (trade.mistakes || []).join(', '));
  setVal('improvements', (trade.improvements || []).join(', '));
  setVal('chart-entry', trade.evidence?.entryChart || '');
  setVal('chart-exit', trade.evidence?.exitChart || '');
  setVal('extra-evidence', (trade.evidence?.extra || []).join('\n'));
  state.draftEntries = cloneRows(trade.entries || [{ price: 0, type: 'M', weight: 100 }]);
  state.draftExits = cloneRows(trade.exits || []);
  renderLegs('entry');
  renderLegs('exit');
  updatePreview();
}

function updatePreview() {
  const trade = readForm();
  const metrics = trade.metrics;
  renderCalcSummary(metrics, trade);
  renderRiskPanel(metrics);
  setText('deep-review-r', `${metrics.r.toFixed(2)}R`);
  const playbookCandidate = trade.grade === 'A' && trade.playbookScore >= 8 && trade.mistakes.length === 0;
  els['playbook-indicator'].classList.toggle('hidden', !playbookCandidate);
}

function renderCalcSummary(metrics, trade) {
  if (!metrics.valid) {
    setHtml('calc-summary', `
      <div class="summary-invalid" style="color:var(--muted); font-weight:600;">
        손절가, 진입 가격, 진입 비중(합계 100%)을 확인해 주세요.
        ${metrics.directionError ? '<div class="warn-text" style="color:var(--red); margin-top:8px;">방향과 손절 위치가 충돌합니다.</div>' : ''}
      </div>
    `);
    return;
  }

  const summaryRows = [
    ['Avg Entry', money(metrics.avgEntry)],
    ['Avg Exit', metrics.avgExit ? money(metrics.avgExit) : '—'],
    ['Qty', qty(metrics.qty)],
    ['Realized', money(metrics.realizedPnl), metrics.realizedPnl],
    ['Unrealized', money(metrics.unrealizedPnl), metrics.unrealizedPnl],
    ['Net PnL', money(metrics.pnl), metrics.pnl],
    ['R Multiple', `${metrics.r.toFixed(2)}R`, metrics.r],
    ['Exit %', `${metrics.exitPct.toFixed(1)}%`],
    ['Remaining %', `${metrics.remainingPct.toFixed(1)}%`],
    ['Residual Risk', money(metrics.residualRisk)],
    ['Fee Drag', `${metrics.feePctOfGross.toFixed(1)}%`],
    ['Setup', `${trade.session} · ${trade.setupEntry || 'NA'}`],
  ];

  setHtml('calc-summary', `
    <div class="summary-grid">
      ${summaryRows.map(([label, value, signed]) => `
        <div class="summary-item">
          <div class="summary-label">${escapeHtml(label)}</div>
          <div class="summary-value ${signed > 0 ? 'positive' : signed < 0 ? 'negative' : ''}">${escapeHtml(String(value))}</div>
        </div>
      `).join('')}
    </div>
  `);
}

function renderRiskPanel(metrics) {
  setText('risk-risk-dollar', money(metrics.riskDollar));
  setText('risk-qty', qty(metrics.qty));
  setText('risk-margin', money(metrics.margin));
  setText('risk-slider', `${metrics.sliderPct.toFixed(1)}%`);
  setText('risk-notional', money(metrics.notional));
  setText('risk-stop-distance', `${metrics.stopDistancePct.toFixed(2)}%`);
  setText('risk-fees', money(metrics.totalFees));
  setText('risk-realized', money(metrics.realizedPnl));
  setText('risk-unrealized', money(metrics.unrealizedPnl));
  setText('risk-residual', money(metrics.residualRisk));
}

function renderOverview() {
  const trades = getOverviewTrades();
  const stats = summarize(trades);
  const setups = groupAverageR(stats.closed, trade => trade.setupEntry);
  const mistakes = tagStats(stats.closed, trade => trade.mistakes);

  const metrics = [
    metricCard('Net PnL', money(stats.net), stats.net),
    metricCard('Win Rate', `${stats.winRate.toFixed(1)}%`),
    metricCard('Avg R', `${stats.avgR.toFixed(2)}R`, stats.avgR),
    metricCard('Profit Factor', stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)),
    metricCard('Max Drawdown', money(stats.maxDD), -stats.maxDD),
    metricCard('Fee Drag', money(stats.fees), -stats.fees),
  ];
  setHtml('metrics', metrics.join(''));

  renderStackStats('mistake-list', mistakes.slice(0, 6), row => `${row.count}건 · AvgR ${row.avgR.toFixed(2)}`);

  const notes = [];
  if (stats.closed.length) {
    notes.push(noteCard('실행 품질', `Closed ${stats.closed.length}건 기준 평균 R은 ${stats.avgR.toFixed(2)}R, Profit Factor는 ${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}입니다.`));
    notes.push(noteCard('리스크 누수', `Win Rate ${stats.winRate.toFixed(1)}%, Max Drawdown ${money(stats.maxDD)}, Fee Drag ${money(stats.fees)}.`));
  }
  if (setups.length) {
    notes.push(noteCard('강한 셋업', setups.slice(0, 3).map(row => `${row.label} (${row.value.toFixed(2)}R)`).join(' / ')));
  }
  if (mistakes.length) {
    notes.push(noteCard('손실 유발 실수', mistakes.slice(0, 3).map(row => `${row.label} ${money(row.totalPnl)}`).join(' / ')));
  }
  setHtml('research-notes', notes.length ? notes.join('') : emptyState('데이터가 축적되면 인사이트가 나타납니다.'));

  renderCalendar();
  renderEquityChart(stats.closed);
  renderSetupChart(setups.slice(0, 8));
  renderOverviewPortfolio();
}


function renderStackStats(id, rows, formatter) {
  setHtml(id, rows.length ? rows.map(row => `
    <div class="list-row">
      <div>
        <div class="list-title">${escapeHtml(row.label)}</div>
        <div class="list-sub">${escapeHtml(formatter(row))}</div>
      </div>
      <div class="list-right ${row.totalPnl > 0 || row.avgR > 0 ? 'positive' : row.totalPnl < 0 || row.avgR < 0 ? 'negative' : ''}">
        ${row.totalPnl !== undefined ? escapeHtml(money(row.totalPnl)) : ''}
      </div>
    </div>
  `).join('') : emptyState('표시할 데이터가 없습니다.'));
}

// ✨ 캘린더 온클릭 시 Library 점프 기능 연동 반영
function renderCalendar() {
  const trades = getOverviewTrades();
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  setText('calendar-title', `${year}-${String(month + 1).padStart(2, '0')}`);

  const map = new Map();
  trades.forEach(trade => {
    const date = new Date(trade.date);
    if (date.getFullYear() !== year || date.getMonth() !== month) return;
    const key = date.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + trade.metrics.pnl);
  });

  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push('<div class="day muted"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = new Date(year, month, day).toISOString().slice(0, 10);
    const pnl = map.get(key) || 0;
    cells.push(`
      <div class="day ${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : ''}" onclick="window.__desk_jump_date('${key}')" title="${key} 매매기록 보기">
        <div class="num">${day}</div>
        <div class="pnl ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : ''}">${pnl ? moneyCompact(pnl) : ''}</div>
      </div>
    `);
  }

  setHtml('calendar', `
    <div class="calendar-head">
      <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
    </div>
    <div class="calendar-grid">${cells.join('')}</div>
  `);
}

function renderEquityChart(trades) {
  if (!trades.length) {
    setHtml('equity-chart', emptyState('표시할 데이터가 없습니다.'));
    return;
  }

  const rows = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let equity = 0;
  const points = rows.map((trade, idx) => {
    equity += trade.metrics.pnl;
    return { x: idx, y: equity };
  });
  const yValues = points.map(p => p.y);
  const minY = Math.min(0, ...yValues);
  const maxY = Math.max(0, ...yValues);
  const width = 780;
  const height = 280;
  const pad = 32;
  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const scaleY = value => {
    if (maxY === minY) return height / 2;
    return height - pad - ((value - minY) / (maxY - minY)) * (height - pad * 2);
  };
  const d = points.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${pad + point.x * xStep} ${scaleY(point.y)}`).join(' ');
  const area = `${d} L ${pad + (points.length - 1) * xStep} ${height - pad} L ${pad} ${height - pad} Z`;

  setHtml('equity-chart', `
    <svg viewBox="0 0 ${width} ${height}" aria-label="equity curve">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="grid-line" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="grid-line" />
      <path d="${area}" class="area"></path>
      <path d="${d}" class="line"></path>
    </svg>
  `);
}

function renderSetupChart(rows) {
  if (!rows.length) {
    setHtml('setup-chart', emptyState('표시할 데이터가 없습니다.'));
    return;
  }
  const width = 780;
  const rowHeight = 28;
  const gap = 12;
  const height = rows.length * (rowHeight + gap) + 20;
  const max = Math.max(...rows.map(row => Math.abs(row.value)), 1);

  setHtml('setup-chart', `
    <svg viewBox="0 0 ${width} ${height}">
      ${rows.map((row, idx) => {
        const y = idx * (rowHeight + gap) + 10;
        const barWidth = (Math.abs(row.value) / max) * 420;
        return `
          <text x="0" y="${y + 18}" class="axis">${escapeHtml(row.label)} (${row.count})</text>
          <rect x="280" y="${y}" width="${barWidth}" height="${rowHeight}" class="${row.value >= 0 ? 'bar-pos' : 'bar-neg'}" rx="8"></rect>
          <text x="${290 + barWidth}" y="${y + 18}" class="axis">${row.value.toFixed(2)}R</text>
        `;
      }).join('')}
    </svg>
  `);
}

function renderOverviewPortfolio() {
  const history = state.db.meta.balanceHistory || [];
  if (!history.length) {
    setHtml('overview-portfolio', emptyState('잔고 히스토리가 없습니다.'));
    return;
  }
  const latest = history[0];
  const prev = history[1];
  const diff = prev ? latest.val - prev.val : 0;

  setHtml('overview-portfolio', `
    <div class="portfolio-summary" style="display:flex; flex-direction:column; gap:16px;">
      <div style="background: linear-gradient(135deg, #f1f5f9 0%, #ffffff 100%); border:1px solid var(--line); border-radius:16px; padding:20px;">
        <span style="color:var(--muted); font-weight:700; font-size:12px; display:block; margin-bottom:4px;">TOTAL PORTFOLIO</span>
        <strong style="font-size:32px; font-weight:900; letter-spacing:-1px; color:#0f172a;">${money(latest.val)}</strong>
        <small class="${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}" style="display:block; margin-top:4px; font-weight:600;">
          ${prev ? `${diff >= 0 ? '+' : ''}${money(diff)} vs prev` : '첫 스냅샷'}
        </small>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        ${portfolioItem('💵 Cash', latest.cash)}
        ${portfolioItem('🪙 Crypto', latest.crypto)}
        ${portfolioItem('₮ USDT', latest.usdt)}
        ${portfolioItem('📈 Stock', latest.stock)}
      </div>
    </div>
  `);
}

function renderAccountBalance() {
  const history = state.db.meta.balanceHistory || [];
  const latest = history[0] || {
    cash: 0,
    crypto: 0,
    usdt: 0,
    stock: 0,
    val: Number(state.db.meta.accountBalance || 0),
  };
  setVal('bal-cash', latest.cash || 0);
  setVal('bal-crypto', latest.crypto || 0);
  setVal('bal-usdt', latest.usdt || 0);
  setVal('bal-stock', latest.stock || 0);
  calcTotalBalance();
  setVal('desk-rules', state.db.meta.rules || '');

  setHtml('balance-history', history.length ? history.slice(0, 10).map(row => `
    <div style="padding:12px; border:1px solid var(--line); border-radius:12px; margin-bottom:8px; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <strong style="font-size:14px; color:#0f172a;">${money(row.val)}</strong>
        <span style="color:var(--muted); font-size:11px;">${formatDateTime(row.date)}</span>
      </div>
      ${row.memo ? `<div style="font-size:11px; color:#475569; background:#f1f5f9; padding:4px 8px; border-radius:6px; display:inline-block;">${escapeHtml(row.memo)}</div>` : ''}
    </div>
  `).join('') : emptyState('잔고 히스토리가 없습니다.'));
}

function calcTotalBalance() {
  const total = ['bal-cash','bal-crypto','bal-usdt','bal-stock']
    .reduce((sum, id) => sum + Number(els[id].value || 0), 0);
  setText('bal-total', money(total));
  return total;
}

function updateBalance() {
  const cash = round(Number(getVal('bal-cash') || 0));
  const crypto = round(Number(getVal('bal-crypto') || 0));
  const usdt = round(Number(getVal('bal-usdt') || 0));
  const stock = round(Number(getVal('bal-stock') || 0));
  const memo = getVal('balance-memo').trim();
  const total = cash + crypto + usdt + stock;

  if (total <= 0) {
    alert('총 자산은 0보다 커야 합니다.');
    return;
  }

  state.db.meta.accountBalance = total;
  state.db.meta.balanceHistory.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    val: total,
    cash,
    crypto,
    usdt,
    stock,
    memo,
  });
  setVal('balance-memo', '');
  if (!getVal('trade-id')) setVal('account-size', total);
  saveDB(state.db);
  renderAccountBalance();
  renderOverviewPortfolio();
  updatePreview();
}

function getOverviewTrades() {
  return filterTradesByDate(state.db.trades, getVal('overview-from'), getVal('overview-to'));
}

function renderLibrary() {
  const rows = filterLibraryTrades();
  state.filteredTrades = rows;
  setText('library-result-count', `${rows.length}개 결과`);

  if (!state.selectedTradeId && rows.length) state.selectedTradeId = rows[0].id;
  if (state.selectedTradeId && !rows.some(row => row.id === state.selectedTradeId)) {
    state.selectedTradeId = rows[0]?.id || null;
  }

  setHtml('trade-table', rows.length ? rows.map(trade => `
    <tr data-id="${trade.id}" class="${trade.id === state.selectedTradeId ? 'selected-row' : ''}">
      <td>${formatDateTime(trade.date)}</td>
      <td>${trade.status === 'OPEN' ? '<span class="badge-open">OPEN</span>' : '<span class="badge-closed">CLOSED</span>'}</td>
      <td style="font-weight:700; color:#0f172a;">${escapeHtml(trade.ticker)}</td>
      <td>${escapeHtml(trade.side)}</td>
      <td>${escapeHtml(trade.session)}</td>
      <td>${escapeHtml(trade.setupEntry || '—')}</td>
      <td class="mono">${trade.metrics.avgEntry ? money(trade.metrics.avgEntry) : '—'}</td>
      <td class="mono">${trade.metrics.avgExit ? money(trade.metrics.avgExit) : '—'}</td>
      <td class="mono ${trade.metrics.pnl > 0 ? 'positive' : trade.metrics.pnl < 0 ? 'negative' : ''}">${money(trade.metrics.pnl)}</td>
      <td class="mono ${trade.metrics.r > 0 ? 'positive' : trade.metrics.r < 0 ? 'negative' : ''}">${trade.metrics.r.toFixed(2)}R</td>
      <td><span class="badge ${trade.playbookScore >= 8 ? 'badge-good' : ''}">${trade.playbookScore}</span></td>
      <td>${(trade.tags || []).slice(0, 3).map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join(' ')}</td>
    </tr>
  `).join('') : `<tr><td colspan="12">${emptyState('검색 결과가 없습니다.')}</td></tr>`);

  els['trade-table'].querySelectorAll('tr[data-id]').forEach(row => {
    row.onclick = () => selectTrade(row.dataset.id);
  });

  const selected = rows.find(row => row.id === state.selectedTradeId);
  const index = selected ? rows.findIndex(row => row.id === selected.id) : -1;
  setText('review-position', rows.length ? `${index + 1} / ${rows.length}` : '0 / 0');
  setText('review-breadcrumb', selected ? `${selected.ticker} · ${selected.setupEntry || 'NA'} · Grade ${selected.grade}` : '선택 없음');

  renderTradeDetail(selected || null);
  renderDetailInsights(selected || null, rows);
}

function filterLibraryTrades() {
  const q = getVal('q').trim().toLowerCase();
  const from = getVal('f-from');
  const to = getVal('f-to');
  const status = getVal('f-status');
  const side = getVal('f-side');
  const session = getVal('f-session');
  const setup = getVal('f-setup').trim().toLowerCase();
  const emotion = getVal('f-emotion').trim().toLowerCase();
  const tag = getVal('f-tag').trim().toLowerCase();
  const mistake = getVal('f-mistake').trim().toLowerCase();
  const grade = getVal('f-grade');
  const minScore = Number(getVal('f-playbook-min') || 0);
  const sort = getVal('sort');

  let rows = [...state.db.trades];
  rows = filterTradesByDate(rows, from, to);
  rows = rows.filter(trade => {
    if (status !== 'ALL' && trade.status !== status) return false;
    if (side !== 'ALL' && trade.side !== side) return false;
    if (session !== 'ALL' && trade.session !== session) return false;
    if (grade !== 'ALL' && trade.grade !== grade) return false;
    if (trade.playbookScore < minScore) return false;
    if (setup && !(trade.setupEntry || '').toLowerCase().includes(setup)) return false;
    if (emotion && !(trade.emotion || '').toLowerCase().includes(emotion)) return false;
    if (tag && !(trade.tags || []).some(value => value.includes(tag))) return false;
    if (mistake && !(trade.mistakes || []).some(value => value.includes(mistake))) return false;
    if (q) {
      const haystack = [
        trade.ticker, trade.setupEntry, trade.setupExit, trade.context, trade.thesis, trade.review,
        trade.liveNotes, trade.session, trade.book, trade.marketRegime, trade.biasTimeframe,
        ...(trade.tags || []), ...(trade.mistakes || []), ...(trade.checklist || []), ...(trade.improvements || [])
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    if (sort === 'oldest') return new Date(a.date) - new Date(b.date);
    if (sort === 'bestR') return b.metrics.r - a.metrics.r;
    if (sort === 'worstR') return a.metrics.r - b.metrics.r;
    if (sort === 'bestScore') return b.playbookScore - a.playbookScore || b.metrics.r - a.metrics.r;
    return new Date(b.date) - new Date(a.date);
  });

  return rows;
}

function renderTradeDetail(trade) {
  if (!trade) {
    setHtml('detail', emptyState('트레이드를 선택해 주세요.'));
    return;
  }

  setHtml('detail', `
    <div class="detail-actions">
      <button type="button" class="tool-btn" id="load-selected-into-journal">Journal로 불러오기</button>
    </div>
    <div class="kv">
      <div>티커</div><div><strong>${escapeHtml(trade.ticker)}</strong> · ${escapeHtml(trade.side)} · ${escapeHtml(trade.status)}</div>
      <div>세션</div><div>${escapeHtml(trade.session)}</div>
      <div>Setup</div><div>${escapeHtml(trade.setupEntry || '—')} → ${escapeHtml(trade.setupExit || '—')}</div>
      <div>Grade / Score</div><div>${escapeHtml(trade.grade)} / ${trade.playbookScore}</div>
      <div>Avg In / Avg Out</div><div class="mono">${money(trade.metrics.avgEntry)} / ${trade.metrics.avgExit ? money(trade.metrics.avgExit) : '—'}</div>
      <div>PnL / R</div><div class="mono ${trade.metrics.pnl > 0 ? 'positive' : trade.metrics.pnl < 0 ? 'negative' : ''}">${money(trade.metrics.pnl)} / ${trade.metrics.r.toFixed(2)}R</div>
      <div>Real/Unrealized</div><div class="mono">${money(trade.metrics.realizedPnl)} / ${money(trade.metrics.unrealizedPnl)}</div>
      <div>Residual Risk</div><div class="mono">${money(trade.metrics.residualRisk)} (${trade.metrics.remainingPct.toFixed(1)}% remaining)</div>
      <div>Emotion</div><div>${escapeHtml(trade.emotion || '—')}</div>
    </div>

    <div style="margin-top:24px; padding:20px; background:#f8fafc; border:1px solid var(--line); border-radius:16px;">
      <h4 style="margin:0 0 12px; font-size:13px; color:var(--muted); text-transform:uppercase;">Execution Ladder</h4>
      <div style="display:flex; justify-content:space-between; align-items:center; position:relative; padding-bottom:10px;">
        <div style="position:absolute; top:20px; left:10%; right:10%; height:2px; background:var(--line); z-index:1;"></div>
        ${renderTimeline('entry', trade.entries)}
        ${renderTimeline('exit', trade.exits)}
      </div>
    </div>

    <div style="margin-top:24px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Pre-trade</h4>
      <p style="margin:0 0 8px;"><strong>Context:</strong> ${escapeHtml(trade.context || '—')}</p>
      <p style="margin:0;"><strong>Thesis:</strong> ${escapeHtml(trade.thesis || '—')}</p>
    </div>

    <div style="margin-top:24px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Review</h4>
      <p style="margin:0 0 12px;">${escapeHtml(trade.review || '—')}</p>
      <strong style="font-size:13px;">Live Notes:</strong>
      <div style="margin-top:8px; padding:16px; background:#f1f5f9; border-radius:12px; font-family:monospace; font-size:12px; white-space:pre-wrap; color:#334155;">${escapeHtml(trade.liveNotes || '—')}</div>
      <div class="chips" style="margin-top:12px;">${(trade.tags || []).map(tag => `<span class="chip">#${escapeHtml(tag)}</span>`).join(' ') || '<span class="chip">태그 없음</span>'}</div>
      <div class="chips">${(trade.mistakes || []).map(tag => `<span class="chip danger-chip">${escapeHtml(tag)}</span>`).join(' ') || '<span class="chip">실수 없음</span>'}</div>
    </div>

    <div style="margin-top:24px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Evidence</h4>
      <div style="display:flex; gap:8px;">
        ${trade.evidence?.entryChart ? `<a href="${escapeAttr(trade.evidence.entryChart)}" target="_blank" style="padding:8px 16px; background:#e0e7ff; color:var(--accent); border-radius:8px; text-decoration:none; font-weight:700; font-size:12px;">Entry Chart 📈</a>` : ''}
        ${trade.evidence?.exitChart ? `<a href="${escapeAttr(trade.evidence.exitChart)}" target="_blank" style="padding:8px 16px; background:#e0e7ff; color:var(--accent); border-radius:8px; text-decoration:none; font-weight:700; font-size:12px;">Exit Chart 📈</a>` : ''}
      </div>
    </div>
  `);

  document.getElementById('load-selected-into-journal').onclick = () => openSelectedInJournal(trade.id);
}

function renderTimeline(type, rows) {
  if (!rows.length) return `
    <div style="position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:8px; flex:1;">
      <div style="width:16px; height:16px; border-radius:50%; background:#fff; border:3px solid var(--line);"></div>
      <div style="font-size:11px; color:var(--muted); font-weight:700;">${type.toUpperCase()}</div>
      <div class="mono" style="font-size:12px;">—</div>
    </div>
  `;
  const color = type === 'entry' ? 'var(--accent)' : 'var(--yellow)';
  return rows.map((row, idx) => `
    <div style="position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:8px; flex:1;">
      <div style="width:16px; height:16px; border-radius:50%; background:${color}; border:3px solid #fff; box-shadow:0 0 0 2px ${color};"></div>
      <div style="font-size:11px; color:var(--muted); font-weight:700; margin-top:4px;">${type.toUpperCase()} ${idx + 1}</div>
      <div class="mono" style="font-size:12px; font-weight:700; color:#0f172a;">${safeNumber(row.price)} / ${safeNumber(row.weight)}%</div>
    </div>
  `).join('');
}

function renderDetailInsights(trade, rows) {
  if (!trade) {
    setHtml('detail-insights', emptyState('트레이드를 선택해 주세요.'));
    return;
  }

  const similar = rows.filter(row => row.id !== trade.id && (row.setupEntry === trade.setupEntry || row.ticker === trade.ticker)).slice(0, 5);
  const sameSetup = state.db.trades.filter(row => row.setupEntry === trade.setupEntry);
  const sameTicker = state.db.trades.filter(row => row.ticker === trade.ticker);
  const setupStats = summarize(sameSetup);
  const tickerStats = summarize(sameTicker);

  setHtml('detail-insights', `
    ${noteCard('같은 셋업 통계', `${trade.setupEntry || 'NA'} · ${sameSetup.length}건 · AvgR ${setupStats.avgR.toFixed(2)}R · Win ${setupStats.winRate.toFixed(1)}%`)}
    ${noteCard('같은 종목 통계', `${trade.ticker} · ${sameTicker.length}건 · AvgR ${tickerStats.avgR.toFixed(2)}R · Net ${money(tickerStats.net)}`)}
    <div class="similar-list" style="margin-top:16px;">
      <h4 style="margin:0 0 12px; font-size:14px;">유사 샘플 (최근 5건)</h4>
      ${similar.length ? similar.map(row => `
        <div class="similar-item" data-id="${row.id}" style="padding:12px 16px; border:1px solid var(--line); border-radius:12px; margin-bottom:8px; cursor:pointer;">
          <strong style="color:#0f172a;">${escapeHtml(row.ticker)} · ${escapeHtml(row.setupEntry || 'NA')}</strong>
          <div style="font-size:12px; color:var(--muted); margin-top:4px;">${formatDate(row.date)} · <span class="${row.metrics.r > 0 ? 'positive' : 'negative'}">${row.metrics.r.toFixed(2)}R</span> · Score ${row.playbookScore}</div>
        </div>
      `).join('') : emptyState('유사 샘플이 아직 없습니다.')}
    </div>
  `);

  els['detail-insights'].querySelectorAll('.similar-item').forEach(item => {
    item.onclick = () => selectTrade(item.dataset.id);
  });
}

function renderPlaybook() {
  const rows = [...state.db.trades]
    .filter(trade => trade.grade === 'A' && trade.playbookScore >= 8 && !(trade.mistakes || []).length)
    .sort((a, b) => b.playbookScore - a.playbookScore || b.metrics.r - a.metrics.r);

  setHtml('playbook-gallery', rows.length ? rows.map(trade => `
    <article class="playbook-card" data-id="${trade.id}">
      ${trade.evidence?.entryChart ? `<img class="playbook-img" src="${escapeAttr(trade.evidence.entryChart)}" alt="entry chart" onerror="this.style.display='none'">` : `<div class="playbook-img" style="display:grid; place-items:center; color:var(--muted); font-weight:600; font-size:12px;">NO IMAGE</div>`}
      <div class="playbook-info">
        <div class="playbook-header">
          <strong style="font-size:16px; color:#0f172a;">${escapeHtml(trade.ticker)}</strong>
          <span class="badge badge-good" style="font-size:12px;">★ ${trade.playbookScore}/10</span>
        </div>
        <div style="font-size:12px; color:var(--accent); font-weight:700;">${escapeHtml(trade.setupEntry || 'NA')}</div>
        <div style="font-size:11px; color:var(--muted);">${formatDateTime(trade.date)} · ${trade.session}</div>
        <div class="mono ${trade.metrics.r > 0 ? 'positive' : 'negative'}" style="font-size:14px; font-weight:800; margin-top:4px;">${trade.metrics.r.toFixed(2)}R (${money(trade.metrics.pnl)})</div>
        <p style="font-size:12px; color:#475569; margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(trade.thesis || trade.review || '설명 없음')}</p>
        <div class="chips" style="margin-top:auto;">${(trade.tags || []).slice(0, 3).map(item => `<span class="chip">#${escapeHtml(item)}</span>`).join('') || '<span class="chip">태그 없음</span>'}</div>
      </div>
    </article>
  `).join('') : emptyState('조건을 만족하는 A급 Playbook 샘플이 없습니다.'));

  els['playbook-gallery'].querySelectorAll('.playbook-card').forEach(card => {
    card.onclick = () => {
      selectTrade(card.dataset.id);
      state.view = 'library';
      renderViews();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });
}

function selectTrade(id) {
  state.selectedTradeId = id;
  renderLibrary();
}

function stepSelectedTrade(direction) {
  if (!state.filteredTrades.length) return;
  const index = state.filteredTrades.findIndex(row => row.id === state.selectedTradeId);
  const nextIndex = index < 0 ? 0 : clamp(index + direction, 0, state.filteredTrades.length - 1);
  state.selectedTradeId = state.filteredTrades[nextIndex].id;
  renderLibrary();
}

function openSelectedInJournal(id = state.selectedTradeId) {
  const trade = state.db.trades.find(row => row.id === id);
  if (!trade) return;
  applyTradeToForm(trade);
  state.selectedTradeId = trade.id;
  state.view = 'journal';
  renderViews();
  refreshJournalStatus('선택 트레이드 로드 완료');
}

function filterBySelectedSetup() {
  const trade = state.db.trades.find(row => row.id === state.selectedTradeId);
  if (!trade) return;
  setVal('f-setup', trade.setupEntry);
  renderLibrary();
}

function filterBySelectedTicker() {
  const trade = state.db.trades.find(row => row.id === state.selectedTradeId);
  if (!trade) return;
  setVal('q', trade.ticker);
  renderLibrary();
}

function clearQuickFilter() {
  setVal('f-setup', '');
  setVal('q', '');
  renderLibrary();
}

function clearFilters() {
  ['q','f-from','f-to','f-setup','f-emotion','f-tag','f-mistake'].forEach(id => setVal(id, ''));
  setVal('f-status', 'ALL');
  setVal('f-side', 'ALL');
  setVal('f-session', 'ALL');
  setVal('f-grade', 'ALL');
  setVal('f-playbook-min', 0);
  setVal('sort', 'newest');
  renderLibrary();
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseImport(String(reader.result));
      state.db = imported;
      saveDB(state.db);
      initMeta();
      resetForm();
      render();
      refreshJournalStatus('데이터 복원 완료');
    } catch (error) {
      console.error(error);
      alert('JSON 복원에 실패했습니다.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function insertLiveNote(prefix) {
  const current = getVal('live-notes');
  const stamp = `[${nowStamp()}] `;
  setVal('live-notes', `${current}${current && !current.endsWith('\n') ? '\n' : ''}${stamp}${prefix}`);
  markDirty();
  updatePreview();
  persistDraft();
}

function appendCsvValue(id, value) {
  const values = splitCsv(getVal(id));
  if (!values.includes(value)) values.push(value);
  setVal(id, values.join(', '));
  handleFormMutation();
}

function markDirty() {
  state.dirty = true;
  refreshJournalStatus('편집 중');
}

function refreshJournalStatus(message) {
  setText('journal-status', message);
}

function statLine(label, value, signed) {
  return `
    <div class="list-row">
      <div class="list-title">${escapeHtml(label)}</div>
      <div class="list-right ${signed > 0 ? 'positive' : signed < 0 ? 'negative' : ''}">${escapeHtml(value)}</div>
    </div>
  `;
}

function noteCard(title, body) {
  return `
    <div class="note-card">
      <strong style="color:#0f172a; font-size:14px; display:block; margin-bottom:6px;">${escapeHtml(title)}</strong>
      <p style="margin:0; color:#475569;">${escapeHtml(body)}</p>
    </div>
  `;
}

function metricCard(label, value, signed) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${signed > 0 ? 'positive' : signed < 0 ? 'negative' : ''}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function portfolioItem(label, value) {
  return `
    <div style="background:#f8fafc; border:1px solid var(--line); border-radius:12px; padding:12px;">
      <div style="font-size:12px; color:var(--muted); font-weight:700; margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="font-size:16px; font-weight:800; color:#0f172a;">${money(value)}</div>
    </div>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function splitCsv(value) {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function splitLines(value) {
  return String(value || '').split('\n').map(v => v.trim()).filter(Boolean);
}

function cloneRows(rows) {
  return (rows || []).map(row => ({
    price: Number(row.price || 0),
    type: row.type === 'T' ? 'T' : 'M',
    weight: Number(row.weight || 0),
  }));
}

function qty(value) {
  return Number(value || 0).toFixed(5);
}

function money(value) {
  const num = Number(value || 0);
  const sign = num > 0 ? '+' : '';
  return `${sign}$${num.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function moneyCompact(value) {
  const num = Number(value || 0);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}`;
}

function safeNumber(value) {
  return Number(value || 0).toString();
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('ko-KR');
}

function formatDateTime(date) {
  const d = new Date(date);
  return `${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
}

function inputDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function nowStamp() {
  const d = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getVal(id) {
  return els[id]?.value ?? '';
}

function setVal(id, value) {
  if (els[id]) els[id].value = value;
}

function setHtml(id, html) {
  if (els[id]) els[id].innerHTML = html;
}

function setText(id, text) {
  if (els[id]) els[id].textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value);
}
