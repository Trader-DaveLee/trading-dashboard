import { recalcTrade } from './calc.js';
import {
  summarize, groupAverageR, tagStats, filterTradesByDate
} from './analytics.js';
import {
  loadDB, saveDB, exportDB, parseImport, normalizeTrade,
  loadDraft, saveDraft, clearDraft
} from './storage.js';

const state = {
  db: loadDB(),
  view: 'overview',
  month: new Date(),
  selectedTradeId: null,
  filteredTrades: [],
  draftEntries: [{ price: 0, type: 'M', weight: 100 }],
  draftExits: [],
  draftLiveCharts: [],
  dirty: false,
};

const views = ['overview', 'journal', 'library', 'playbook'];
const els = {};
let draftTimer = null;

const ID_LIST = [
  'nav','force-save-draft','export-json','import-json-btn','import-json','journal-status','draft-saved-at',
  'view-overview','metrics','overview-from','overview-to','overview-clear','prev-month','calendar-title','next-month','calendar','equity-chart','balance-chart','setup-chart','mistake-list','research-notes','overview-portfolio',
  'today-console','eod-memo',
  'view-journal','trade-form','trade-id','trade-date','btn-now','ticker','btn-manage-ticker','status','session','side','setup-entry','btn-manage-setup-entry','setup-exit','btn-manage-setup-exit',
  'account-size','risk-pct','leverage','maker-fee','taker-fee','stop-price','mark-price','stop-type','adjustment',
  'context','thesis','review','chart-entry','chart-exit','tags','mistakes',
  'add-entry','entries','add-exit','exits','calc-summary','quick-tags','quick-mistakes','live-notes','btn-insert-time','add-live-chart','live-charts-container',
  'bal-cash','bal-crypto','bal-usdt','bal-stock','bal-total','balance-type','balance-memo','btn-update-balance','balance-history',
  'duplicate-trade','reset-form','delete-trade','grade','deep-review-r',
  'desk-rules','master-checklist-list','new-check-input','btn-add-check','trade-checklist-container',
  'risk-risk-dollar','risk-qty','risk-margin','risk-slider','risk-notional','risk-stop-distance','risk-fees','risk-realized','risk-unrealized','risk-residual',
  'view-library','q','f-from','f-to','f-status','f-side','f-session','f-setup','f-tag','f-mistake','f-grade','sort','clear-filters','library-result-count','review-position','review-breadcrumb','prev-trade','next-trade','filter-same-setup','filter-same-ticker','clear-quick-filter','trade-table','detail','detail-insights',
  'view-playbook','playbook-gallery',
  'app-modal','modal-title','modal-desc','modal-input','modal-btn-cancel','modal-btn-confirm'
];

window.__desk = {
  selectTrade: id => selectTrade(id),
  applySameSetupFilter: () => filterBySelectedSetup(),
  applySameTickerFilter: () => filterBySelectedTicker(),
};

