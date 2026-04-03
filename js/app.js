import { generatePlannerSuggestion } from './calc.js';
import {
  summarize, groupAverageR, tagStats, filterTradesByDate
} from './analytics.js';
import {
  loadDB, saveDB, exportDB, parseImport, normalizeTrade, sanitizeUrl,
  loadDraft, saveDraft, clearDraft, hydrateDBFromIndexedDB, hydrateDraftFromIndexedDB
} from './storage.js';

const state = {
  db: loadDB(),
  view: 'overview',
  month: new Date(),
  selectedTradeId: null,
  filteredTrades: [],
  draftEntries: [{ price: 0, type: 'M', weight: 100, leverage: 5 }],
  plannerSuggestion: null,
  draftExits: [],
  draftEntryCharts: [],
  draftExitCharts: [],
  draftLiveCharts: [],
  dirty: false,
  overviewHistoryMode: 'trades',
  undoStack: [],
  undoAnchor: null,
  undoAnchorConsumed: false,
  suspendUndo: false,
};

const views = ['overview', 'journal', 'library', 'playbook'];
const els = {};
let draftTimer = null;

const ID_LIST = [
  'nav','force-save-draft','export-json','import-json-btn','import-json','journal-status','draft-saved-at',
  'view-overview','metrics','overview-from','overview-to','overview-clear','overview-search','prev-month','calendar-title','next-month','calendar','equity-chart','balance-chart','setup-chart','mistake-list','research-notes','overview-portfolio','overview-history-list',
  'realtime-clock','quick-launch-grid','btn-manage-quick-links','journal-sidebar','journal-pretrade-phase','journal-risk-phase','risk-planner-card','pretrade-brief','btn-context-structure','btn-context-catalyst','btn-thesis-trigger','btn-thesis-invalidation','planner-mode-note',
  'view-journal','trade-form','trade-id','trade-date','trade-end-date','btn-now','btn-end-now','holding-preview','ticker','btn-manage-ticker','status','status-toggle','side','setup-entry','btn-manage-setup-entry','setup-exit','btn-manage-setup-exit',
  'account-size','risk-pct','leverage','current-price','planner-mode','planner-legs','planner-weight-mode','btn-generate-plan','btn-apply-plan','planner-summary','maker-fee','taker-fee','stop-price','target-price','stop-type','price-map-distance-summary',
  'context','thesis','review','tags','mistakes',
  'add-entry','entries','add-exit','exits','calc-summary','quick-tags','quick-mistakes','live-notes','btn-insert-time','add-live-chart','live-charts-container',
  'add-entry-chart','entry-charts-container','add-exit-chart','exit-charts-container',
  'eval-status-badge','assessment-risk-used','assessment-risk-budget','assessment-projected-pnl','assessment-final-pnl','assessment-projected-r','assessment-final-r','assessment-bep','assessment-residual','assessment-fees','assessment-account-impact','post-assessment-copy',
  'bal-cash','bal-crypto','bal-usdt','bal-stock','bal-total','balance-type','balance-memo','btn-update-balance','balance-history',
  'duplicate-trade','reset-form','delete-trade','undo-journal','grade',
  'desk-rules','master-checklist-list','new-check-input','btn-add-check','trade-checklist-container',
  'risk-risk-dollar','risk-qty','risk-margin','risk-slider','risk-notional','risk-stop-distance','risk-fees','risk-realized','risk-unrealized','risk-residual','risk-actual-risk','risk-risk-usage','risk-weighted-lev','risk-avg-entry','risk-bep','risk-remaining-risk',
  'risk-projected-pnl','risk-projected-r',
  'view-library','q','f-from','f-to','f-status','f-side','f-setup','f-tag','f-mistake','f-grade','sort','clear-filters','library-result-count','review-position','review-breadcrumb','prev-trade','next-trade','filter-same-setup','filter-same-ticker','clear-quick-filter','trade-table','detail','detail-insights',
  'view-playbook','playbook-gallery',
  'app-modal','modal-title','modal-desc','modal-input','modal-btn-cancel','modal-btn-confirm',
  'list-manage-modal','list-manage-title','list-manage-input','list-manage-add','list-manage-items','list-manage-close',
  'ql-modal','ql-name','ql-url','ql-icon','ql-add','ql-items','ql-close','open-guide-btn','guide-modal','guide-close'
];

window.__desk = {
  selectTrade: id => selectTrade(id),
  applySameSetupFilter: () => filterBySelectedSetup(),
  applySameTickerFilter: () => filterBySelectedTicker(),
  openTradeInJournal: id => openSelectedInJournal(id),
  deleteTradeById: id => deleteTradeById(id),
  openHistoryDate: dateKey => openHistoryDate(dateKey),
};

function getLocalDateKey(dateObj) {
  const d = dateObj ? new Date(dateObj) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

window.__desk_jump_date = (dateString) => {
  setVal('f-from', dateString);
  setVal('f-to', dateString);
  state.view = 'library';
  renderViews();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function openHistoryDate(dateString) {
  setVal('f-from', dateString);
  setVal('f-to', dateString);
  state.view = 'library';
  renderViews();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

function bootstrap() {
  safeCall('cacheEls', () => cacheEls());
  safeCall('bindEvents', () => bindEvents());
  safeCall('initMeta', () => initMeta());
  safeCall('renderNav', () => renderNav());
  safeCall('hydrateInitialForm', () => hydrateInitialForm());
  safeCall('restoreDraftIfPresent', () => restoreDraftIfPresent());
  safeCall('startClock', () => startClock());
  safeCall('render', () => render());
  safeCall('updateUndoButton', () => updateUndoButton());
  if (bootErrors.length === 0) refreshJournalStatus('시스템 정상');
}


function cacheEls() {
  ID_LIST.forEach(id => {
    els[id] = document.getElementById(id);
  });
}

function startClock() {
  const updateClock = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const days = ['일','월','화','수','목','금','토'];
    
    const dateStr = `${now.getFullYear()}. ${pad(now.getMonth()+1)}. ${pad(now.getDate())} (${days[now.getDay()]})`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    if(els['realtime-clock']) {
      els['realtime-clock'].innerHTML = `<div class="clock-time">${timeStr}</div><div class="clock-date">${dateStr}</div>`;
    }
  };
  updateClock();
  setInterval(updateClock, 1000);
}

let modalCallback = null;

let bootErrors = [];
function safeCall(name, fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    console.error(`[${name}]`, error);
    bootErrors.push({ name, error });
    refreshJournalStatus(`${name} 오류`, 'error');
    return fallback;
  }
}
async function hydratePersistentState() {
  try {
    const [hydratedDb, hydratedDraft] = await Promise.all([
      hydrateDBFromIndexedDB(),
      hydrateDraftFromIndexedDB()
    ]);

    if (hydratedDb && JSON.stringify(hydratedDb) !== JSON.stringify(state.db)) {
      state.db = hydratedDb;
      initMeta();
      render();
      updatePreview();
      refreshJournalStatus('IndexedDB 동기화 완료');
    }

    if (!loadDraft() && hydratedDraft?.trade) {
      applyTradeToForm(hydratedDraft.trade, { keepId: Boolean(hydratedDraft.trade.id) });
      if (hydratedDraft.savedAt) setText('draft-saved-at', `Draft ${formatDateTime(hydratedDraft.savedAt)} 저장`);
      updatePreview();
    }
  } catch (error) {
    console.error('[hydratePersistentState]', error);
  }
}

function chartArrayByType(type) {
  if (type === 'entry') return state.draftEntryCharts;
  if (type === 'exit') return state.draftExitCharts;
  return state.draftLiveCharts;
}

const CHART_TIMEFRAMES = ['Month','Week','Day','4H','2H','1H','30m','15m','5m','3m','1m'];
const DEFAULT_TIMEFRAME = 'Day';

function emptyChartItem() {
  return { timeframe: DEFAULT_TIMEFRAME, url: '' };
}

function cloneChartItems(items) {
  return Array.isArray(items)
    ? items.map(item => {
        if (item && typeof item === 'object') {
          return { timeframe: CHART_TIMEFRAMES.includes(item.timeframe) ? item.timeframe : DEFAULT_TIMEFRAME, url: String(item.url || '').trim() };
        }
        return { timeframe: DEFAULT_TIMEFRAME, url: String(item || '').trim() };
      })
    : [];
}

function chartItemIsFilled(item) {
  return !!sanitizeUrl(item?.url || '');
}

function normalizeChartDraftArray(items) {
  const arr = cloneChartItems(items);
  while (arr.length > 1 && !chartItemIsFilled(arr[arr.length - 1]) && !chartItemIsFilled(arr[arr.length - 2])) arr.pop();
  if (!arr.length) arr.push(emptyChartItem());
  if (chartItemIsFilled(arr[arr.length - 1])) arr.push(emptyChartItem());
  return arr;
}

function compactChartArray(arr) {
  const normalized = normalizeChartDraftArray(arr);
  arr.splice(0, arr.length, ...normalized)
}

function chartRowLabel(type, timeframe) {
  const prefix = type === 'entry' ? 'Entry' : type === 'exit' ? 'Exit' : 'Live';
  return timeframe ? `${prefix} · ${timeframe}` : prefix;
}

function setChartItem(type, index, patch) {
  const arr = chartArrayByType(type);
  arr[index] = {
    ...emptyChartItem(),
    ...(arr[index] && typeof arr[index] === 'object' ? arr[index] : {}),
    ...patch,
  };
  compactChartArray(arr);
  renderChartInputs(type);
  markDirty();
  persistDraft();
  updatePreview();
}

function openEvidenceModal(source, label = 'Chart evidence') {
  const safeUrl = sanitizeUrl(source);
  if (!safeUrl) return;
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}

function bindEvidenceOpeners(scope = document) {
  scope.querySelectorAll('.js-evidence-open').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEvidenceModal(btn.dataset.source || '', btn.dataset.label || 'Chart evidence');
    };
  });
}

function renderEvidenceItems(items, options = {}) {
  const emptyText = options.emptyText || '차트 증거 없음';
  const cssClass = options.cssClass || 'evidence-gallery';
  const arr = Array.isArray(items) ? items.filter(item => sanitizeUrl(item?.url)) : [];
  if (!arr.length) return `<div class="${cssClass}"><span class="chip">${escapeHtml(emptyText)}</span></div>`;
  return `<div class="${cssClass}">${arr.map(item => {
    const safeUrl = sanitizeUrl(item.url);
    const label = escapeHtml(item.label || 'Chart');
    return `<button type="button" class="evidence-link-chip js-evidence-open" data-source="${escapeAttr(safeUrl)}" data-label="${escapeAttr(item.label || 'Chart')}">📈 ${label}</button>`;
  }).join('')}</div>`;
}
bootstrap();
hydratePersistentState().catch(error => console.error('[post-bootstrap hydration]', error));

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