window.__desk_jump_date = (dateString) => {
  setVal('f-from', dateString);
  setVal('f-to', dateString);
  state.view = 'library';
  renderViews();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.__desk_del_balance = (id) => {
  showModal({ type: 'CONFIRM', title: '잔고 내역 삭제', desc: '이 잔고 기록을 삭제하시겠습니까?' }, (res) => {
    if(!res) return;
    state.db.meta.balanceHistory = state.db.meta.balanceHistory.filter(h => h.id !== id);
    if (state.db.meta.balanceHistory.length > 0) {
      state.db.meta.accountBalance = state.db.meta.balanceHistory[0].val;
    } else {
      state.db.meta.accountBalance = 10000;
    }
    saveDB(state.db);
    renderAccountBalance();
    renderOverviewPortfolio();
    if (state.view === 'overview') renderOverview();
    updatePreview();
  });
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

// ✨ 커스텀 모달 기능
let modalCallback = null;
function showModal({ type, title, desc, placeholder, val }, callback) {
  modalCallback = callback;
  if(!els['app-modal']) return;
  els['app-modal'].classList.add('show');
  setText('modal-title', title || '알림');
  setHtml('modal-desc', desc || '');
  const inp = els['modal-input'];
  if (type === 'PROMPT') {
    inp.style.display = 'block';
    inp.placeholder = placeholder || '';
    inp.value = val || '';
    inp.focus();
  } else {
    inp.style.display = 'none';
  }
  els['modal-btn-cancel'].style.display = type === 'ALERT' ? 'none' : 'block';
}

function hideModal() {
  if(els['app-modal']) els['app-modal'].classList.remove('show');
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}

function initMeta() {
  state.db.meta.tagPresets = state.db.meta.tagPresets || ['trend', 'sweep'];
  state.db.meta.mistakePresets = state.db.meta.mistakePresets || ['fomo', 'early exit'];
  state.db.meta.balanceHistory = Array.isArray(state.db.meta.balanceHistory) ? state.db.meta.balanceHistory : [];
  state.db.meta.checklists = Array.isArray(state.db.meta.checklists) ? state.db.meta.checklists : [];
  renderDropdowns();
  renderQuickChips();
  renderAccountBalance();
  renderMasterChecklist();
}

function bindEvents() {
  if(els['modal-btn-cancel']) {
    els['modal-btn-cancel'].onclick = () => { hideModal(); if (modalCallback) modalCallback(null); };
  }
  if(els['modal-btn-confirm']) {
    els['modal-btn-confirm'].onclick = () => {
      hideModal();
      if (modalCallback) {
        const inp = els['modal-input'];
        modalCallback(inp.style.display === 'block' ? inp.value : true);
      }
    };
  }

  els['btn-manage-ticker'].onclick = () => manageList('tickers', 'Ticker', 'upper');
  els['btn-manage-setup-entry'].onclick = () => manageList('entrySetups', 'Entry Setup', 'upper');
  els['btn-manage-setup-exit'].onclick = () => manageList('exitSetups', 'Exit Setup', 'upper');

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
  
  els['add-live-chart'].onclick = () => {
    state.draftLiveCharts.push('');
    renderLiveCharts();
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

  const filterIds = ['q','f-from','f-to','f-status','f-side','f-session','f-setup','f-tag','f-mistake','f-grade','sort'];
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
    if(els[id]){
      els[id].addEventListener('input', calcTotalBalance);
      els[id].addEventListener('change', calcTotalBalance);
    }
  });

  if(els['btn-update-balance']) els['btn-update-balance'].onclick = updateBalance;
  
  if(els['desk-rules']) {
    els['desk-rules'].addEventListener('input', function() {
      autoResize(this);
      state.db.meta.rules = this.value;
      saveDB(state.db);
    });
  }

  if(els['btn-add-check']) {
    els['btn-add-check'].onclick = () => {
      const val = getVal('new-check-input').trim();
      if(val && !state.db.meta.checklists.includes(val)) {
        state.db.meta.checklists.push(val);
        setVal('new-check-input', '');
        saveDB(state.db);
        renderMasterChecklist();
        renderTradeChecklist(); 
      }
    };
  }
  
  if (els['eod-memo']) {
    els['eod-memo'].addEventListener('input', function() {
      autoResize(this);
      const todayStr = new Date().toISOString().slice(0, 10);
      if (!state.db.meta.dailyMemos) state.db.meta.dailyMemos = {};
      state.db.meta.dailyMemos[todayStr] = this.value;
      saveDB(state.db);
    });
  }

  bindKeyboardShortcuts();

  [
    'trade-date','ticker','status','session','side','setup-entry','setup-exit',
    'account-size','risk-pct','leverage','maker-fee','taker-fee','stop-price','mark-price','stop-type','adjustment',
    'context','thesis','review','chart-entry','chart-exit',
    'tags','mistakes','grade','live-notes'
  ].forEach(id => {
    if (!els[id]) return;
    els[id].addEventListener('input', handleFormMutation);
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
      if (typing) persistDraft(true); else handleSubmit(event);
    }

    if (state.view === 'library' && !typing) {
      if (key === 'j') { event.preventDefault(); stepSelectedTrade(1); }
      if (key === 'k') { event.preventDefault(); stepSelectedTrade(-1); }
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
  renderMasterChecklist();
  updatePreview();
}

window.__desk_del_check = (idx) => {
  state.db.meta.checklists.splice(idx, 1);
  saveDB(state.db);
  renderMasterChecklist();
  renderTradeChecklist();
};

function renderMasterChecklist() {
  if(!els['master-checklist-list']) return;
  const list = state.db.meta.checklists || [];
  els['master-checklist-list'].innerHTML = list.length ? list.map((item, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid var(--line); padding:8px 12px; border-radius:8px;">
      <span style="font-size:12px; font-weight:700;">${escapeHtml(item)}</span>
      <button type="button" class="tool-btn" style="padding:4px 8px; font-size:10px;" onclick="window.__desk_del_check(${idx})">✕</button>
    </div>
  `).join('') : '<span class="muted-caption" style="font-size:12px;">등록된 체크리스트가 없습니다.</span>';
}

function renderTradeChecklist(checkedValues = []) {
  if(!els['trade-checklist-container']) return;
  const list = state.db.meta.checklists || [];
  if(!list.length) {
    els['trade-checklist-container'].innerHTML = '<span style="color:var(--muted); font-size:12px; font-weight:600;">사이드바 Desk Rules에서 체크리스트를 먼저 추가해주세요.</span>';
    return;
  }
  els['trade-checklist-container'].innerHTML = list.map(item => `
    <label class="check-inline">
      <input type="checkbox" value="${escapeAttr(item)}" class="trade-check-item" ${checkedValues.includes(item) ? 'checked' : ''}>
      <span>${escapeHtml(item)}</span>
    </label>
  `).join('');

  els['trade-checklist-container'].querySelectorAll('input').forEach(chk => {
    chk.addEventListener('change', handleFormMutation);
  });
}

function getCheckedRules() {
  if(!els['trade-checklist-container']) return [];
  const boxes = els['trade-checklist-container'].querySelectorAll('.trade-check-item:checked');
  return Array.from(boxes).map(b => b.value);
}

function renderDropdowns() {
  populateSelect('ticker', state.db.meta.tickers);
  populateSelect('setup-entry', state.db.meta.entrySetups);
  populateSelect('setup-exit', state.db.meta.exitSetups);
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
  showModal({ type: 'PROMPT', title: `${label} 관리`, desc: `새로 추가할 항목을 입력하세요.<br>(삭제하려면 이름 앞에 '-'를 붙이세요. 예: -FOMO)` }, (val) => {
    if (!val) return;
    const isDel = val.startsWith('-');
    const cleanVal = (isDel ? val.slice(1) : val).trim();
    const finalVal = casing === 'upper' ? cleanVal.toUpperCase() : cleanVal.toLowerCase();
    if (!finalVal) return;
    
    const arr = state.db.meta[key];
    if (isDel) {
      const idx = arr.indexOf(finalVal);
      if (idx >= 0) arr.splice(idx, 1);
    } else {
      if (!arr.includes(finalVal)) arr.push(finalVal);
    }
    saveDB(state.db);
    renderDropdowns();
    renderQuickChips();
  });
}

function hydrateInitialForm() {
  const tpl = state.db.meta.lastTradeForm || {};
  setVal('trade-date', inputDate(new Date().toISOString()));
  setVal('account-size', tpl.accountSize || Math.round(Number(state.db.meta.accountBalance || 10000)));
  setVal('risk-pct', tpl.riskPct || 0.5);
  setVal('leverage', tpl.leverage || 5);
  setVal('maker-fee', tpl.makerFee || 0.02);
  setVal('taker-fee', tpl.takerFee || 0.05);
  
  setVal('desk-rules', state.db.meta.rules || '');
  setTimeout(() => autoResize(els['desk-rules']), 0);
  
  state.draftEntries = [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = [];
  state.draftLiveCharts = [];
  renderLegs('entry');
  renderLegs('exit');
  renderLiveCharts();
  renderTradeChecklist([]);
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

function renderLiveCharts() {
  const container = els['live-charts-container'];
  if (!container) return;
  container.innerHTML = state.draftLiveCharts.map((url, idx) => `
    <div style="display:flex; gap:8px;">
      <input type="text" class="live-chart-input" value="${escapeAttr(url)}" placeholder="https://www.tradingview.com/x/... 등 링크 입력" data-index="${idx}" />
      <button type="button" class="tool-btn btn-del-live-chart" data-index="${idx}" style="color:var(--muted); border-color:var(--line);">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.live-chart-input').forEach(input => {
    input.oninput = (e) => {
      state.draftLiveCharts[e.target.dataset.index] = e.target.value;
      markDirty(); persistDraft();
    };
  });
  container.querySelectorAll('.btn-del-live-chart').forEach(btn => {
    btn.onclick = (e) => {
      state.draftLiveCharts.splice(e.target.dataset.index, 1);
      renderLiveCharts();
      markDirty(); persistDraft();
    };
  });
}

function renderLegs(kind) {
  const key = kind === 'entry' ? 'draftEntries' : 'draftExits';
  const target = els[kind === 'entry' ? 'entries' : 'exits'];
  target.innerHTML = state[key].map((leg, index) => `
    <div class="leg-row" data-kind="${kind}" data-index="${index}">
      <div class="input-with-unit">
        <span class="unit left">$</span>
        <input type="number" step="0.01" class="leg-price" value="${safeNumber(leg.price)}" placeholder="Price" />
      </div>
      <select class="leg-type" style="width: 100%;">
        <option value="M" ${leg.type === 'M' ? 'selected' : ''}>Maker</option>
        <option value="T" ${leg.type === 'T' ? 'selected' : ''}>Taker</option>
      </select>
      <div class="input-with-unit">
        <input type="number" step="0.01" class="leg-weight" value="${safeNumber(leg.weight)}" placeholder="Weight" />
        <span class="unit right">%</span>
      </div>
      <button type="button" class="tool-btn leg-delete" style="color:var(--muted); border-color:var(--line);">✕</button>
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

function resetFormForce() {
  clearDraft();
  state.selectedTradeId = null;
  state.dirty = false;

  [
    'trade-id','context','thesis','review','chart-entry','chart-exit','tags','mistakes','live-notes',
    'mark-price','adjustment','stop-price'
  ].forEach(id => setVal(id, ''));

  setVal('trade-date', inputDate(new Date().toISOString()));
  setVal('status', 'OPEN');
  setVal('side', 'LONG');
  setVal('grade', 'B');
  setVal('ticker', state.db.meta.tickers[0] || 'BTCUSDT');
  setVal('setup-entry', state.db.meta.entrySetups[0] || '');
  setVal('setup-exit', state.db.meta.exitSetups[0] || '');

  const tpl = state.db.meta.lastTradeForm || {};
  setVal('account-size', tpl.accountSize || Math.round(Number(state.db.meta.accountBalance || 10000)));
  setVal('risk-pct', tpl.riskPct || 0.5);
  setVal('leverage', tpl.leverage || 5);
  setVal('maker-fee', tpl.makerFee || 0.02);
  setVal('taker-fee', tpl.takerFee || 0.05);

  state.draftEntries = [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = [];
  state.draftLiveCharts = [];
  renderLegs('entry');
  renderLegs('exit');
  renderLiveCharts();
  renderTradeChecklist([]);
  updatePreview();
  refreshJournalStatus('새 폼 준비');
}

function resetForm() {
  if (state.dirty) {
    showModal({ type: 'CONFIRM', title: '초기화', desc: '현재 편집 내용을 초기화하시겠습니까?' }, (res) => {
      if (res) resetFormForce();
    });
  } else {
    resetFormForce();
  }
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
  showModal({ type: 'CONFIRM', title: '트레이드 삭제', desc: '이 트레이드를 영구적으로 삭제하시겠습니까?' }, (res) => {
    if (!res) return;
    state.db.trades = state.db.trades.filter(trade => trade.id !== id);
    saveDB(state.db);
    resetFormForce();
    render();
    refreshJournalStatus('트레이드 삭제 완료');
  });
}

function readForm() {
  const trade = {
    id: getVal('trade-id') || crypto.randomUUID(),
    date: getVal('trade-date') ? new Date(getVal('trade-date')).toISOString() : new Date().toISOString(),
    ticker: getVal('ticker'),
    status: getVal('status'),
    side: getVal('side'),
    session: getVal('session'),
    setupEntry: getVal('setup-entry'),
    setupExit: getVal('setup-exit'),
    grade: getVal('grade'),
    accountSize: Number(getVal('account-size') || 0),
    riskPct: Number(getVal('risk-pct') || 0),
    leverage: Number(getVal('leverage') || 0),
    makerFee: Number(getVal('maker-fee') || 0),
    takerFee: Number(getVal('taker-fee') || 0),
    stopPrice: Number(getVal('stop-price') || 0),
    markPrice: Number(getVal('mark-price') || 0),
    stopType: getVal('stop-type'),
    adjustment: Number(getVal('adjustment') || 0),
    context: getVal('context'),
    thesis: getVal('thesis'),
    review: getVal('review'),
    liveNotes: getVal('live-notes'),
    tags: splitCsv(getVal('tags')),
    mistakes: splitCsv(getVal('mistakes')),
    checkedRules: getCheckedRules(),
    evidence: {
      entryChart: getVal('chart-entry'),
      exitChart: getVal('chart-exit'),
      liveCharts: state.draftLiveCharts.filter(Boolean),
    },
    entries: cloneRows(state.draftEntries),
    exits: cloneRows(state.draftExits),
  };
  return normalizeTrade(trade);
}

function handleSubmit(event) {
  if (event) event.preventDefault();
  const trade = readForm();
  
  if (trade.metrics.exitExceeds100) {
    showModal({ type: 'ALERT', title: '계산 오류', desc: `청산 비중 합계가 100%를 초과할 수 없습니다. (현재: ${trade.metrics.exitPct}%)` });
    return;
  }
  if (!trade.metrics.valid) {
    showModal({ type: 'ALERT', title: '입력 누락', desc: '손절가, 진입 가격, 진입 비중(합계 100%)을 먼저 정확히 입력해주세요.' });
    return;
  }
  if (trade.status === 'CLOSED' && trade.metrics.remainingPct > 0) {
    showModal({ type: 'ALERT', title: '상태 오류', desc: '포지션 잔량이 남아있는 상태에서 CLOSED로 저장할 수 없습니다.<br>청산 물량을 추가하거나 상태를 OPEN으로 변경하세요.' });
    return;
  }
  if (trade.status === 'OPEN' && trade.metrics.remainingPct === 0) {
    showModal({ type: 'ALERT', title: '상태 오류', desc: '모든 물량이 청산되었습니다. 상태를 CLOSED로 변경해주세요.' });
    return;
  }
  
  if (trade.grade === 'S' && trade.checkedRules.length < state.db.meta.checklists.length) {
    showModal({ type: 'ALERT', title: '원칙 위반 경고', desc: 'S등급은 설정한 원칙(체크리스트)을 100% 완벽히 지켰을 때만 부여할 수 있습니다.<br>체크리스트를 확인하거나 등급을 하향 조정하세요.' });
    return;
  }

  const existingIndex = state.db.trades.findIndex(row => row.id === trade.id);
  if (existingIndex >= 0) {
    state.db.trades[existingIndex] = trade;
  } else {
    state.db.trades.unshift(trade);
  }

  state.db.meta.lastTradeForm = {
    accountSize: trade.accountSize,
    riskPct: trade.riskPct,
    leverage: trade.leverage,
    makerFee: trade.makerFee,
    takerFee: trade.takerFee
  };

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
  setVal('setup-entry', trade.setupEntry);
  setVal('setup-exit', trade.setupExit);
  setVal('grade', trade.grade);
  setVal('account-size', trade.accountSize);
  setVal('risk-pct', trade.riskPct);
  setVal('leverage', trade.leverage);
  setVal('maker-fee', trade.makerFee);
  setVal('taker-fee', trade.takerFee);
  setVal('stop-price', trade.stopPrice || '');
  setVal('mark-price', trade.markPrice || '');
  setVal('stop-type', trade.stopType);
  setVal('adjustment', trade.adjustment || 0);
  setVal('context', trade.context || '');
  setVal('thesis', trade.thesis || '');
  setVal('review', trade.review || '');
  setVal('live-notes', trade.liveNotes || '');
  setVal('tags', (trade.tags || []).join(', '));
  setVal('mistakes', (trade.mistakes || []).join(', '));
  setVal('chart-entry', trade.evidence?.entryChart || '');
  setVal('chart-exit', trade.evidence?.exitChart || '');
  
  state.draftLiveCharts = Array.isArray(trade.evidence?.liveCharts) ? [...trade.evidence.liveCharts] : [];
  state.draftEntries = cloneRows(trade.entries || [{ price: 0, type: 'M', weight: 100 }]);
  state.draftExits = cloneRows(trade.exits || []);
  
  renderLegs('entry');
  renderLegs('exit');
  renderLiveCharts();
  renderTradeChecklist(trade.checkedRules || []); 
  updatePreview();
}

function updatePreview() {
  const trade = readForm();
  const metrics = trade.metrics;
  renderCalcSummary(metrics, trade);
  renderRiskPanel(metrics);
  setText('deep-review-r', `${metrics.r.toFixed(2)}R`);
}

function renderCalcSummary(metrics, trade) {
  let warnHtml = '';
  if (metrics.directionError) warnHtml += '<div class="warn-text">⚠️ 방향과 손절 위치가 충돌합니다.</div>';
  if (metrics.exitExceeds100) warnHtml += `<div class="warn-text" style="color:var(--red);">⚠️ 청산 비중 합계가 100%를 초과합니다. (${metrics.exitPct}%)</div>`;
  if (trade.status === 'OPEN' && metrics.missingMarkPrice) warnHtml += '<div class="warn-text">⚠️ 현재가(Mark Price)가 없어 미실현 손익이 0으로 처리됩니다.</div>';

  if (!metrics.valid && !metrics.exitExceeds100) {
    setHtml('calc-summary', `
      <div class="summary-invalid" style="color:var(--muted); font-weight:600;">
        손절가, 진입 가격, 진입 비중(합계 100%)을 확인해 주세요.
        ${warnHtml}
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
    ['Realized R', `${metrics.realizedR.toFixed(2)}R`, metrics.realizedR],
    ['Unrealized R', `${metrics.unrealizedR.toFixed(2)}R`, metrics.unrealizedR],
    ['Exit %', `${metrics.exitPct.toFixed(1)}%`],
    ['Residual Risk', money(metrics.residualRisk)],
    ['Fee Drag', `${metrics.feePctOfGross.toFixed(1)}%`],
  ];

  setHtml('calc-summary', `
    ${warnHtml ? `<div style="margin-bottom:12px; font-weight:700;">${warnHtml}</div>` : ''}
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
  setText('risk-risk-dollar', moneyAbs(metrics.riskDollar));
  setText('risk-qty', qty(metrics.qty));
  setText('risk-margin', moneyAbs(metrics.margin));
  setText('risk-slider', `${metrics.sliderPct.toFixed(1)}%`);
  setText('risk-notional', moneyAbs(metrics.notional));
  setText('risk-stop-distance', `${metrics.stopDistancePct.toFixed(2)}%`);
  setText('risk-fees', moneyAbs(metrics.totalFees));
  setText('risk-realized', money(metrics.realizedPnl));
  setText('risk-unrealized', money(metrics.unrealizedPnl));
  setText('risk-residual', moneyAbs(metrics.residualRisk));
}

function metricCard(label, value, colorClass) {
  return `
    <div class="metric ${colorClass}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

// ✨ Today Console 추가
function renderTodayConsole() {
  if (!els['today-console']) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todays = state.db.trades.filter(t => t.date.slice(0,10) === todayStr);
  const s = summarize(todays);
  
  if(!state.db.meta.dailyMemos) state.db.meta.dailyMemos = {};
  setVal('eod-memo', state.db.meta.dailyMemos[todayStr] || '');
  setTimeout(() => autoResize(els['eod-memo']), 0);

  if (!todays.length) {
    setHtml('today-console', emptyState('오늘 기록된 매매가 없습니다.'));
    return;
  }

  setHtml('today-console', `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div style="font-size:24px; font-weight:900; color:${s.net >= 0 ? 'var(--green)' : 'var(--red)'};">${money(s.net)}</div>
      <div style="font-size:18px; font-weight:800; color:var(--text);">${s.avgR.toFixed(2)}R</div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      <div style="background:#f1f5f9; padding:10px; border-radius:8px; text-align:center;">
        <span style="display:block; font-size:11px; color:var(--muted); font-weight:800;">WINS / LOSSES</span>
        <strong style="font-size:14px;">${s.wins.length}W / ${s.losses.length}L</strong>
      </div>
      <div style="background:#f1f5f9; padding:10px; border-radius:8px; text-align:center;">
        <span style="display:block; font-size:11px; color:var(--muted); font-weight:800;">FEES PAID</span>
        <strong style="font-size:14px; color:var(--red);">${moneyAbs(s.fees)}</strong>
      </div>
    </div>
  `);
}

function renderOverview() {
  renderTodayConsole();

  const trades = getOverviewTrades();
  const stats = summarize(trades);
  const setups = groupAverageR(stats.closed, trade => trade.setupEntry);
  const mistakes = tagStats(stats.closed, trade => trade.mistakes);
  
  const aPlusCount = stats.closed.filter(t => t.grade === 'S' || t.grade === 'A').length;

  const metrics = [
    metricCard('Net PnL', money(stats.net), 'metric-green'),
    metricCard('Win Rate', `${stats.winRate.toFixed(1)}%`, 'metric-blue'),
    metricCard('Avg R', `${stats.avgR.toFixed(2)}R`, 'metric-purple'),
    metricCard('Profit Factor', stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), 'metric-orange'),
    metricCard('A+ Setups', `${aPlusCount}건`, 'metric-teal'),
    metricCard('Max Drawdown', money(stats.maxDD), 'metric-red'),
  ];
  setHtml('metrics', metrics.join(''));

  renderStackStats('mistake-list', mistakes.slice(0, 6), row => `${row.count}건 · AvgR ${row.avgR.toFixed(2)}`);

  const notes = [];
  if (stats.closed.length) {
    notes.push(noteCard('실행 품질', `Closed ${stats.closed.length}건 기준 평균 R은 ${stats.avgR.toFixed(2)}R, Profit Factor는 ${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}입니다.`));
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
  renderBalanceChart();
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

function renderCalendar() {
  const trades = getOverviewTrades();
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  setText('calendar-title', `${year}-${String(month + 1).padStart(2, '0')}`);

  const map = new Map();
  trades.forEach(trade => {
    const date = new Date(trade.date);
    if (date.getFullYear() !== year || date.getMonth() !== month) return;
    const pad = n => String(n).padStart(2, '0');
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    map.set(key, (map.get(key) || 0) + trade.metrics.pnl);
  });

  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  const pad = n => String(n).padStart(2, '0');

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push('<div class="day muted"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
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
  
  setHtml('equity-chart', lineSvg(points, false));
}

function renderBalanceChart() {
  const history = state.db.meta.balanceHistory || [];
  if (!history.length) {
    setHtml('balance-chart', emptyState('표시할 잔고 데이터가 없습니다.'));
    return;
  }

  const rows = [...history].reverse(); 
  const points = rows.map((row, idx) => ({ x: idx, y: row.val }));

  setHtml('balance-chart', lineSvg(points, true));
}

// ✨ 완벽히 복원된 SVG 차트 그리기 함수
function lineSvg(points, isBalance = false) {
  if (points.length === 0) return '';
  const width = 780, height = 280, pad = 32;
  const yValues = points.map(p => p.y);
  let minY, maxY;
  
  if (isBalance) {
    const minVal = Math.min(...yValues);
    const maxVal = Math.max(...yValues);
    const diff = maxVal - minVal || maxVal * 0.1 || 10;
    minY = Math.max(0, minVal - diff * 0.2);
    maxY = maxVal + diff * 0.2;
  } else {
    minY = Math.min(0, ...yValues);
    maxY = Math.max(0, ...yValues);
  }
  
  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const scaleY = val => {
    if (maxY === minY) return height / 2;
    return height - pad - ((val - minY) / (maxY - minY)) * (height - pad * 2);
  };
  
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * xStep} ${scaleY(p.y)}`).join(' ');
  const area = `${d} L ${pad + (points.length - 1) * xStep} ${height - pad} L ${pad} ${height - pad} Z`;
  
  return `
    <svg viewBox="0 0 ${width} ${height}" aria-label="chart" style="width:100%; height:100%;">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" style="stroke:var(--line);" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" style="stroke:var(--line);" />
      <path d="${area}" style="fill:rgba(37, 99, 235, 0.1);"></path>
      <path d="${d}" style="fill:none; stroke:var(--accent); stroke-width:3px;"></path>
    </svg>
  `;
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
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:100%;">
      ${rows.map((row, idx) => {
        const y = idx * (rowHeight + gap) + 10;
        const barWidth = (Math.abs(row.value) / max) * 420;
        return `
          <text x="0" y="${y + 18}" fill="var(--muted)" font-size="11px" font-weight="800">${escapeHtml(row.label)} (${row.count})</text>
          <rect x="280" y="${y}" width="${barWidth}" height="${rowHeight}" fill="${row.value >= 0 ? 'var(--green)' : 'var(--red)'}" rx="8"></rect>
          <text x="${290 + barWidth}" y="${y + 18}" fill="var(--text)" font-size="11px" font-weight="800">${row.value.toFixed(2)}R</text>
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

  setHtml('overview-portfolio', `
    <div class="portfolio-summary" style="display:flex; flex-direction:column; gap:16px;">
      <div style="background: linear-gradient(135deg, #f1f5f9 0%, #ffffff 100%); border:1px solid var(--line); border-radius:16px; padding:20px;">
        <span style="color:var(--muted); font-weight:800; font-size:12px; display:block; margin-bottom:4px;">TOTAL PORTFOLIO</span>
        <strong style="font-size:36px; font-weight:900; letter-spacing:-1px; color:#0f172a;">${moneyAbsNatural(latest.val)}</strong>
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
    cash: 0, crypto: 0, usdt: 0, stock: 0, val: Number(state.db.meta.accountBalance || 0),
  };
  setVal('bal-cash', latest.cash || 0);
  setVal('bal-crypto', latest.crypto || 0);
  setVal('bal-usdt', latest.usdt || 0);
  setVal('bal-stock', latest.stock || 0);
  calcTotalBalance();
  
  setVal('desk-rules', state.db.meta.rules || '');
  setTimeout(() => autoResize(els['desk-rules']), 0);

  const typeColors = { PNL: 'var(--accent)', DEPOSIT: 'var(--green)', WITHDRAWAL: 'var(--red)', MANUAL: 'var(--muted)' };
  const typeLabels = { PNL: '매매', DEPOSIT: '입금', WITHDRAWAL: '출금', MANUAL: '조정' };

  setHtml('balance-history', history.length ? history.map(row => `
    <div style="padding:12px; border:1px solid var(--line); border-radius:12px; margin-bottom:8px; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="display:flex; align-items:center;">
          <span style="font-size:10px; font-weight:800; color:${typeColors[row.type] || 'var(--muted)'}; border:1px solid ${typeColors[row.type] || 'var(--muted)'}; padding:2px 6px; border-radius:4px; margin-right:8px;">${typeLabels[row.type] || row.type}</span>
          <strong style="font-size:14px; color:#0f172a;">${moneyAbsNatural(row.val)}</strong>
          ${row.delta !== 0 ? `<span style="margin-left:6px; font-size:11px; font-weight:700; color:${row.delta > 0 ? 'var(--green)' : 'var(--red)'};">${row.delta > 0 ? '+' : ''}${moneyAbsNatural(row.delta)}</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:var(--muted); font-size:11px;">${formatDateTime(row.date)}</span>
          <button type="button" class="tool-btn" style="padding:2px 6px; font-size:10px; background:transparent; border:none; color:var(--muted);" onclick="window.__desk_del_balance(${row.id})">✕</button>
        </div>
      </div>
      ${row.memo ? `<div style="font-size:11px; color:#475569; background:#f1f5f9; padding:4px 8px; border-radius:6px; display:inline-block; margin-top:2px;">${escapeHtml(row.memo)}</div>` : ''}
    </div>
  `).join('') : emptyState('잔고 히스토리가 없습니다.'));
}

function calcTotalBalance() {
  if(!els['bal-cash']) return 0;
  const total = ['bal-cash','bal-crypto','bal-usdt','bal-stock']
    .reduce((sum, id) => sum + Number(els[id].value || 0), 0);
  setText('bal-total', moneyAbsNatural(total));
  return total;
}

function updateBalance() {
  const cash = round(Number(getVal('bal-cash') || 0));
  const crypto = round(Number(getVal('bal-crypto') || 0));
  const usdt = round(Number(getVal('bal-usdt') || 0));
  const stock = round(Number(getVal('bal-stock') || 0));
  const type = getVal('balance-type') || 'PNL';
  const memo = getVal('balance-memo').trim();
  const total = cash + crypto + usdt + stock;

  if (total <= 0) {
    showModal({ type: 'ALERT', title: '입력 오류', desc: '총 자산은 0보다 커야 합니다.' });
    return;
  }

  const history = state.db.meta.balanceHistory || [];
  const prevTotal = history.length > 0 ? history[0].val : total;
  const delta = total - prevTotal;

  state.db.meta.accountBalance = total;
  state.db.meta.balanceHistory.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    val: total,
    delta,
    cash,
    crypto,
    usdt,
    stock,
    type,
    memo,
  });
  setVal('balance-memo', '');
  if (!getVal('trade-id')) setVal('account-size', total);
  saveDB(state.db);
  renderAccountBalance();
  renderOverviewPortfolio();
  if (state.view === 'overview') renderOverview();
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
      <td data-label="날짜">${formatDateTime(trade.date)}</td>
      <td data-label="상태">${trade.status === 'OPEN' ? '<span class="badge-open">OPEN</span>' : '<span class="badge-closed">CLOSED</span>'}</td>
      <td data-label="티커" style="font-weight:800; color:#0f172a;">${escapeHtml(trade.ticker)}</td>
      <td data-label="방향">${escapeHtml(trade.side)}</td>
      <td data-label="세션">${escapeHtml(trade.session)}</td>
      <td data-label="셋업" style="font-weight:700;">${escapeHtml(trade.setupEntry || '—')}</td>
      <td data-label="Avg In" class="mono">${trade.metrics.avgEntry ? moneyAbs(trade.metrics.avgEntry) : '—'}</td>
      <td data-label="Avg Out" class="mono">${trade.metrics.avgExit ? moneyAbs(trade.metrics.avgExit) : '—'}</td>
      <td data-label="PnL" class="mono ${trade.metrics.pnl > 0 ? 'positive' : trade.metrics.pnl < 0 ? 'negative' : ''}">${money(trade.metrics.pnl)}</td>
      <td data-label="R" class="mono ${trade.metrics.r > 0 ? 'positive' : trade.metrics.r < 0 ? 'negative' : ''}">${trade.metrics.r.toFixed(2)}R</td>
      <td data-label="Grade"><span class="badge ${trade.grade === 'S' || trade.grade === 'A' ? 'badge-good' : ''}">${trade.grade}</span></td>
      <td data-label="태그">${(trade.tags || []).slice(0, 3).map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join(' ')}</td>
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
  const tag = getVal('f-tag').trim().toLowerCase();
  const mistake = getVal('f-mistake').trim().toLowerCase();
  const grade = getVal('f-grade');
  const sort = getVal('sort');

  let rows = [...state.db.trades];
  rows = filterTradesByDate(rows, from, to);
  rows = rows.filter(trade => {
    if (status !== 'ALL' && trade.status !== status) return false;
    if (side !== 'ALL' && trade.side !== side) return false;
    if (session !== 'ALL' && trade.session !== session) return false;
    if (grade !== 'ALL' && trade.grade !== grade) return false;
    if (setup && !(trade.setupEntry || '').toLowerCase().includes(setup)) return false;
    if (tag && !(trade.tags || []).some(value => value.includes(tag))) return false;
    if (mistake && !(trade.mistakes || []).some(value => value.includes(mistake))) return false;
    if (q) {
      const haystack = [
        trade.ticker, trade.setupEntry, trade.setupExit, trade.context, trade.thesis, trade.review,
        trade.liveNotes, trade.session,
        ...(trade.tags || []), ...(trade.mistakes || [])
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    if (sort === 'oldest') return new Date(a.date) - new Date(b.date);
    if (sort === 'bestR') return b.metrics.r - a.metrics.r;
    if (sort === 'worstR') return a.metrics.r - b.metrics.r;
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
      <div>Grade</div><div><span class="badge ${trade.grade === 'S' || trade.grade === 'A' ? 'badge-good' : ''}">${escapeHtml(trade.grade)}</span></div>
      <div>Avg In / Avg Out</div><div class="mono">${moneyAbs(trade.metrics.avgEntry)} / ${trade.metrics.avgExit ? moneyAbs(trade.metrics.avgExit) : '—'}</div>
      <div>PnL / R</div><div class="mono ${trade.metrics.pnl > 0 ? 'positive' : trade.metrics.pnl < 0 ? 'negative' : ''}">${money(trade.metrics.pnl)} / ${trade.metrics.r.toFixed(2)}R</div>
      <div>Real/Unrealized</div><div class="mono">${money(trade.metrics.realizedPnl)} / ${money(trade.metrics.unrealizedPnl)}</div>
      <div>Residual Risk</div><div class="mono">${moneyAbs(trade.metrics.residualRisk)} (${trade.metrics.remainingPct.toFixed(1)}% remaining)</div>
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
      <h4 style="margin:0 0 8px; font-size:14px; font-weight:800;">원칙 점검</h4>
      <div class="chips" style="margin-bottom:12px;">
         ${(trade.checkedRules || []).length ? trade.checkedRules.map(r => `<span class="chip" style="background:var(--green-soft); color:var(--green); border-color:#a7f3d0;">✓ ${escapeHtml(r)}</span>`).join('') : '<span class="muted-caption" style="font-size:12px;">체크된 항목 없음</span>'}
      </div>
    </div>

    <div style="margin-top:24px;">
      <h4 style="margin:0 0 8px; font-size:14px; font-weight:800;">Pre-trade</h4>
      <p style="margin:0 0 8px; color:#334155;"><strong>Context:</strong> ${escapeHtml(trade.context || '—')}</p>
      <p style="margin:0; color:#334155;"><strong>Thesis:</strong> ${escapeHtml(trade.thesis || '—')}</p>
    </div>

    <div style="margin-top:24px;">
      <h4 style="margin:0 0 8px; font-size:14px; font-weight:800;">Review</h4>
      <p style="margin:0 0 12px; color:#334155;">${escapeHtml(trade.review || '—')}</p>
      <strong style="font-size:13px; color:#0f172a;">Live Notes:</strong>
      <div style="margin-top:8px; padding:16px; background:#f1f5f9; border-radius:12px; font-family:monospace; font-size:12px; white-space:pre-wrap; color:#334155;">${escapeHtml(trade.liveNotes || '—')}</div>
      <div class="chips" style="margin-top:12px;">${(trade.tags || []).map(tag => `<span class="chip">#${escapeHtml(tag)}</span>`).join(' ') || '<span class="chip">태그 없음</span>'}</div>
      <div class="chips">${(trade.mistakes || []).map(tag => `<span class="chip danger-chip">${escapeHtml(tag)}</span>`).join(' ') || '<span class="chip">실수 없음</span>'}</div>
    </div>

    <div style="margin-top:24px;">
      <h4 style="margin:0 0 8px; font-size:14px; font-weight:800;">Evidence (Charts)</h4>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${trade.evidence?.entryChart ? `<a href="${escapeAttr(trade.evidence.entryChart)}" target="_blank" style="padding:8px 16px; background:#e0e7ff; color:var(--accent); border-radius:8px; text-decoration:none; font-weight:700; font-size:12px;">Entry Chart 📈</a>` : ''}
        ${trade.evidence?.exitChart ? `<a href="${escapeAttr(trade.evidence.exitChart)}" target="_blank" style="padding:8px 16px; background:#e0e7ff; color:var(--accent); border-radius:8px; text-decoration:none; font-weight:700; font-size:12px;">Exit Chart 📈</a>` : ''}
        ${(trade.evidence?.liveCharts || []).map((url, idx) => `<a href="${escapeAttr(url)}" target="_blank" style="padding:8px 16px; background:#f1f5f9; color:var(--muted); border:1px solid var(--line); border-radius:8px; text-decoration:none; font-weight:700; font-size:12px;">Live Chart ${idx + 1} 🔍</a>`).join('')}
      </div>
    </div>
  `);

  document.getElementById('load-selected-into-journal').onclick = () => openSelectedInJournal(trade.id);
}

function renderTimeline(type, rows) {
  if (!rows.length) return `
    <div style="position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:8px; flex:1;">
      <div style="width:16px; height:16px; border-radius:50%; background:#fff; border:3px solid var(--line);"></div>
      <div style="font-size:11px; color:var(--muted); font-weight:800;">${type.toUpperCase()}</div>
      <div class="mono" style="font-size:12px;">—</div>
    </div>
  `;
  const color = type === 'entry' ? 'var(--accent)' : 'var(--yellow)';
  return rows.map((row, idx) => `
    <div style="position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; gap:8px; flex:1;">
      <div style="width:16px; height:16px; border-radius:50%; background:${color}; border:3px solid #fff; box-shadow:0 0 0 2px ${color};"></div>
      <div style="font-size:11px; color:var(--muted); font-weight:800; margin-top:4px;">${type.toUpperCase()} ${idx + 1}</div>
      <div class="mono" style="font-size:12px; font-weight:800; color:#0f172a;">${safeNumber(row.price)} / ${safeNumber(row.weight)}%</div>
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
      <h4 style="margin:0 0 12px; font-size:14px; font-weight:800;">유사 샘플 (최근 5건)</h4>
      ${similar.length ? similar.map(row => `
        <div class="similar-item" data-id="${row.id}" style="padding:12px 16px; border:1px solid var(--line); border-radius:12px; margin-bottom:8px; cursor:pointer;">
          <strong style="color:#0f172a; font-weight:800;">${escapeHtml(row.ticker)} · ${escapeHtml(row.setupEntry || 'NA')}</strong>
          <div style="font-size:12px; color:var(--muted); margin-top:4px; font-weight:600;">${formatDate(row.date)} · <span class="${row.metrics.r > 0 ? 'positive' : 'negative'}">${row.metrics.r.toFixed(2)}R</span> · Grade ${row.grade}</div>
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
    .filter(trade => (trade.grade === 'S' || trade.grade === 'A') && !(trade.mistakes || []).length)
    .sort((a, b) => b.metrics.r - a.metrics.r);

  let html = '';
  rows.forEach(trade => {
    const chartUrl = trade.evidence?.exitChart || trade.evidence?.entryChart;
    let imgHtml = '';
    if (chartUrl) {
      if (chartUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
        imgHtml = `<img class="playbook-img" src="${escapeAttr(chartUrl)}" alt="chart" onerror="this.style.display='none'">`;
      } else if (chartUrl.includes('tradingview.com/x/')) {
        const tvId = chartUrl.split('/x/')[1]?.replace('/', '');
        if (tvId) {
          imgHtml = `<img class="playbook-img" src="https://s3.tradingview.com/x/${tvId}.png" alt="chart" onerror="this.style.display='none'">`;
        } else {
          imgHtml = `<div class="playbook-img-fallback"><a href="${escapeAttr(chartUrl)}" target="_blank" class="btn-view-chart">📈 View Chart</a></div>`;
        }
      } else {
        imgHtml = `<div class="playbook-img-fallback"><a href="${escapeAttr(chartUrl)}" target="_blank" class="btn-view-chart">🔗 View Evidence</a></div>`;
      }
    } else {
      imgHtml = `<div class="playbook-img placeholder">No Evidence</div>`;
    }

    html += `
    <article class="playbook-card" data-id="${trade.id}">
      ${imgHtml}
      <div class="playbook-info" style="padding: 16px; display:flex; flex-direction:column; flex:1;">
        <div class="playbook-header" style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:16px; color:#0f172a; font-weight:900;">${escapeHtml(trade.ticker)}</strong>
          <span class="badge badge-good" style="font-size:12px;">Grade ${trade.grade}</span>
        </div>
        <div style="font-size:12px; color:var(--accent); font-weight:800; margin-top:4px;">${escapeHtml(trade.setupEntry || 'NA')}</div>
        <div style="font-size:11px; color:var(--muted); font-weight:600; margin-top:2px;">${formatDateTime(trade.date)} · ${trade.session}</div>
        <div class="mono ${trade.metrics.r > 0 ? 'positive' : 'negative'}" style="font-size:14px; font-weight:800; margin-top:8px;">${trade.metrics.r.toFixed(2)}R (${money(trade.metrics.pnl)})</div>
        <p style="font-size:12px; color:#334155; font-weight:500; margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(trade.thesis || trade.review || '설명 없음')}</p>
        <div class="chips" style="margin-top:auto;">${(trade.tags || []).slice(0, 3).map(item => `<span class="chip">#${escapeHtml(item)}</span>`).join('') || '<span class="chip">태그 없음</span>'}</div>
      </div>
    </article>`;
  });

  setHtml('playbook-gallery', rows.length ? html : emptyState('조건을 만족하는 S/A급 Playbook 샘플이 없습니다.'));

  els['playbook-gallery'].querySelectorAll('.playbook-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.tagName === 'A') return;
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
  ['q','f-from','f-to','f-setup','f-tag','f-mistake'].forEach(id => setVal(id, ''));
  setVal('f-status', 'ALL');
  setVal('f-side', 'ALL');
  setVal('f-session', 'ALL');
  setVal('f-grade', 'ALL');
  setVal('sort', 'newest');
  renderLibrary();
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  showModal({ type: 'CONFIRM', title: '데이터 복원', desc: '경고: 데이터를 복원하면 현재 작성된 모든 기록이 덮어씌워집니다.<br>안전을 위해 현재 데이터를 먼저 백업(다운로드) 하시겠습니까?' }, (wantsBackup) => {
    if (wantsBackup) exportDB(state.db);
    
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImport(String(reader.result));
        state.db = imported;
        saveDB(state.db);
        initMeta();
        resetFormForce();
        render();
        showModal({ type: 'ALERT', title: '복원 완료', desc: '데이터가 성공적으로 복원되었습니다.' });
      } catch (error) {
        console.error(error);
        showModal({ type: 'ALERT', title: '복원 실패', desc: '유효한 JSON 파일이 아닙니다.' });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });
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

function noteCard(title, body) {
  return `
    <div class="note-card">
      <strong style="color:#0f172a; font-size:14px; font-weight:800; display:block; margin-bottom:6px;">${escapeHtml(title)}</strong>
      <p style="margin:0; color:#334155; font-weight:500;">${escapeHtml(body)}</p>
    </div>
  `;
}

function portfolioItem(label, value) {
  return `
    <div style="background:#f8fafc; border:1px solid var(--line); border-radius:12px; padding:12px;">
      <div style="font-size:12px; color:var(--muted); font-weight:800; margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="font-size:16px; font-weight:900; color:#0f172a;">${moneyAbsNatural(value)}</div>
    </div>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function splitCsv(value) {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
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

function moneyAbs(value) {
  return `$${Math.abs(Number(value || 0)).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function moneyAbsNatural(value) {
  return `$${Math.abs(Math.round(Number(value || 0))).toLocaleString()}`;
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