function openGuideModal() {
  if (!els['guide-modal']) return;
  els['guide-modal'].classList.add('show');
  document.body.classList.add('modal-open');
}

function closeGuideModal() {
  if (!els['guide-modal']) return;
  els['guide-modal'].classList.remove('show');
  document.body.classList.remove('modal-open');
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}

function swapArray(arr, idx1, idx2) {
  if (idx1 < 0 || idx1 >= arr.length || idx2 < 0 || idx2 >= arr.length) return;
  const temp = arr[idx1];
  arr[idx1] = arr[idx2];
  arr[idx2] = temp;
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
  renderQuickLaunch();
}

function openListManager(key, title, casing) {
  if(!els['list-manage-modal']) return;
  els['list-manage-modal'].classList.add('show');
  setText('list-manage-title', title + ' 관리');
  els['list-manage-input'].value = '';

  const renderItems = () => {
    const arr = state.db.meta[key] || [];
    els['list-manage-items'].innerHTML = arr.length ? arr.map((item, idx) => `
      <div class="list-manage-row">
        <span style="font-weight:800;">${escapeHtml(item)}</span>
        <div class="row-actions">
          <button type="button" class="btn-icon-sm btn-up" data-idx="${idx}" title="위로">↑</button>
          <button type="button" class="btn-icon-sm btn-down" data-idx="${idx}" title="아래로">↓</button>
          <button type="button" class="btn-icon-sm btn-del-item danger-text" data-idx="${idx}" title="삭제">✕</button>
        </div>
      </div>
    `).join('') : emptyState('등록된 항목이 없습니다.');

    els['list-manage-items'].querySelectorAll('.btn-up').forEach(btn => btn.onclick = (e) => {
      swapArray(arr, Number(e.target.dataset.idx), Number(e.target.dataset.idx) - 1);
      saveDB(state.db); renderItems(); renderDropdowns();
    });
    els['list-manage-items'].querySelectorAll('.btn-down').forEach(btn => btn.onclick = (e) => {
      swapArray(arr, Number(e.target.dataset.idx), Number(e.target.dataset.idx) + 1);
      saveDB(state.db); renderItems(); renderDropdowns();
    });
    els['list-manage-items'].querySelectorAll('.btn-del-item').forEach(btn => btn.onclick = (e) => {
      arr.splice(e.target.dataset.idx, 1);
      saveDB(state.db); renderItems(); renderDropdowns(); renderQuickChips();
    });
  };

  els['list-manage-add'].onclick = () => {
    let val = els['list-manage-input'].value.trim();
    if (!val) return;
    val = casing === 'upper' ? val.toUpperCase() : val.toLowerCase();
    if (!state.db.meta[key]) state.db.meta[key] = [];
    const arr = state.db.meta[key];
    if (!arr.includes(val)) {
      arr.push(val);
      saveDB(state.db);
      els['list-manage-input'].value = '';
      renderItems(); renderDropdowns(); renderQuickChips();
    } else {
      showModal({ type: 'ALERT', title: '오류', desc: '이미 존재하는 항목입니다.' });
    }
  };

  renderItems();
}

function openQuickLinkManager() {
  if(!els['ql-modal']) return;
  els['ql-modal'].classList.add('show');
  setVal('ql-name', ''); setVal('ql-url', ''); setVal('ql-icon', '');

  const renderItems = () => {
    const arr = state.db.meta.quickLinks || [];
    els['ql-items'].innerHTML = arr.length ? arr.map((item, idx) => `
      <div class="list-manage-row">
        <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
          <span style="font-size:16px;">${escapeHtml(item.icon || '🔗')}</span>
          <strong style="font-weight:800; white-space:nowrap;">${escapeHtml(item.name)}</strong>
          <span style="color:var(--muted); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.url)}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-icon-sm btn-up" data-idx="${idx}">↑</button>
          <button type="button" class="btn-icon-sm btn-down" data-idx="${idx}">↓</button>
          <button type="button" class="btn-icon-sm btn-del-item danger-text" data-idx="${idx}">✕</button>
        </div>
      </div>
    `).join('') : emptyState('등록된 링크가 없습니다.');

    els['ql-items'].querySelectorAll('.btn-up').forEach(btn => btn.onclick = (e) => {
      swapArray(arr, Number(e.target.dataset.idx), Number(e.target.dataset.idx) - 1);
      saveDB(state.db); renderItems(); renderQuickLaunch();
    });
    els['ql-items'].querySelectorAll('.btn-down').forEach(btn => btn.onclick = (e) => {
      swapArray(arr, Number(e.target.dataset.idx), Number(e.target.dataset.idx) + 1);
      saveDB(state.db); renderItems(); renderQuickLaunch();
    });
    els['ql-items'].querySelectorAll('.btn-del-item').forEach(btn => btn.onclick = (e) => {
      arr.splice(e.target.dataset.idx, 1);
      saveDB(state.db); renderItems(); renderQuickLaunch();
    });
  };

  els['ql-add'].onclick = () => {
    const name = getVal('ql-name').trim();
    const url = getVal('ql-url').trim();
    const icon = getVal('ql-icon').trim();
    if (!name || !url) { showModal({ type: 'ALERT', title: '입력 오류', desc: '이름과 URL은 필수입니다.' }); return; }
    if (!state.db.meta.quickLinks) state.db.meta.quickLinks = [];
    state.db.meta.quickLinks.push({ name, url: sanitizeUrl(url), icon: icon || '🔗' });
    saveDB(state.db);
    setVal('ql-name', ''); setVal('ql-url', ''); setVal('ql-icon', '');
    renderItems(); renderQuickLaunch();
  };

  renderItems();
}

function bindEvents() {
  if(els['modal-btn-cancel']) els['modal-btn-cancel'].onclick = () => { hideModal(); if (modalCallback) modalCallback(null); };
  if(els['modal-btn-confirm']) els['modal-btn-confirm'].onclick = () => {
    hideModal();
    if (modalCallback) {
      const inp = els['modal-input'];
      modalCallback(inp.style.display === 'block' ? inp.value : true);
    }
  };
  
  if(els['list-manage-close']) els['list-manage-close'].onclick = () => els['list-manage-modal'].classList.remove('show');
  if(els['ql-close']) els['ql-close'].onclick = () => els['ql-modal'].classList.remove('show');
  if(els['open-guide-btn']) els['open-guide-btn'].onclick = () => openGuideModal();
  if(els['guide-close']) els['guide-close'].onclick = () => closeGuideModal();
  if(els['guide-modal']) els['guide-modal'].addEventListener('click', (e) => { if (e.target === els['guide-modal']) closeGuideModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els['guide-modal']?.classList.contains('show')) closeGuideModal();
  });

  if(els['btn-manage-ticker']) els['btn-manage-ticker'].onclick = () => openListManager('tickers', '티커', 'upper');
  if(els['btn-manage-setup-entry']) els['btn-manage-setup-entry'].onclick = () => openListManager('entrySetups', 'Entry Setup', 'upper');
  if(els['btn-manage-setup-exit']) els['btn-manage-setup-exit'].onclick = () => openListManager('exitSetups', 'Exit Setup', 'upper');
  if(els['btn-manage-quick-links']) els['btn-manage-quick-links'].onclick = () => openQuickLinkManager();

  if(els['btn-context-structure']) els['btn-context-structure'].onclick = () => appendTemplateToField('context', '시장 구조: \n유동성 위치: \n핵심 변수: ');
  if(els['btn-context-catalyst']) els['btn-context-catalyst'].onclick = () => appendTemplateToField('context', '뉴스 / 촉매: \n체크할 변수: ');
  if(els['btn-thesis-trigger']) els['btn-thesis-trigger'].onclick = () => appendTemplateToField('thesis', '엔트리 트리거: \n추가 진입 조건: ');
  if(els['btn-thesis-invalidation']) els['btn-thesis-invalidation'].onclick = () => appendTemplateToField('thesis', '무효화 기준: \n청산 계획: ');

  initJournalSidebarSync();
  initStatusToggle();

  if(els['btn-now']) els['btn-now'].onclick = () => { pushUndoSnapshot(); setVal('trade-date', inputDate(nowIso())); markDirty(); updatePreview(); persistDraft(); };
  if(els['btn-end-now']) els['btn-end-now'].onclick = () => { pushUndoSnapshot(); setVal('status', 'CLOSED'); if (typeof initStatusToggle === 'function') initStatusToggle(); setVal('trade-end-date', inputDate(nowIso())); markDirty(); updatePreview(); persistDraft(); };
  if(els['prev-month']) els['prev-month'].onclick = () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); };
  if(els['next-month']) els['next-month'].onclick = () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); };

  if(els['add-entry']) els['add-entry'].onclick = () => { pushUndoSnapshot(); state.draftEntries.push({ price: 0, type: 'M', weight: 0, leverage: Math.max(1, Number(getVal('leverage') || 1)) }); renderLegs('entry'); updatePreview(); persistDraft(); };
  if(els['add-exit']) els['add-exit'].onclick = () => { pushUndoSnapshot(); state.draftExits.push({ price: 0, type: 'M', weight: 0, status: 'PLANNED' }); renderLegs('exit'); updatePreview(); persistDraft(); };
  if(els['btn-generate-plan']) els['btn-generate-plan'].onclick = () => { updatePreview(); refreshJournalStatus('추천 플랜 재계산'); };
  if(els['btn-apply-plan']) els['btn-apply-plan'].onclick = applyPlannerSuggestion;
  
  if(els['add-entry-chart']) els['add-entry-chart'].onclick = () => { pushUndoSnapshot(); state.draftEntryCharts.push(emptyChartItem()); renderChartInputs('entry'); updatePreview(); persistDraft(); };
  if(els['add-exit-chart']) els['add-exit-chart'].onclick = () => { pushUndoSnapshot(); state.draftExitCharts.push(emptyChartItem()); renderChartInputs('exit'); updatePreview(); persistDraft(); };
  if(els['add-live-chart']) els['add-live-chart'].onclick = () => { pushUndoSnapshot(); state.draftLiveCharts.push(emptyChartItem()); renderChartInputs('live'); updatePreview(); persistDraft(); };

  if(els['reset-form']) els['reset-form'].onclick = resetForm;
  if(els['delete-trade']) els['delete-trade'].onclick = deleteTrade;
  if(els['duplicate-trade']) els['duplicate-trade'].onclick = () => { pushUndoSnapshot(); duplicateTrade(); };
  if(els['undo-journal']) els['undo-journal'].onclick = undoJournal;
  if(els['trade-form']) {
    els['trade-form'].addEventListener('submit', handleSubmit);
    els['trade-form'].addEventListener('keydown', handleJournalEnterKey);
    els['trade-form'].addEventListener('focusin', handleJournalFocusIn);
    els['trade-form'].addEventListener('input', handleJournalUndoInput, true);
    els['trade-form'].addEventListener('change', handleJournalUndoInput, true);
  }

  if(els['force-save-draft']) els['force-save-draft'].onclick = () => { persistDraft(true); saveDB(state.db); refreshJournalStatus('임시저장 완료'); };
  if(els['export-json']) els['export-json'].onclick = () => exportDB(state.db);
  if(els['import-json-btn']) els['import-json-btn'].onclick = () => els['import-json'].click();
  if(els['import-json']) els['import-json'].onchange = handleImport;

  if(els['overview-search']) els['overview-search'].onclick = () => renderOverview();
  if(els['overview-clear']) els['overview-clear'].onclick = () => { setVal('overview-from', ''); setVal('overview-to', ''); renderOverview(); };

  const filterIds = ['q','f-from','f-to','f-status','f-side','f-setup','f-tag','f-mistake','f-grade','sort'];
  filterIds.forEach(id => {
    if(els[id]) {
      els[id].addEventListener('input', renderLibrary);
      els[id].addEventListener('change', renderLibrary);
    }
  });
  if(els['clear-filters']) els['clear-filters'].onclick = clearFilters;

  if(els['prev-trade']) els['prev-trade'].onclick = () => stepSelectedTrade(-1);
  if(els['next-trade']) els['next-trade'].onclick = () => stepSelectedTrade(1);
  if(els['filter-same-setup']) els['filter-same-setup'].onclick = filterBySelectedSetup;
  if(els['filter-same-ticker']) els['filter-same-ticker'].onclick = filterBySelectedTicker;
  if(els['clear-quick-filter']) els['clear-quick-filter'].onclick = clearQuickFilter;

  if(els['btn-insert-time']) els['btn-insert-time'].onclick = () => insertLiveNote('');
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
  
  document.querySelectorAll('textarea.auto-resize').forEach(ta => {
    ta.addEventListener('input', function() { autoResize(this); });
  });

  if(els['desk-rules']) {
    els['desk-rules'].addEventListener('input', function() {
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

  bindKeyboardShortcuts();

  [
    'trade-date','trade-end-date','ticker','status','side','setup-entry','setup-exit',
    'account-size','risk-pct','leverage','current-price','planner-mode','planner-legs','planner-weight-mode','btn-generate-plan','btn-apply-plan','planner-summary','maker-fee','taker-fee','stop-price','target-price','stop-type','price-map-distance-summary',
    'context','thesis','review','tags','mistakes','grade','live-notes'
  ].forEach(id => {
    if (!els[id]) return;
    els[id].addEventListener('input', handleFormMutation);
    els[id].addEventListener('change', handleFormMutation);
  });

  if (els['leverage']) {
    const syncLeverage = () => {
      const lev = Math.max(1, Number(getVal('leverage') || 1));
      state.draftEntries = state.draftEntries.map(row => ({ ...row, leverage: lev }));
      renderLegs('entry');
      handleFormMutation();
    };
    els['leverage'].addEventListener('change', syncLeverage);
  }
}

function handleFormMutation() {
  markDirty();
  updatePreview();
  persistDraft();
}

const JOURNAL_SNAPSHOT_FIELDS = [
  'trade-id','trade-date','trade-end-date','ticker','status','side','setup-entry','setup-exit','grade',
  'account-size','risk-pct','leverage','current-price','planner-mode','planner-legs','planner-weight-mode',
  'maker-fee','taker-fee','stop-price','target-price','stop-type','context','thesis','review','live-notes','tags','mistakes'
];

function captureJournalSnapshot() {
  return {
    fields: Object.fromEntries(JOURNAL_SNAPSHOT_FIELDS.map(id => [id, getVal(id)])),
    entries: cloneRows(state.draftEntries),
    exits: cloneRows(state.draftExits),
    entryCharts: cloneChartItems(state.draftEntryCharts),
    exitCharts: cloneChartItems(state.draftExitCharts),
    liveCharts: cloneChartItems(state.draftLiveCharts),
    checkedRules: getCheckedRules(),
  };
}

function sameSnapshot(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function pushUndoSnapshot(snapshot = null) {
  if (state.suspendUndo) return;
  const snap = snapshot || captureJournalSnapshot();
  const last = state.undoStack[state.undoStack.length - 1];
  if (sameSnapshot(last, snap)) return;
  state.undoStack.push(snap);
  if (state.undoStack.length > 60) state.undoStack.shift();
  updateUndoButton();
}

function updateUndoButton() {
  if (!els['undo-journal']) return;
  const enabled = state.undoStack.length > 0;
  els['undo-journal'].disabled = !enabled;
  els['undo-journal'].classList.toggle('disabled', !enabled);
}

function applyJournalSnapshot(snapshot, options = {}) {
  if (!snapshot) return;
  state.suspendUndo = true;
  JOURNAL_SNAPSHOT_FIELDS.forEach(id => setVal(id, snapshot.fields?.[id] ?? ''));
  state.draftEntries = cloneRows(snapshot.entries || [{ price: 0, type: 'M', weight: 100, leverage: Math.max(1, Number(getVal('leverage') || 1)) }]);
  state.draftExits = cloneRows(snapshot.exits || []);
  state.draftEntryCharts = normalizeChartDraftArray(snapshot.entryCharts);
  state.draftExitCharts = normalizeChartDraftArray(snapshot.exitCharts);
  state.draftLiveCharts = normalizeChartDraftArray(snapshot.liveCharts);
  renderLegs('entry');
  renderLegs('exit');
  renderChartInputs('entry');
  renderChartInputs('exit');
  renderChartInputs('live');
  renderTradeChecklist(snapshot.checkedRules || []);
  if (typeof initStatusToggle === 'function') initStatusToggle();
  document.querySelectorAll('textarea.auto-resize').forEach(ta => autoResize(ta));
  state.suspendUndo = false;
  updatePreview();
  persistDraft(true);
  if (options.markDirty !== false) markDirty();
}

function undoJournal() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) return;
  updateUndoButton();
  applyJournalSnapshot(snapshot);
  refreshJournalStatus('이전 입력으로 되돌렸습니다.');
}

function handleJournalFocusIn(event) {
  if (state.suspendUndo) return;
  const target = event.target;
  const tag = (target?.tagName || '').toLowerCase();
  if (!['input','textarea','select'].includes(tag)) return;
  if (!target.closest('#trade-form')) return;
  state.undoAnchor = captureJournalSnapshot();
  state.undoAnchorConsumed = false;
}

function handleJournalUndoInput(event) {
  if (state.suspendUndo) return;
  const target = event.target;
  if (!target?.closest?.('#trade-form')) return;
  const tag = (target.tagName || '').toLowerCase();
  if (!['input','textarea','select'].includes(tag)) return;
  if (!state.undoAnchorConsumed && state.undoAnchor) {
    pushUndoSnapshot(state.undoAnchor);
    state.undoAnchorConsumed = true;
  }
}

function handleJournalEnterKey(event) {
  if (event.key !== 'Enter') return;
  const target = event.target;
  const tag = (target?.tagName || '').toLowerCase();
  if (tag === 'textarea') return;
  if (!['input','select'].includes(tag)) return;
  if (target.classList.contains('entry-chart-input') || target.classList.contains('exit-chart-input') || target.classList.contains('live-chart-input')) return;
  event.preventDefault();
  target.dispatchEvent(new Event(tag === 'select' ? 'change' : 'input', { bubbles: true }));
  handleFormMutation();
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
  if(!els['nav']) return;
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
    if(els[`view-${view}`]) els[`view-${view}`].classList.toggle('active', state.view === view);
  });
  renderNav();
  
  if (state.view === 'journal') {
    setTimeout(() => {
      document.querySelectorAll('textarea.auto-resize').forEach(ta => autoResize(ta));
    }, 10);
  }
  
  if (state.view === 'library') safeCall('renderLibrary(view)', () => renderLibrary());
  if (state.view === 'playbook') safeCall('renderPlaybook(view)', () => renderPlaybook());
  if (state.view === 'overview') safeCall('renderOverview(view)', () => renderOverview());
}

function render() {
  safeCall('renderViews', () => renderViews());
  safeCall('renderOverview', () => renderOverview());
  safeCall('renderLibrary', () => renderLibrary());
  safeCall('renderPlaybook', () => renderPlaybook());
  safeCall('renderAccountBalance', () => renderAccountBalance());
  safeCall('renderMasterChecklist', () => renderMasterChecklist());
  safeCall('updatePreview', () => updatePreview());
}


function renderQuickLaunch() {
  if(!els['quick-launch-grid']) return;
  const links = state.db.meta.quickLinks || [];
  els['quick-launch-grid'].innerHTML = links.map((lnk) => `
    <a href="${escapeAttr(lnk.url)}" target="_blank" rel="noopener noreferrer" class="quick-link-card">
      <div class="quick-link-icon">${escapeHtml(lnk.icon || '🔗')}</div>
      <div>${escapeHtml(lnk.name)}</div>
    </a>
  `).join('');
}

window.__desk_del_check = (idx) => {
  state.db.meta.checklists.splice(idx, 1);
  saveDB(state.db); renderMasterChecklist(); renderTradeChecklist();
};
window.__desk_move_check = (idx, dir) => {
  swapArray(state.db.meta.checklists, idx, idx + dir);
  saveDB(state.db); renderMasterChecklist(); renderTradeChecklist();
};

function renderMasterChecklist() {
  if(!els['master-checklist-list']) return;
  const list = state.db.meta.checklists || [];
  els['master-checklist-list'].innerHTML = list.length ? list.map((item, idx) => `
    <div class="list-manage-row" style="background:#fff; border:1px solid var(--line); padding:10px 12px; border-radius:12px; margin-bottom:8px;">
      <span style="font-size:12px; font-weight:800; flex:1;">${escapeHtml(item)}</span>
      <div class="row-actions">
        <button type="button" class="btn-icon-sm" onclick="window.__desk_move_check(${idx}, -1)">↑</button>
        <button type="button" class="btn-icon-sm" onclick="window.__desk_move_check(${idx}, 1)">↓</button>
        <button type="button" class="btn-icon-sm danger-text" onclick="window.__desk_del_check(${idx})">✕</button>
      </div>
    </div>
  `).join('') : '<span class="muted-caption" style="font-size:12px;">등록된 체크리스트가 없습니다.</span>';
}

function renderTradeChecklist(checkedValues = []) {
  if(!els['trade-checklist-container']) return;
  const list = state.db.meta.checklists || [];
  if(!list.length) {
    els['trade-checklist-container'].innerHTML = '<span style="color:var(--muted); font-size:12px; font-weight:700;">사이드바 Desk Rules에서 체크리스트를 먼저 추가해주세요.</span>';
    return;
  }
  els['trade-checklist-container'].innerHTML = list.map(item => `
    <label class="check-inline">
      <input type="checkbox" value="${escapeAttr(item)}" class="trade-check-item" ${checkedValues.includes(item) ? 'checked' : ''}>
      <span>${escapeHtml(item)}</span>
    </label>
  `).join('');

  els['trade-checklist-container'].querySelectorAll('input').forEach(chk => {
    chk.addEventListener('change', () => { pushUndoSnapshot(); handleFormMutation(); });
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
  if(!els[id]) return;
  const current = getVal(id);
  els[id].innerHTML = rows.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  if (rows.includes(current)) els[id].value = current;
}

function renderQuickChips() {
  if(els['quick-tags']) {
    els['quick-tags'].innerHTML = state.db.meta.tagPresets.map(tag => `<button type="button" class="chip-btn" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('');
    els['quick-tags'].querySelectorAll('button').forEach(btn => btn.onclick = () => appendCsvValue('tags', btn.dataset.tag));
  }
  if(els['quick-mistakes']) {
    els['quick-mistakes'].innerHTML = state.db.meta.mistakePresets.map(tag => `<button type="button" class="chip-btn" data-mistake="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');
    els['quick-mistakes'].querySelectorAll('button').forEach(btn => btn.onclick = () => appendCsvValue('mistakes', btn.dataset.mistake));
  }
}

function renderChartInputs(type) {
  let arr, containerId;
  if(type === 'entry') { arr = state.draftEntryCharts; containerId = 'entry-charts-container'; }
  else if(type === 'exit') { arr = state.draftExitCharts; containerId = 'exit-charts-container'; }
  else { arr = state.draftLiveCharts; containerId = 'live-charts-container'; }

  const container = els[containerId];
  if (!container) return;
  compactChartArray(arr);

  container.innerHTML = arr.map((item, idx) => {
    const safeUrl = sanitizeUrl(item?.url || '');
    const timeframe = CHART_TIMEFRAMES.includes(item?.timeframe) ? item.timeframe : DEFAULT_TIMEFRAME;
    const label = chartRowLabel(type, timeframe);
    return `
      <div class="chart-link-row" data-type="${type}" data-index="${idx}">
        <div class="input-group flex-group chart-link-input-group chart-link-grid">
          <select class="chart-timeframe-select" data-index="${idx}">
            ${CHART_TIMEFRAMES.map(tf => `<option value="${tf}" ${tf === timeframe ? 'selected' : ''}>${tf}</option>`).join('')}
          </select>
          <input type="text" class="${type}-chart-input" value="${escapeAttr(item?.url || '')}" placeholder="TradingView 링크를 붙여넣고 Enter를 누르세요" data-index="${idx}" />
          ${safeUrl ? `<button type="button" class="chart-link-btn js-evidence-open" data-source="${escapeAttr(safeUrl)}" data-label="${escapeAttr(label)}">🔗 보기</button>` : '<span class="chart-link-btn disabled">링크 대기</span>'}
          ${safeUrl ? `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="chart-link-btn subtle">↗</a>` : ''}
          <button type="button" class="tool-btn btn-del-${type}-chart danger-text fixed-btn" data-index="${idx}">✕</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.chart-timeframe-select').forEach(select => {
    select.onchange = (e) => {
      const idx = Number(e.target.dataset.index);
      setChartItem(type, idx, { timeframe: e.target.value });
    };
  });

  container.querySelectorAll(`.${type}-chart-input`).forEach(input => {
    input.oninput = (e) => {
      const idx = Number(e.target.dataset.index);
      const current = arr[idx] || emptyChartItem();
      arr[idx] = { ...current, url: e.target.value };
      markDirty();
      persistDraft();
    };
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const idx = Number(e.target.dataset.index);
      const sanitized = sanitizeUrl(e.target.value);
      if (!sanitized) {
        arr[idx] = { ...(arr[idx] || emptyChartItem()), url: '' };
        renderChartInputs(type);
        updatePreview();
        persistDraft();
        return;
      }
      setChartItem(type, idx, { url: sanitized });
    };
    input.onblur = (e) => {
      const idx = Number(e.target.dataset.index);
      const sanitized = sanitizeUrl(e.target.value);
      arr[idx] = { ...(arr[idx] || emptyChartItem()), url: sanitized || '' };
      compactChartArray(arr);
      markDirty();
      persistDraft();
      renderChartInputs(type);
      updatePreview();
    };
  });

  container.querySelectorAll(`.btn-del-${type}-chart`).forEach(btn => {
    btn.onclick = (e) => {
      pushUndoSnapshot();
      arr.splice(Number(e.currentTarget.dataset.index), 1);
      compactChartArray(arr);
      renderChartInputs(type);
      markDirty();
      persistDraft();
      updatePreview();
    };
  });

  bindEvidenceOpeners(container);
}

function hydrateInitialForm() {
  const tpl = state.db.meta.lastTradeForm || {};
  setVal('trade-date', inputDate(nowIso()));
  setVal('account-size', tpl.accountSize || Math.round(Number(state.db.meta.accountBalance || 10000)));
  setVal('risk-pct', tpl.riskPct || 0.5);
  setVal('leverage', tpl.leverage || 5);
  setVal('planner-mode', tpl.plannerMode || 'BALANCED');
  setVal('planner-legs', tpl.plannerLegs || 3);
  setVal('planner-weight-mode', tpl.plannerWeightMode || 'BACKLOADED');
  setVal('maker-fee', tpl.makerFee || 0.02);
  setVal('taker-fee', tpl.takerFee || 0.05);
  setVal('target-price', ''); // 폼 초기화 시 목표가는 비움
  
  setVal('desk-rules', state.db.meta.rules || '');
  setTimeout(() => autoResize(els['desk-rules']), 0);
  
  state.draftEntries = [{ price: 0, type: 'M', weight: 100, leverage: Math.max(1, Number(getVal('leverage') || 1)) }];
  state.draftExits = [];
  state.draftEntryCharts = [emptyChartItem()];
  state.draftExitCharts = [emptyChartItem()];
  state.draftLiveCharts = [emptyChartItem()];
  renderLegs('entry');
  renderLegs('exit');
  renderChartInputs('entry');
  renderChartInputs('exit');
  renderChartInputs('live');
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

function renderLegs(kind) {
  const key = kind === 'entry' ? 'draftEntries' : 'draftExits';
  const target = els[kind === 'entry' ? 'entries' : 'exits'];
  if(!target) return;

  target.innerHTML = state[key].map((leg, index) => {
    if (kind === 'entry') {
      return `
        <div class="leg-row" data-kind="${kind}" data-index="${index}">
          <div class="input-with-unit">
            <span class="unit left">$</span>
            <input type="number" step="0.01" class="leg-price" value="${safeNumber(leg.price)}" placeholder="Entry Price" />
          </div>
          <select class="leg-type" style="width: 100%;">
            <option value="M" ${leg.type === 'M' ? 'selected' : ''}>Maker</option>
            <option value="T" ${leg.type === 'T' ? 'selected' : ''}>Taker</option>
          </select>
          <div class="input-with-unit">
            <input type="number" step="0.01" class="leg-weight" value="${safeNumber(leg.weight)}" placeholder="Risk Share" />
            <span class="unit right">%</span>
          </div>
          <div class="input-with-unit">
            <input type="number" step="0.1" class="leg-leverage" value="${safeNumber(leg.leverage || getVal('leverage') || 1)}" placeholder="Lev" />
            <span class="unit right">x</span>
          </div>
          <button type="button" class="tool-btn leg-delete danger-text" style="color:var(--muted); border-color:var(--line);">✕</button>
        </div>
      `;
    }
    return `
      <div class="leg-row" data-kind="${kind}" data-index="${index}">
        <div class="input-with-unit">
          <span class="unit left">$</span>
          <input type="number" step="0.01" class="leg-price" value="${safeNumber(leg.price)}" placeholder="Exit / Target Price" />
        </div>
        <select class="leg-type" style="width: 100%;">
          <option value="M" ${leg.type === 'M' ? 'selected' : ''}>Maker</option>
          <option value="T" ${leg.type === 'T' ? 'selected' : ''}>Taker</option>
        </select>
        <div class="input-with-unit">
          <input type="number" step="0.01" class="leg-weight" value="${safeNumber(leg.weight)}" placeholder="Close %" />
          <span class="unit right">%</span>
        </div>
        <select class="leg-status" style="width:100%;">
          <option value="PLANNED" ${leg.status === 'FILLED' ? '' : 'selected'}>Planned</option>
          <option value="FILLED" ${leg.status === 'FILLED' ? 'selected' : ''}>Filled</option>
        </select>
        <button type="button" class="tool-btn leg-delete danger-text" style="color:var(--muted); border-color:var(--line);">✕</button>
      </div>
    `;
  }).join('');

  target.querySelectorAll('.leg-row').forEach(row => {
    const index = Number(row.dataset.index);
    row.querySelector('.leg-price').addEventListener('input', event => updateLeg(kind, index, 'price', event.target.value));
    row.querySelector('.leg-type').addEventListener('change', event => updateLeg(kind, index, 'type', event.target.value));
    row.querySelector('.leg-weight').addEventListener('input', event => updateLeg(kind, index, 'weight', event.target.value));
    const lev = row.querySelector('.leg-leverage');
    if (lev) lev.addEventListener('input', event => updateLeg(kind, index, 'leverage', event.target.value));
    const status = row.querySelector('.leg-status');
    if (status) status.addEventListener('change', event => updateLeg(kind, index, 'status', event.target.value));
    row.querySelector('.leg-delete').onclick = () => deleteLeg(kind, index);
  });
}

function updateLeg(kind, index, field, value) {
  const rows = kind === 'entry' ? state.draftEntries : state.draftExits;
  rows[index][field] = ['type','status'].includes(field) ? value : Number(value || 0);
  markDirty();
  updatePreview();
  persistDraft();
}

function deleteLeg(kind, index) {
  pushUndoSnapshot();
  const rows = kind === 'entry' ? state.draftEntries : state.draftExits;
  rows.splice(index, 1);
  if (kind === 'entry' && !rows.length) rows.push({ price: 0, type: 'M', weight: 100, leverage: Math.max(1, Number(getVal('leverage') || 1)) });
  renderLegs(kind);
  markDirty();
  updatePreview();
  persistDraft();
}

function resetFormForce() {
  if (!state.suspendUndo) pushUndoSnapshot();
  clearDraft();
  state.selectedTradeId = null;
  state.dirty = false;

  [
    'trade-id','context','thesis','review','tags','mistakes','live-notes',
    'stop-price','target-price','current-price','trade-end-date'
  ].forEach(id => setVal(id, ''));
  setVal('planner-mode', 'BALANCED');
  setVal('planner-legs', 3);
  setVal('planner-weight-mode', 'BACKLOADED');

  setVal('trade-date', inputDate(nowIso()));
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
  setVal('planner-mode', tpl.plannerMode || 'BALANCED');
  setVal('planner-legs', tpl.plannerLegs || 3);
  setVal('planner-weight-mode', tpl.plannerWeightMode || 'BACKLOADED');
  setVal('maker-fee', tpl.makerFee || 0.02);
  setVal('taker-fee', tpl.takerFee || 0.05);

  state.draftEntries = [{ price: 0, type: 'M', weight: 100, leverage: Math.max(1, Number(getVal('leverage') || 1)) }];
  state.draftExits = [];
  state.draftEntryCharts = [emptyChartItem()];
  state.draftExitCharts = [emptyChartItem()];
  state.draftLiveCharts = [emptyChartItem()];
  
  renderLegs('entry');
  renderLegs('exit');
  renderChartInputs('entry');
  renderChartInputs('exit');
  renderChartInputs('live');
  renderTradeChecklist([]);
  
  setTimeout(() => {
    document.querySelectorAll('textarea.auto-resize').forEach(ta => autoResize(ta));
  }, 10);

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
  applyTradeToForm({ ...trade, id: '', date: nowIso() }, { keepId: false });
  refreshJournalStatus('복제본 편집 중');
}

function deleteTrade() {
  const id = getVal('trade-id');
  if (!id) return;
  deleteTradeById(id, { resetCurrent: true });
}

function deleteTradeById(id, options = {}) {
  if (!id) return;
  showModal({ type: 'CONFIRM', title: '트레이드 삭제', desc: '이 트레이드를 영구적으로 삭제하시겠습니까?' }, (res) => {
    if (!res) return;
    state.db.trades = state.db.trades.filter(trade => trade.id !== id);
    if (state.selectedTradeId === id) state.selectedTradeId = state.db.trades[0]?.id || null;
    saveDB(state.db);
    if (options.resetCurrent || getVal('trade-id') === id) resetFormForce();
    render();
    refreshJournalStatus('트레이드 삭제 완료');
  });
}

function readForm() {
  const trade = {
    id: getVal('trade-id') || crypto.randomUUID(),
    date: getVal('trade-date') ? readDateInputAsIso(getVal('trade-date')) : nowIso(),
    ticker: getVal('ticker'),
    status: getVal('status'),
    side: getVal('side'),
    setupEntry: getVal('setup-entry'),
    setupExit: getVal('setup-exit'),
    grade: getVal('grade'),
    accountSize: Number(getVal('account-size') || 0),
    riskPct: Number(getVal('risk-pct') || 0),
    leverage: Number(getVal('leverage') || 0),
    currentPrice: Number(getVal('current-price') || 0),
    plannerMode: getVal('planner-mode') || 'BALANCED',
    plannerLegs: Number(getVal('planner-legs') || 3),
    plannerWeightMode: getVal('planner-weight-mode') || 'BACKLOADED',
    makerFee: Number(getVal('maker-fee') || 0),
    takerFee: Number(getVal('taker-fee') || 0),
    stopPrice: Number(getVal('stop-price') || 0),
    targetPrice: Number(getVal('target-price') || 0),
    markPrice: Number(getVal('current-price') || 0),
    stopType: getVal('stop-type'),
    context: getVal('context'),
    thesis: getVal('thesis'),
    review: getVal('review'),
    liveNotes: getVal('live-notes'),
    tags: splitCsv(getVal('tags')),
    mistakes: splitCsv(getVal('mistakes')),
    checkedRules: getCheckedRules(),
    evidence: {
      entryCharts: state.draftEntryCharts.filter(chartItemIsFilled).map(item => ({ timeframe: item.timeframe || DEFAULT_TIMEFRAME, url: sanitizeUrl(item.url) })),
      exitCharts: state.draftExitCharts.filter(chartItemIsFilled).map(item => ({ timeframe: item.timeframe || DEFAULT_TIMEFRAME, url: sanitizeUrl(item.url) })),
      liveCharts: state.draftLiveCharts.filter(chartItemIsFilled).map(item => ({ timeframe: item.timeframe || DEFAULT_TIMEFRAME, url: sanitizeUrl(item.url) })),
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
    showModal({ type: 'ALERT', title: '계산 오류', desc: `실제 체결(FILLED) 청산 비중 합계가 100%를 초과할 수 없습니다. (현재: ${trade.metrics.actualExitPct.toFixed(1)}%)` });
    return;
  }
  if (!trade.metrics.valid) {
    showModal({ type: 'ALERT', title: '입력 누락', desc: '손절가와 실제 진입 레그(가격 + Risk Share)를 먼저 입력해주세요.' });
    return;
  }
  if (trade.status === 'CLOSED' && trade.metrics.actualExitPct < 100) {
    showModal({ type: 'ALERT', title: '상태 오류', desc: 'CLOSED 저장 시에는 FILLED 청산 합계가 100%여야 합니다.' });
    return;
  }
  if (trade.status === 'OPEN' && trade.metrics.actualExitPct >= 100) {
    showModal({ type: 'ALERT', title: '상태 오류', desc: '실제 체결(FILLED) 청산이 100% 완료되었습니다. 상태를 CLOSED로 변경해주세요.' });
    return;
  }
  
  if (trade.grade === 'S' && trade.checkedRules.length < state.db.meta.checklists.length) {
    showModal({ type: 'ALERT', title: '원칙 위반 경고', desc: 'S등급은 설정한 원칙(체크리스트)을 100% 완벽히 지켰을 때만 부여할 수 있습니다.<br>체크리스트를 확인하거나 등급을 하향 조정하세요.' });
    return;
  }

  const existingIndex = state.db.trades.findIndex(row => row.id === trade.id);
  const existing = existingIndex >= 0 ? state.db.trades[existingIndex] : null;
  const enteredClosedAt = getVal('trade-end-date') ? readDateInputAsIso(getVal('trade-end-date')) : '';
  trade.updatedAt = nowIso();
  if (trade.status === 'CLOSED') {
    trade.closedAt = enteredClosedAt || existing?.closedAt || nowIso();
  } else {
    trade.closedAt = '';
  }
  if (existingIndex >= 0) {
    state.db.trades[existingIndex] = trade;
  } else {
    state.db.trades.unshift(trade);
  }

  state.db.meta.lastTradeForm = {
    accountSize: trade.accountSize,
    riskPct: trade.riskPct,
    leverage: trade.leverage,
    plannerMode: trade.plannerMode,
    plannerLegs: trade.plannerLegs,
    plannerWeightMode: trade.plannerWeightMode,
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
  setVal('trade-end-date', inputDate(trade.closedAt || ''));
  setVal('ticker', trade.ticker);
  setVal('status', trade.status);
  setVal('side', trade.side);
  setVal('setup-entry', trade.setupEntry);
  setVal('setup-exit', trade.setupExit);
  setVal('grade', trade.grade);
  setVal('account-size', trade.accountSize);
  setVal('risk-pct', trade.riskPct);
  setVal('leverage', trade.leverage);
  setVal('current-price', trade.currentPrice || trade.markPrice || '');
  setVal('planner-mode', trade.plannerMode || 'BALANCED');
  setVal('planner-legs', trade.plannerLegs || 3);
  setVal('planner-weight-mode', trade.plannerWeightMode || 'BACKLOADED');
  setVal('maker-fee', trade.makerFee);
  setVal('taker-fee', trade.takerFee);
  setVal('stop-price', trade.stopPrice || '');
  setVal('target-price', trade.targetPrice || '');
  if (typeof initStatusToggle === 'function') initStatusToggle();
  setVal('stop-type', trade.stopType);
  setVal('context', trade.context || '');
  setVal('thesis', trade.thesis || '');
  setVal('review', trade.review || '');
  setVal('live-notes', trade.liveNotes || '');
  setVal('tags', (trade.tags || []).join(', '));
  setVal('mistakes', (trade.mistakes || []).join(', '));
  
  state.draftEntryCharts = normalizeChartDraftArray(trade.evidence?.entryCharts);
  state.draftExitCharts = normalizeChartDraftArray(trade.evidence?.exitCharts);
  state.draftLiveCharts = normalizeChartDraftArray(trade.evidence?.liveCharts);
  state.draftEntries = cloneRows(trade.entries || [{ price: 0, type: 'M', weight: 100 }]);
  state.draftExits = cloneRows(trade.exits || []);
  
  renderLegs('entry');
  renderLegs('exit');
  renderChartInputs('entry');
  renderChartInputs('exit');
  renderChartInputs('live');
  renderTradeChecklist(trade.checkedRules || []); 
  
  setTimeout(() => {
    document.querySelectorAll('textarea.auto-resize').forEach(ta => autoResize(ta));
  }, 10);
  
  updatePreview();
}

// ✨ 화면 업데이트 및 영수증 실시간 렌더링
function updatePreview() {
  const trade = readForm();
  const metrics = trade.metrics;

  renderPreTradeBrief(trade);
  renderCalcSummary(metrics, trade);
  renderRiskPanel(metrics, trade);
  renderTradeEvaluation(metrics, trade);
  renderHoldingPreview(trade);
  renderPlannerModeNote(trade);
  renderPriceMapDistanceSummary(trade);
  renderPlannerSummary(trade);
  if (typeof initStatusToggle === 'function') initStatusToggle();

  if(els['risk-bep']) els['risk-bep'].textContent = metrics.breakEvenPrice > 0 ? safeNumber(metrics.breakEvenPrice.toFixed(4)) : '0.00';
}


function renderHoldingPreview(trade) {
  if (!els['holding-preview']) return;
  const start = trade.date;
  const end = trade.status === 'CLOSED' ? (getVal('trade-end-date') ? readDateInputAsIso(getVal('trade-end-date')) : (trade.closedAt || '')) : nowIso();
  const duration = start ? formatHoldingDuration(start, end) : '—';
  const endLabel = trade.status === 'CLOSED' ? (getVal('trade-end-date') ? formatDateTime(readDateInputAsIso(getVal('trade-end-date'))) : (trade.closedAt ? formatDateTime(trade.closedAt) : '종료 시간 미입력')) : 'OPEN 상태';
  setText('holding-preview', `홀딩시간 ${duration} · ${endLabel}`);
}

function renderPreTradeBrief(trade) {
  if (!els['pretrade-brief']) return;
  const bits = [
    trade.ticker || '티커 미선택',
    `${trade.side || '—'}`,
    trade.setupEntry || '셋업 미선택',
    trade.status || 'OPEN'
  ];
  const contextState = trade.context ? '컨텍스트 작성됨' : '컨텍스트 미작성';
  const thesisState = trade.thesis ? '진입 논리 작성됨' : '진입 논리 미작성';
  setHtml('pretrade-brief', `
    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px;">
      ${bits.map(bit => `<span class="subtle-pill">${escapeHtml(bit)}</span>`).join('')}
    </div>
    <div style="font-size:13px; color:#334155; line-height:1.7; font-weight:700;">${escapeHtml(contextState)} · ${escapeHtml(thesisState)} · 체크리스트 ${getCheckedRules().length}개 확인</div>
  `);
}

function renderPlannerModeNote(trade) {
  if (!els['planner-mode-note']) return;
  const mode = String(trade.plannerMode || 'BALANCED').toUpperCase();
  const notes = {
    SINGLE: '단일 진입은 확신 구간에서 한 번에 진입할 때 적합합니다. 체결은 단순하지만 평균단가 개선 여지는 적습니다.',
    BALANCED: '균형 분할은 현재가와 손절 사이를 무난하게 나눕니다. 방향이 맞지만 한 번에 크게 들어가고 싶지 않을 때 기본값으로 쓰기 좋습니다.',
    AVERAGING: '눌림 분할은 더 좋은 가격으로 평균단가를 개선하는 전략입니다. 명확한 손절과 재진입 계획이 있을 때만 유효합니다.',
    PYRAMID: '피라미딩은 수익 방향으로 추세가 확인될수록 추가 진입합니다. 브레이크아웃·추세 추종 환경에 적합하지만 과도한 추격 매수/매도는 피해야 합니다.'
  };
  setText('planner-mode-note', notes[mode] || notes.BALANCED);
}

function renderPriceMapDistanceSummary(trade) {
  if (!els['price-map-distance-summary']) return;
  const current = Number(trade.currentPrice || 0);
  const stop = Number(trade.stopPrice || 0);
  const target = Number(trade.targetPrice || 0);
  const lev = Math.max(1, Number(trade.leverage || 1));
  const metrics = trade.metrics || { projectedPnl: 0, projectedR: 0 };
  if (!current || !stop) {
    setHtml('price-map-distance-summary', '현재가, 손절가, 목표가를 입력하면 거리 비율과 손익 시나리오가 자동 계산됩니다.');
    return;
  }
  const stopMovePct = ((stop - current) / current) * 100;
  const stopBps = stopMovePct * 100;
  const targetMovePct = target ? ((target - current) / current) * 100 : 0;
  const targetBps = targetMovePct * 100;
  const rr = target ? Math.abs(target - current) / Math.max(0.0000001, Math.abs(current - stop)) : 0;
  const leveredStopImpact = Math.abs(stopMovePct) * lev;
  const projectedNet = Number(metrics.projectedPnl || 0);
  const projectedR = Number(metrics.projectedR || 0);
  setHtml('price-map-distance-summary', `
    <div class="price-map-kpis">
      <div class="price-map-kpi">
        <span class="label">손절 거리</span>
        <strong>${stopMovePct >= 0 ? '+' : ''}${stopMovePct.toFixed(2)}%</strong>
        <span class="meta">${stopBps >= 0 ? '+' : ''}${stopBps.toFixed(0)}bp · 레버리지 ${lev.toFixed(1)}x 기준 체감 ${leveredStopImpact.toFixed(2)}%</span>
      </div>
      <div class="price-map-kpi">
        <span class="label">목표 거리</span>
        <strong>${target ? `${targetMovePct >= 0 ? '+' : ''}${targetMovePct.toFixed(2)}%` : '미입력'}</strong>
        <span class="meta">${target ? `${targetBps >= 0 ? '+' : ''}${targetBps.toFixed(0)}bp` : '목표가 입력 필요'}</span>
      </div>
      <div class="price-map-kpi">
        <span class="label">목표 RR</span>
        <strong>${target ? `${rr.toFixed(2)}R` : '미계산'}</strong>
        <span class="meta">현재가·손절가·목표가 기준 이론 RR</span>
      </div>
      <div class="price-map-kpi">
        <span class="label">수수료 차감 후 예상 순손익</span>
        <strong class="${projectedNet > 0 ? 'positive' : projectedNet < 0 ? 'negative' : ''}">${target ? money(projectedNet) : '미계산'}</strong>
        <span class="meta">${target ? `Projected ${projectedR.toFixed(2)}R` : 'Entry/Target 구조 입력 시 반영'}</span>
      </div>
    </div>
  `);
}

function appendTemplateToField(id, template) {
  const prev = getVal(id).trim();
  const next = prev ? `${prev}
${template}` : template;
  setVal(id, next);
  if (els[id]) autoResize(els[id]);
  handleFormMutation();
}

function initStatusToggle() {
  const wrap = els['status-toggle'];
  const select = els['status'];
  if (!wrap || !select) return;
  const sync = () => {
    wrap.querySelectorAll('.status-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.value === select.value));
  };
  wrap.querySelectorAll('.status-chip').forEach(btn => {
    btn.onclick = () => {
      if (select.value === btn.dataset.value) return;
      pushUndoSnapshot();
      select.value = btn.dataset.value;
      if (btn.dataset.value === 'CLOSED' && !getVal('trade-end-date')) setVal('trade-end-date', inputDate(nowIso()));
      sync();
      handleFormMutation();
    };
  });
  select.onchange = () => sync();
  sync();
}

function initJournalSidebarSync() {
  const sidebar = els['journal-sidebar'];
  const riskPhase = els['journal-risk-phase'];
  const pretradePhase = els['journal-pretrade-phase'];
  const riskCard = els['risk-planner-card'];
  if (!sidebar) return;

  sidebar.addEventListener('wheel', (event) => {
    if (window.innerWidth <= 768) return;
    if (sidebar.scrollHeight <= sidebar.clientHeight) return;
    sidebar.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  const scrollSidebarTo = (targetTop) => {
    if (window.innerWidth <= 768) return;
    sidebar.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  };

  if (riskPhase && riskCard) {
    const syncRisk = () => scrollSidebarTo(riskCard.offsetTop - 10);
    riskPhase.addEventListener('mouseenter', syncRisk);
    riskPhase.addEventListener('focusin', syncRisk);
  }

  if (pretradePhase) {
    const syncTop = () => scrollSidebarTo(0);
    pretradePhase.addEventListener('mouseenter', syncTop);
    pretradePhase.addEventListener('focusin', syncTop);
  }
}


function renderTradeEvaluation(metrics, trade) {
  if (!els['eval-status-badge']) return;

  const isClosed = trade.status === 'CLOSED';
  const riskUsed = metrics.actualRiskUsed || 0;
  const riskBudget = metrics.riskDollar || 0;
  const projectedPnl = metrics.projectedPnl || metrics.unrealizedPnl || 0;
  const finalPnl = metrics.pnl || 0;
  const projectedR = metrics.projectedR || metrics.unrealizedR || 0;
  const finalR = metrics.r || 0;
  const riskUsage = riskBudget > 0 ? (riskUsed / riskBudget) * 100 : 0;

  els['eval-status-badge'].innerHTML = isClosed
    ? '<span style="color:#94a3b8;">FINAL (CLOSED)</span>'
    : '<span style="color:#60a5fa;">PROJECTED (OPEN)</span>';

  setText('assessment-risk-used', moneyAbs(riskUsed));
  setText('assessment-risk-budget', moneyAbs(riskBudget));
  setText('assessment-projected-pnl', money(projectedPnl));
  setText('assessment-final-pnl', money(finalPnl));
  setText('assessment-projected-r', `${projectedR.toFixed(2)}R`);
  setText('assessment-final-r', `${finalR.toFixed(2)}R`);
  setText('assessment-bep', metrics.breakEvenPrice > 0 ? safeNumber(metrics.breakEvenPrice.toFixed(4)) : '0.00');
  setText('assessment-residual', moneyAbs(metrics.residualRisk));
  setText('assessment-fees', moneyAbs(metrics.totalFees));
  setText('assessment-account-impact', `${metrics.accountImpact > 0 ? '+' : ''}${metrics.accountImpact.toFixed(2)}%`);

  const riskComment = riskUsage > 100
    ? `허용 리스크를 ${riskUsage.toFixed(1)}% 사용 중입니다. 규모 축소 또는 손절 재정의가 필요합니다.`
    : riskUsage > 80
      ? `허용 리스크를 ${riskUsage.toFixed(1)}% 사용 중입니다. 추가 진입은 매우 보수적으로 접근하는 편이 좋습니다.`
      : `허용 리스크 안에서 운영 중입니다. 현재 사용률은 ${riskUsage.toFixed(1)}%입니다.`;

  const executionComment = isClosed
    ? `실제 청산 비중은 ${metrics.actualExitPct.toFixed(1)}%이며 최종 결과는 ${money(finalPnl)} / ${finalR.toFixed(2)}R입니다.`
    : `현재 OPEN 상태이며 실제 청산 ${metrics.actualExitPct.toFixed(1)}%, 계획 청산 ${metrics.plannedExitPct.toFixed(1)}%가 설정되어 있습니다.`;

  let nextFocus = '다음 복기 포인트: 진입 논리와 무효화 기준이 실제 집행 과정에서도 유지됐는지 확인하세요.';
  if (metrics.missingMarkPrice) nextFocus = '다음 복기 포인트: 현재가를 입력해 미실현 손익과 잔여 리스크를 실제 운영값으로 추적하세요.';
  else if (metrics.residualRisk > riskBudget * 0.5 && trade.status === 'OPEN') nextFocus = '다음 복기 포인트: 부분청산 또는 손절 상향 전환이 가능한 구간인지 재검토하세요.';
  else if ((trade.mistakes || []).length) nextFocus = `다음 복기 포인트: 기록된 실수(${trade.mistakes.join(', ')})가 계획 단계에서 예방 가능했는지 점검하세요.`;
  else if (isClosed && finalR > 0) nextFocus = '다음 복기 포인트: 수익이 난 이유가 계획의 우위 때문인지, 운 좋게 흘러간 거래인지 구분해 보세요.';

  setHtml('post-assessment-copy', `
    <p><strong>리스크 사용 평가</strong><br>${escapeHtml(riskComment)}</p>
    <p><strong>청산/실행 상태 요약</strong><br>${escapeHtml(executionComment)}</p>
    <p><strong>다음 복기 포인트</strong><br>${escapeHtml(nextFocus)}</p>
  `);
}

function renderCalcSummary(metrics, trade) {
  let warnHtml = '';
  if (metrics.directionError) warnHtml += '<div class="warn-text">⚠️ 방향과 손절 위치가 충돌합니다.</div>';
  if (metrics.exitExceeds100) warnHtml += `<div class="warn-text" style="color:var(--red);">⚠️ 실제 청산(FILLED) 비중 합계가 100%를 초과합니다. (${metrics.actualExitPct.toFixed(1)}%)</div>`;
  if (trade.status === 'OPEN' && metrics.missingMarkPrice) warnHtml += '<div class="warn-text">⚠️ 현재가가 없어 미실현 손익이 0으로 처리됩니다.</div>';
  if (metrics.actualRiskPctOfBudget > 100) warnHtml += `<div class="warn-text" style="color:var(--red);">⚠️ 허용 리스크를 ${metrics.actualRiskPctOfBudget.toFixed(1)}% 사용 중입니다. (초과 ${moneyAbs(metrics.overRiskDollar)})</div>`;

  if (!metrics.valid && !metrics.exitExceeds100) {
    setHtml('calc-summary', `
      <div class="summary-invalid" style="color:var(--muted); font-weight:600;">
        손절가와 실제 진입 레그(가격 + Risk Share)를 확인해 주세요.
        ${warnHtml}
      </div>
    `);
    return;
  }

  const summaryRows = [
    ['Avg Entry', money(metrics.avgEntry)],
    ['Weighted Lev', `${metrics.weightedLeverage.toFixed(2)}x`],
    ['Qty', qty(metrics.qty)],
    ['Used Risk', moneyAbs(metrics.actualRiskUsed)],
    ['Realized', money(metrics.realizedPnl), metrics.realizedPnl],
    ['Unrealized', money(metrics.unrealizedPnl), metrics.unrealizedPnl],
    ['Net PnL', money(metrics.pnl), metrics.pnl],
    ['Realized R', `${metrics.realizedR.toFixed(2)}R`, metrics.realizedR],
    ['Unrealized R', `${metrics.unrealizedR.toFixed(2)}R`, metrics.unrealizedR],
    ['Filled Exit %', `${metrics.actualExitPct.toFixed(1)}%`],
    ['Planned Exit %', `${metrics.plannedExitPct.toFixed(1)}%`],
    ['Residual Risk', moneyAbs(metrics.residualRisk)],
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

function renderRiskPanel(metrics, trade) {
  setText('risk-risk-dollar', moneyAbs(metrics.riskDollar));
  setText('risk-projected-pnl', money(metrics.projectedPnl));
  setText('risk-projected-r', `${metrics.projectedR.toFixed(2)}R`);
  setText('risk-qty', qty(metrics.qty));
  setText('risk-margin', moneyAbs(metrics.margin));
  setText('risk-notional', moneyAbs(metrics.notional));
  setText('risk-slider', `${metrics.sliderPct.toFixed(1)}%`);
  setText('risk-stop-distance', `${metrics.stopDistancePct.toFixed(2)}%`);
  setText('risk-fees', moneyAbs(metrics.totalFees));
  setText('risk-realized', money(metrics.realizedPnl));
  setText('risk-unrealized', money(metrics.unrealizedPnl));
  setText('risk-residual', moneyAbs(metrics.residualRisk));
  setText('risk-actual-risk', moneyAbs(metrics.actualRiskUsed));
  setText('risk-risk-usage', `${metrics.actualRiskPctOfBudget.toFixed(1)}%`);
  setText('risk-weighted-lev', `${metrics.weightedLeverage.toFixed(2)}x`);
  setText('risk-avg-entry', metrics.avgEntry ? safeNumber(metrics.avgEntry.toFixed(4)) : '0.00');
  setText('risk-bep', metrics.breakEvenPrice ? safeNumber(metrics.breakEvenPrice.toFixed(4)) : '0.00');
  setText('risk-remaining-risk', moneyAbs(metrics.availableRiskDollar));
}

function renderPlannerSummary(trade) {
  if (!els['planner-summary']) return;
  const suggestion = generatePlannerSuggestion(trade);
  state.plannerSuggestion = suggestion.valid ? suggestion : null;
  if (!suggestion.valid) {
    setHtml('planner-summary', `<div class="summary-invalid" style="color:var(--muted); font-weight:600;">${escapeHtml(suggestion.reason || '추천 진입 플랜을 계산할 수 없습니다.')}</div>`);
    return;
  }

  setHtml('planner-summary', `
    <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
      <div style="font-weight:800; color:#0f172a;">추천 전략: ${escapeHtml(suggestion.plannerModeLabel)} · ${escapeHtml(suggestion.plannerWeightModeLabel)}</div>
      <div style="font-size:12px; color:var(--muted); font-weight:700;">Risk ${moneyAbs(suggestion.metrics.riskDollar)} · Margin ${moneyAbs(suggestion.metrics.margin)} · Weighted Lev ${suggestion.metrics.weightedLeverage.toFixed(2)}x</div>
    </div>
    <div class="summary-grid">
      ${suggestion.entries.map((leg, idx) => {
        const d = suggestion.metrics.entryBreakdown[idx] || {};
        return `
          <div class="summary-item">
            <div class="summary-label">STEP ${idx + 1}</div>
            <div class="summary-value">${safeNumber(leg.price)}</div>
            <div style="font-size:12px; color:var(--muted); font-weight:700; margin-top:6px;">리스크 비중 ${leg.weight.toFixed(1)}% · ${leg.leverage.toFixed(1)}x</div>
            <div style="font-size:12px; color:#334155; margin-top:4px;">Qty ${qty(d.qty)} · Margin ${moneyAbs(d.margin)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `);
}

function applyPlannerSuggestion() {
  if (!state.plannerSuggestion?.valid) {
    updatePreview();
    return;
  }
  pushUndoSnapshot();
  state.draftEntries = cloneRows(state.plannerSuggestion.entries || []).map(row => ({ ...row, leverage: Math.max(1, Number(row.leverage || getVal('leverage') || 1)) }));
  renderLegs('entry');
  handleFormMutation();
  refreshJournalStatus('추천안 적용 완료');
}

function metricCard(label, value, colorClass) {
  return `
    <div class="metric ${colorClass}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderOverview() {
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
  renderOverviewHistory();
  renderEquityChart(stats.closed);
  renderBalanceChart(); 
  renderOverviewPortfolio();
}

function setOverviewHistoryMode(mode) {
  state.overviewHistoryMode = 'trades';
  renderOverviewHistory();
}

function formatClockTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatHoldingDuration(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return '—';
  const mins = Math.round((e - s) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

function renderOverviewHistory() {
  if (!els['overview-history-list']) return;
  const trades = [...getOverviewTrades()].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!trades.length) {
    setHtml('overview-history-list', '<div class="overview-history-empty">표시할 최근 매매가 없습니다.</div>');
    return;
  }

  const html = trades.slice(0, 24).map(trade => {
    const startAt = trade.date;
    const endAt = trade.closedAt || (trade.status === 'CLOSED' ? trade.updatedAt || trade.date : '');
    const holding = trade.status === 'CLOSED' ? formatHoldingDuration(startAt, endAt) : `${formatHoldingDuration(startAt, nowIso())} (진행중)`;
    const pnl = Number(trade.metrics.pnl || 0);
    const r = Number(trade.metrics.r || 0);
    return `
      <div class="overview-history-item" data-trade-id="${trade.id}">
        <div class="overview-history-compact-grid">
          <div class="overview-history-main" data-action="open">
            <div>
              <div class="overview-history-title">
                <span>${escapeHtml(trade.ticker)}</span>
                <span class="badge ${trade.status === 'OPEN' ? 'badge-open' : 'badge-closed'}">${escapeHtml(trade.status)}</span>
              </div>
              <div class="overview-history-sub">
                <span>${escapeHtml(trade.side)}</span>
                <span>${escapeHtml(trade.setupEntry || '—')}</span>
                <span>${escapeHtml(trade.setupExit || '—')}</span>
              </div>
              <div class="overview-history-timegrid">
                <div class="overview-time-chip"><span class="label">시작시간</span><span class="value">${formatClockTime(startAt)}</span></div>
                <div class="overview-time-chip"><span class="label">종료시간</span><span class="value">${trade.status === 'CLOSED' ? formatClockTime(endAt) : '—'}</span></div>
                <div class="overview-time-chip"><span class="label">홀딩시간</span><span class="value">${holding}</span></div>
              </div>
            </div>
          </div>
          <div>
            <div class="overview-history-metrics">
              <strong class="mono ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : ''}">${money(pnl)}</strong>
              <span class="mono ${r > 0 ? 'positive' : r < 0 ? 'negative' : ''}">${r.toFixed(2)}R</span>
            </div>
            <div class="overview-history-actions">
              <button type="button" class="tool-btn" data-action="edit">수정</button>
              <button type="button" class="tool-btn danger-btn" data-action="delete">삭제</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  setHtml('overview-history-list', html);
  els['overview-history-list'].querySelectorAll('[data-trade-id]').forEach(item => {
    const id = item.getAttribute('data-trade-id');
    item.querySelector('[data-action="open"]')?.addEventListener('click', () => openSelectedInJournal(id));
    item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => { e.stopPropagation(); openSelectedInJournal(id); });
    item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => { e.stopPropagation(); deleteTradeById(id); });
  });
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
    if (!map.has(key)) map.set(key, { pnl: 0, count: 0, wins: 0, closed: 0 });
    const row = map.get(key);
    row.pnl += Number(trade.metrics.pnl || 0);
    row.count += 1;
    if (trade.status === 'CLOSED') {
      row.closed += 1;
      if (Number(trade.metrics.pnl || 0) > 0) row.wins += 1;
    }
  });

  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  const pad = n => String(n).padStart(2, '0');

  for (let i = 0; i < firstWeekday; i += 1) cells.push('<div class="day muted"></div>');

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const row = map.get(key) || { pnl: 0, count: 0, wins: 0, closed: 0 };
    const pnl = row.pnl || 0;
    const winRate = row.closed ? (row.wins / row.closed) * 100 : 0;
    cells.push(`
      <div class="day ${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : ''}" onclick="window.__desk_jump_date('${key}')" title="${key} 매매기록 보기">
        <div class="num">${day}</div>
        <div class="pnl ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : ''}">${pnl ? moneyCompact(pnl) : ''}</div>
        <div class="calendar-day-stats">
          <span>${row.count}건</span>
          <span class="winrate ${winRate >= 50 ? 'positive' : row.closed ? 'negative' : ''}">${row.closed ? `승률 ${winRate.toFixed(0)}%` : '승률 —'}</span>
        </div>
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
    date: nowIso(),
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
      <td data-label="셋업" style="font-weight:700;">${escapeHtml(trade.setupEntry || '—')}</td>
      <td data-label="Avg In" class="mono">${trade.metrics.avgEntry ? moneyAbs(trade.metrics.avgEntry) : '—'}</td>
      <td data-label="Avg Out" class="mono">${trade.metrics.avgExit ? moneyAbs(trade.metrics.avgExit) : '—'}</td>
      <td data-label="PnL" class="mono ${trade.metrics.pnl > 0 ? 'positive' : trade.metrics.pnl < 0 ? 'negative' : ''}">${money(trade.metrics.pnl)}</td>
      <td data-label="R" class="mono ${trade.metrics.r > 0 ? 'positive' : trade.metrics.r < 0 ? 'negative' : ''}">${trade.metrics.r.toFixed(2)}R</td>
      <td data-label="Grade"><span class="badge ${trade.grade === 'S' || trade.grade === 'A' ? 'badge-good' : ''}">${trade.grade}</span></td>
      <td data-label="태그">${(trade.tags || []).slice(0, 3).map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join(' ')}</td>
    </tr>
  `).join('') : `<tr><td colspan="11">${emptyState('검색 결과가 없습니다.')}</td></tr>`);

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
    if (grade !== 'ALL' && trade.grade !== grade) return false;
    if (setup && !(trade.setupEntry || '').toLowerCase().includes(setup)) return false;
    if (tag && !(trade.tags || []).some(value => value.includes(tag))) return false;
    if (mistake && !(trade.mistakes || []).some(value => value.includes(mistake))) return false;
    if (q) {
      const haystack = [
        trade.ticker, trade.setupEntry, trade.setupExit, trade.context, trade.thesis, trade.review,
        trade.liveNotes,
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
    <div class="detail-actions detail-actions-right">
      <button type="button" class="tool-btn primary-btn detail-load-btn" id="load-selected-into-journal">Journal로 불러오기</button>
    </div>
    <div class="kv">
      <div>티커</div><div><strong>${escapeHtml(trade.ticker)}</strong> · ${escapeHtml(trade.side)} · ${escapeHtml(trade.status)}</div>
      <div>Setup</div><div>${escapeHtml(trade.setupEntry || '—')} → ${escapeHtml(trade.setupExit || '—')}</div>
      <div>시작 / 종료</div><div>${formatDateTime(trade.date)} / ${trade.closedAt ? formatDateTime(trade.closedAt) : '—'}</div>
      <div>홀딩시간</div><div>${trade.closedAt ? formatHoldingDuration(trade.date, trade.closedAt) : `${formatHoldingDuration(trade.date, nowIso())} (진행중)`}</div>
      <div>Grade</div><div><span class="badge ${trade.grade === 'S' || trade.grade === 'A' ? 'badge-good' : ''}">${escapeHtml(trade.grade)}</span></div>
      <div>Avg In / Avg Out</div><div class="mono">${moneyAbs(trade.metrics.avgEntry)} / ${trade.metrics.avgExit ? moneyAbs(trade.metrics.avgExit) : '—'}</div>
      <div>PnL / R</div><div class="mono ${trade.metrics.pnl > 0 ? 'positive' : trade.metrics.pnl < 0 ? 'negative' : ''}">${money(trade.metrics.pnl)} / ${trade.metrics.r.toFixed(2)}R</div>
      <div>Real/Unrealized</div><div class="mono">${money(trade.metrics.realizedPnl)} / ${money(trade.metrics.unrealizedPnl)}</div>
      <div>Residual Risk</div><div class="mono">${moneyAbs(trade.metrics.residualRisk)} (${trade.metrics.remainingPct.toFixed(1)}% remaining)</div>
    </div>

    <div class="execution-ladder-card">
      <h4 class="execution-ladder-header">Execution Ladder</h4>
      <div class="execution-ladder-track">
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
      ${renderEvidenceItems([
        ...(trade.evidence?.entryCharts || []).map((item, idx) => ({ label: chartRowLabel('entry', item?.timeframe || DEFAULT_TIMEFRAME), url: item?.url || item })),
        ...(trade.evidence?.exitCharts || []).map((item, idx) => ({ label: chartRowLabel('exit', item?.timeframe || DEFAULT_TIMEFRAME), url: item?.url || item })),
        ...(trade.evidence?.liveCharts || []).map((item, idx) => ({ label: chartRowLabel('live', item?.timeframe || DEFAULT_TIMEFRAME), url: item?.url || item })),
      ], { emptyText: '차트 증거 없음' })}
    </div>
  `);

  document.getElementById('load-selected-into-journal').onclick = () => openSelectedInJournal(trade.id);
  bindEvidenceOpeners(els['detail']);
}

function renderTimeline(type, rows) {
  if (!rows.length) return `
    <div class="timeline-col">
      <div class="timeline-dot"></div>
      <div class="timeline-label">${type.toUpperCase()}</div>
      <div class="timeline-meta mono">—</div>
    </div>
  `;
  return rows.map((row, idx) => `
    <div class="timeline-col">
      <div class="timeline-dot ${type === 'entry' ? 'entry' : 'exit'}"></div>
      <div class="timeline-label">${type.toUpperCase()} ${idx + 1}</div>
      <div class="timeline-meta mono">
        ${safeNumber(row.price)}<br>
        ${safeNumber(row.weight)}%${type === 'entry' ? `<br>${safeNumber(row.leverage || 1)}x` : `<br>${row.status === 'FILLED' ? 'FILLED' : 'PLAN'}`}
      </div>
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

  const buildPlaybookLinks = (trade) => {
    const items = [
      ...(Array.isArray(trade.evidence?.entryCharts) ? trade.evidence.entryCharts.map(item => ({ label: chartRowLabel('entry', item?.timeframe || DEFAULT_TIMEFRAME), url: item?.url || item })) : []),
      ...(Array.isArray(trade.evidence?.exitCharts) ? trade.evidence.exitCharts.map(item => ({ label: chartRowLabel('exit', item?.timeframe || DEFAULT_TIMEFRAME), url: item?.url || item })) : []),
      ...(Array.isArray(trade.evidence?.liveCharts) ? trade.evidence.liveCharts.map(item => ({ label: chartRowLabel('live', item?.timeframe || DEFAULT_TIMEFRAME), url: item?.url || item })) : []),
    ].filter(item => sanitizeUrl(item.url));

    return renderEvidenceItems(items, { emptyText: '차트 링크 없음', cssClass: 'playbook-link-row' });
  };

  let html = '';
  rows.forEach(trade => {
    html += `
    <article class="playbook-card" data-id="${trade.id}">
      <div class="playbook-info" style="padding: 16px; display:flex; flex-direction:column; flex:1;">
        <div class="playbook-header" style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:16px; color:#0f172a; font-weight:900;">${escapeHtml(trade.ticker)}</strong>
          <span class="badge badge-good" style="font-size:12px;">Grade ${trade.grade}</span>
        </div>
        <div style="font-size:12px; color:var(--accent); font-weight:800; margin-top:4px;">${escapeHtml(trade.setupEntry || 'NA')}</div>
        <div style="font-size:11px; color:var(--muted); font-weight:600; margin-top:2px;">${formatDateTime(trade.date)}</div>
        <div class="mono ${trade.metrics.r > 0 ? 'positive' : 'negative'}" style="font-size:14px; font-weight:800; margin-top:8px;">${trade.metrics.r.toFixed(2)}R (${money(trade.metrics.pnl)})</div>
        <p style="font-size:12px; color:#334155; font-weight:500; margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(trade.thesis || trade.review || '설명 없음')}</p>
        ${buildPlaybookLinks(trade)}
        <div class="chips" style="margin-top:12px;">${(trade.tags || []).slice(0, 3).map(item => `<span class="chip">#${escapeHtml(item)}</span>`).join('') || '<span class="chip">태그 없음</span>'}</div>
      </div>
    </article>`;
  });

  setHtml('playbook-gallery', rows.length ? html : emptyState('조건을 만족하는 S/A급 Playbook 샘플이 없습니다.'));

  bindEvidenceOpeners(els['playbook-gallery']);

  els['playbook-gallery'].querySelectorAll('.playbook-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest('a, .js-evidence-open')) return;
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
  setVal('f-grade', 'ALL');
  setVal('sort', 'newest');
  renderLibrary();
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  showModal({ type: 'CONFIRM', title: '데이터 복원', desc: '현재 데이터를 복원 파일로 교체합니다. 계속하시겠습니까?' }, (confirmed) => {
    if (!confirmed) {
      if (els['import-json']) els['import-json'].value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImport(String(reader.result || ''));
        if (!imported || !Array.isArray(imported.trades)) throw new Error('유효한 트레이드 데이터가 아닙니다.');
        state.db = imported;
        saveDB(state.db);
        resetFormForce();
        render();
        refreshJournalStatus('데이터 복원 완료');
        showModal({ type: 'ALERT', title: '복원 완료', desc: `트레이드 ${state.db.trades.length}건을 불러왔습니다.` });
      } catch (error) {
        console.error('[handleImport]', error);
        showModal({ type: 'ALERT', title: '복원 실패', desc: '지원되지 않는 파일이거나 데이터 구조가 올바르지 않습니다.' });
      } finally {
        if (els['import-json']) els['import-json'].value = '';
      }
    };
    reader.readAsText(file);
  });
}


function insertLiveNote(prefix) {
  pushUndoSnapshot();
  const current = getVal('live-notes');
  const stamp = `[${nowStamp()}] `;
  setVal('live-notes', `${current}${current && !current.endsWith('\n') ? '\n' : ''}${stamp}${prefix}`);
  markDirty();
  updatePreview();
  persistDraft();
}

function appendCsvValue(id, value) {
  pushUndoSnapshot();
  const values = splitCsv(getVal(id));
  if (!values.includes(value)) values.push(value);
  setVal(id, values.join(', '));
  handleFormMutation();
}

function markDirty() {
  state.dirty = true;
  refreshJournalStatus('편집 중');
}

function refreshJournalStatus(message, level = 'ok') {
  setText('journal-status', message);
  if (els['journal-status']) {
    els['journal-status'].dataset.level = level;
  }
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
    leverage: Math.max(1, Number(row.leverage || 1)),
    status: row.status === 'FILLED' ? 'FILLED' : 'PLANNED',
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

function nowIso() {
  return new Date().toISOString();
}

function readDateInputAsIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
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
