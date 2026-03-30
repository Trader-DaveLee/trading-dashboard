import { recalcTrade } from './calc.js';
import { summarize, groupAverageR, countTags, tagStats } from './analytics.js';
import { loadDB, saveDB, exportDB, parseImport, normalizeTrade, loadDraft, saveDraft, clearDraft, loadPrefs, savePrefs } from './storage.js';

const state = {
  db: loadDB(), view: 'overview', month: new Date(), selectedTradeId: null,
  draftEntries: [{ price: 0, type: 'M', weight: 100 }], draftExits: [], dirty: false, prefs: loadPrefs(), draftMeta: null,
};

const views = ['overview', 'journal', 'library'];
const els = {};

const ID_LIST = [
  'nav','force-save-draft','export-json','import-json-btn','import-json','journal-status','draft-saved-at',
  'view-overview','metrics','overview-from','overview-to','overview-clear','prev-month','calendar-title','next-month','calendar','equity-chart','setup-chart','mistake-list','research-notes',
  'view-journal','trade-form','trade-id','trade-date','btn-now','ticker','btn-manage-ticker','status','session','side','setup-entry','btn-manage-setup-entry','setup-exit','btn-manage-setup-exit','account-size','risk-pct','leverage','maker-fee','taker-fee','stop-price','stop-type','adjustment','tags','mistakes','emotion','btn-manage-emotion','context','thesis','review','artifacts',
  'add-entry','entries','add-exit','exits','calc-summary','toggle-deep-journal','deep-journal-section','quick-tags','quick-mistakes','live-notes','btn-insert-time',
  'actual-balance','btn-update-balance','balance-history',
  'duplicate-trade','reset-form','delete-trade',
  'desk-rules','risk-risk-dollar','risk-qty','risk-margin','risk-slider','risk-notional','risk-stop-distance','risk-fees',
  'view-library','q','f-from','f-to','f-status','sort','clear-filters','library-result-count','review-position','review-breadcrumb','prev-trade','next-trade','filter-same-setup','filter-same-ticker','clear-quick-filter','trade-table','detail','detail-insights'
];

window.__desk = {
  selectTrade: id => selectTrade(id),
  applySameSetupFilter: () => filterBySelectedSetup(),
  applySameTickerFilter: () => filterBySelectedTicker(),
  loadSelectedIntoJournal: () => openSelectedInJournal(),
  manageDrops: t => manageDrops(t),
  deleteBalanceHist: id => deleteBalanceHist(id)
};

function setVal(id, val) { if(els[id]) els[id].value = val; }
function getVal(id, def = '') { return els[id] ? els[id].value : def; }
function setHtml(id, html) { if(els[id]) els[id].innerHTML = html; }
function setText(id, text) { if(els[id]) els[id].textContent = text; }

bootstrap();

function bootstrap() { cacheEls(); bindEvents(); initDynamicDropdowns(); hydrateInitialForm(); render(); }
function cacheEls() { ID_LIST.forEach(id => { els[id] = document.getElementById(id); }); }

function initDynamicDropdowns() {
  state.db.meta.emotions = state.db.meta.emotions || ["CALM", "FOMO", "TIRED", "REVENGE"];
  if(!state.db.meta.accountBalance) state.db.meta.accountBalance = 10000;
  if(!state.db.meta.balanceHistory) state.db.meta.balanceHistory = [];
  renderDrops();
}

function renderDrops() {
  populateDrop('ticker', state.db.meta.tickers);
  populateDrop('setup-entry', state.db.meta.entrySetups);
  populateDrop('setup-exit', state.db.meta.exitSetups);
  populateDrop('emotion', state.db.meta.emotions);
}

function populateDrop(id, list) {
  if(!els[id]) return; els[id].innerHTML = '';
  list.forEach(v => { let opt = document.createElement('option'); opt.value = v; opt.text = v; els[id].appendChild(opt); });
}

function manageDrops(type) {
  let title = type==='ticker'?'Ticker':type==='setup-entry'?'Entry Setup':type==='setup-exit'?'Exit Setup':'Emotion';
  let arr = type==='ticker'?state.db.meta.tickers:type==='setup-entry'?state.db.meta.entrySetups:type==='setup-exit'?state.db.meta.exitSetups:state.db.meta.emotions;
  
  let act = prompt(`Manage ${title}\n추가하려면 'ADD', 삭제하려면 'DEL' 입력:`).toUpperCase();
  if(act === 'ADD') { let n = prompt(`새로운 ${title}:`); if(n) { arr.push(n.toUpperCase()); saveDB(state.db); renderDrops(); els[type].value = n.toUpperCase(); } } 
  else if(act === 'DEL') { let v = els[type].value; let idx = arr.indexOf(v); if(idx > -1) { arr.splice(idx, 1); saveDB(state.db); renderDrops(); } }
}

function bindEvents() {
  if(els['btn-manage-ticker']) els['btn-manage-ticker'].onclick = () => manageDrops('ticker');
  if(els['btn-manage-setup-entry']) els['btn-manage-setup-entry'].onclick = () => manageDrops('setup-entry');
  if(els['btn-manage-setup-exit']) els['btn-manage-setup-exit'].onclick = () => manageDrops('setup-exit');
  if(els['btn-manage-emotion']) els['btn-manage-emotion'].onclick = () => manageDrops('emotion');

  if(els['prev-month']) els['prev-month'].onclick = () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); };
  if(els['next-month']) els['next-month'].onclick = () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); };
  
  if(els['btn-now']) els['btn-now'].onclick = () => { setVal('trade-date', inputDate(new Date().toISOString())); markDirty(); };

  if(els['add-entry']) els['add-entry'].onclick = () => { state.draftEntries.push({ price: 0, type: 'M', weight: 0 }); renderLegs('entry'); updatePreview(); };
  if(els['add-exit']) els['add-exit'].onclick = () => { state.draftExits.push({ price: 0, type: 'M', weight: 0 }); renderLegs('exit'); updatePreview(); };
  
  if(els['reset-form']) els['reset-form'].onclick = resetForm;
  if(els['delete-trade']) els['delete-trade'].onclick = deleteTrade;
  if(els['duplicate-trade']) els['duplicate-trade'].onclick = duplicateTrade;
  
  if(els['force-save-draft']) els['force-save-draft'].onclick = () => { persistDraft(); saveDB(state.db); alert("데이터가 안전하게 임시저장되었습니다."); refreshJournalStatus('임시저장 완료'); };
  if(els['export-json']) els['export-json'].onclick = () => exportDB(state.db);
  if(els['import-json-btn']) els['import-json-btn'].onclick = () => els['import-json'].click();
  if(els['import-json']) els['import-json'].onchange = handleImport;
  if(els['clear-filters']) els['clear-filters'].onclick = clearFilters;
  
  if(els['toggle-deep-journal']) els['toggle-deep-journal'].onclick = (e) => {
    els['deep-journal-section'].classList.toggle('hidden');
    e.target.textContent = els['deep-journal-section'].classList.contains('hidden') ? '📝 SECTION 5: DEEP REVIEW (사후 복기 및 차트) ▼' : '📝 SECTION 5: DEEP REVIEW (접기) ▲';
  };

  if(els['btn-insert-time']) els['btn-insert-time'].onclick = () => {
    if(!els['live-notes']) return;
    const now = new Date(); const tStr = `[${pad(now.getHours())}:${pad(now.getMinutes())}] `;
    els['live-notes'].value += (els['live-notes'].value && !els['live-notes'].value.endsWith('\n') ? '\n' : '') + tStr;
    els['live-notes'].focus(); markDirty(); persistDraft();
  };

  if(els['btn-update-balance']) els['btn-update-balance'].onclick = () => {
    const val = Math.round(Number(els['actual-balance'].value));
    if(isNaN(val) || val <= 0) return;
    const hist = state.db.meta.balanceHistory;
    
    if(hist.length > 0) {
        if (Math.round(hist[0].val) === val) { alert("최근 잔고와 동일한 금액입니다."); return; }
        const changePct = Math.abs(val - hist[0].val) / hist[0].val * 100;
        if (changePct > 30) {
            if(!confirm(`잔고가 이전 대비 ${changePct.toFixed(1)}%나 급변했습니다. 정말 입력하시겠습니까?\n(오타가 아니라면 확인을 눌러주세요)`)) return;
        }
    }
    
    state.db.meta.accountBalance = val;
    state.db.meta.balanceHistory.unshift({ id: Date.now(), date: new Date().toISOString(), val: val });
    saveDB(state.db); setVal('account-size', val); renderAccountBalance(); updatePreview(); persistDraft();
  };

  if(els['prev-trade']) els['prev-trade'].onclick = () => stepSelectedTrade(-1);
  if(els['next-trade']) els['next-trade'].onclick = () => stepSelectedTrade(1);
  if(els['filter-same-setup']) els['filter-same-setup'].onclick = filterBySelectedSetup;
  if(els['filter-same-ticker']) els['filter-same-ticker'].onclick = filterBySelectedTicker;
  if(els['clear-quick-filter']) els['clear-quick-filter'].onclick = clearQuickFilter;
  if(els['trade-form']) els['trade-form'].addEventListener('submit', handleSubmit);
  
  ['overview-from', 'overview-to'].forEach(id => { if(els[id]) els[id].addEventListener('change', renderOverview); });
  if(els['overview-clear']) els['overview-clear'].onclick = () => { setVal('overview-from', ''); setVal('overview-to', ''); renderOverview(); };

  bindKeyboardShortcuts();

  const inputs = ['trade-date','ticker','status','session','side','setup-entry','setup-exit','account-size','risk-pct','leverage','maker-fee','taker-fee','stop-price','stop-type','adjustment','tags','mistakes','emotion','context','thesis','review','artifacts','desk-rules','live-notes'];
  inputs.forEach(id => {
    if(els[id]) { els[id].addEventListener('input', () => { markDirty(); updatePreview(); persistDraft(); }); els[id].addEventListener('change', () => { markDirty(); updatePreview(); persistDraft(); }); }
  });

  ['q','f-from','f-to','f-status','sort'].forEach(id => {
    if(els[id]) { els[id].addEventListener('input', renderLibrary); els[id].addEventListener('change', renderLibrary); }
  });
}

function render() { renderNav(); renderOverview(); renderQuickFill(); renderLibrary(); renderAccountBalance(); updatePreview(); refreshJournalStatus(); }

function renderNav() {
  if(!els.nav) return;
  els.nav.innerHTML = views.map(view => `<button class="${state.view === view ? 'active' : ''}" data-view="${view}">${label(view)}</button>`).join('');
  els.nav.querySelectorAll('button').forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
}

function switchView(view) {
  state.view = view;
  views.forEach(v => { if(els[`view-${v}`]) els[`view-${v}`].classList.toggle('active', v === view); });
  renderNav();
  if(view === 'overview') renderOverview();
}

function renderAccountBalance() {
  if(!els['actual-balance']) return;
  els['actual-balance'].value = Math.round(state.db.meta.accountBalance || 10000);
  let histHtml = '';
  const hist = state.db.meta.balanceHistory || [];
  hist.slice(0, 5).forEach((h, i) => {
    const curr = Math.round(h.val);
    let diffHtml = '';
    if (i < hist.length - 1) {
      const prev = Math.round(hist[i+1].val);
      const diff = curr - prev;
      if (diff > 0) diffHtml = `<span style="color:var(--green); font-size:11px; font-weight:bold; margin-right:6px;">+$${diff.toLocaleString()}</span>`;
      else if (diff < 0) diffHtml = `<span style="color:var(--red); font-size:11px; font-weight:bold; margin-right:6px;">-$${Math.abs(diff).toLocaleString()}</span>`;
    }
    histHtml += `<div class="balance-hist-item">
      <span style="font-size:11px;">${new Date(h.date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</span>
      <div style="display:flex; align-items:center;">
        ${diffHtml}<strong style="color:#eef2ff; font-size:13px;">$${curr.toLocaleString()}</strong>
        <button type="button" class="btn-del" style="margin-left:6px; padding:2px;" onclick="window.__desk.deleteBalanceHist(${h.id})" title="기록 삭제">✕</button>
      </div>
    </div>`;
  });
  setHtml('balance-history', histHtml || '<div class="empty-state">내역 없음</div>');
}

function deleteBalanceHist(id) {
  if(!confirm("이 잔고 기록을 삭제하시겠습니까?\n(가장 최신 기록이 삭제되면 이전 잔고로 롤백됩니다.)")) return;
  state.db.meta.balanceHistory = state.db.meta.balanceHistory.filter(h => h.id !== id);
  if(state.db.meta.balanceHistory.length > 0) {
      state.db.meta.accountBalance = state.db.meta.balanceHistory[0].val;
  } else {
      state.db.meta.accountBalance = 10000;
  }
  saveDB(state.db);
  setVal('account-size', state.db.meta.accountBalance);
  renderAccountBalance();
  updatePreview();
}

function renderOverview() {
  let filtered = state.db.trades;
  const from = getVal('overview-from');
  const to = getVal('overview-to');
  if (from || to) {
    filtered = filtered.filter(t => {
      const d = t.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }
  const s = summarize(filtered);
  const metrics = [
    { label: 'Net PnL', value: s.net>=0?`+$${s.net.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`:`-$${Math.abs(s.net).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`, sub: `${s.closed.length} closed trades`, tone: 'metric-profit', size: 'large' },
    { label: 'Win Rate', value: `${s.winRate.toFixed(1)}%`, sub: `${s.wins.length}W / ${s.losses.length}L`, tone: 'metric-accent', size: 'large' },
    { label: 'Average R', value: `${s.avgR.toFixed(2)}R`, sub: 'Per Trade', tone: 'metric-accent', size: 'medium' },
    { label: 'Profit Factor', value: s.profitFactor === Infinity ? 'MAX' : s.profitFactor.toFixed(2), sub: 'Gross P / Gross L', tone: 'metric-neutral', size: 'medium' },
    { label: 'Max Drawdown', value: s.maxDD===0?`$0.00`:`-$${s.maxDD.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`, sub: 'Peak to trough', tone: 'metric-loss', size: 'small' }
  ];
  setHtml('metrics', metrics.map(item => `<div class="metric ${item.size} ${item.tone}"><div class="label">${item.label}</div><div class="value">${item.value}</div><div class="sub">${item.sub}</div></div>`).join(''));
  
  renderCalendar();
  renderEquity(s.closed);
  renderSetupChart(s.closed);
  renderMistakes(s.closed);
  renderResearchNotes(s.closed);
}

function renderCalendar() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const y = state.month.getFullYear(); const m = state.month.getMonth();
  setText('calendar-title', new Date(y, m).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }));
  const first = new Date(y, m, 1).getDay(); const total = new Date(y, m + 1, 0).getDate();
  let html = days.map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first; i++) html += `<div class="day empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const pnl = state.db.trades.filter(t => t.status === 'CLOSED' && t.date.slice(0, 10) === key).reduce((sum, t) => sum + t.metrics.pnl, 0);
    html += `<div class="day ${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : ''}" onclick="if(document.getElementById('q')){document.getElementById('q').value='${key}';} window.__desk_lib_jump();"><span class="date">${d}</span><span class="pnl ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'}">${pnl ? money(pnl) : ''}</span></div>`;
  }
  setHtml('calendar', html);
}
window.__desk_lib_jump = () => { switchView('library'); renderLibrary(); };

function renderEquity(closed) {
  if (!closed.length) return setHtml('equity-chart', emptyState('데이터가 없습니다.'));
  const sorted = [...closed].sort((a, b) => new Date(a.date) - new Date(b.date));
  let equity = 0; const points = sorted.map((t, i) => ({ x: i, y: (equity += t.metrics.pnl) }));
  setHtml('equity-chart', lineSvg(points));
}

function renderSetupChart(closed) {
  const data = groupAverageR(closed, t => t.setupEntry).slice(0, 8);
  setHtml('setup-chart', data.length ? barSvg(data) : emptyState('데이터가 없습니다.'));
}

function renderMistakes(closed) {
  const counts = countTags(closed, t => t.mistakes || []).slice(0, 5);
  const costs = tagStats(closed, t => t.mistakes || []).slice(0, 5);
  const byLabel = new Map(costs.map(x => [x.label, x]));
  let html = counts.length ? counts.map(item => {
    const stat = byLabel.get(item.label);
    return `<div class="note-box"><strong>${escapeHtml(item.label)}</strong><div>빈도 ${item.value}회 · 누적 ${money(stat?.totalPnl || 0)}</div></div>`;
  }).join('') : emptyState('실수 태그가 없습니다.');
  setHtml('mistake-list', html);
}

function renderResearchNotes(closed) {
  const notes = [];
  const setups = groupAverageR(closed, t => t.setupEntry).filter(x => x.count >= 2);
  if (setups[0]) notes.push(`가장 성과가 좋은 셋업은 <strong style="color:var(--accent);">${escapeHtml(setups[0].label)}</strong> (${setups[0].value.toFixed(2)}R) 입니다.`);
  const mistakes = tagStats(closed, t => t.mistakes || []);
  if (mistakes[0]) notes.push(`가장 치명적인 실수는 <strong style="color:var(--red);">${escapeHtml(mistakes[0].label)}</strong> 입니다.`);
  if (!notes.length) notes.push('데이터가 누적되면 자동 인사이트가 생성됩니다.');
  setHtml('research-notes', notes.map(x => `<div class="note-box">${x}</div>`).join(''));
}

function renderLibrary() {
  const rows = filteredTrades();
  state.currentLibraryRows = rows;
  const selectedExists = rows.some(t => t.id === state.selectedTradeId);
  if (!selectedExists) state.selectedTradeId = rows[0]?.id || null;
  setText('library-result-count', `${rows.length}개 결과`);
  const selectedIndex = rows.findIndex(t => t.id === state.selectedTradeId);
  setText('review-position', rows.length ? `${selectedIndex + 1} / ${rows.length}` : '0 / 0');
  setHtml('trade-table', rows.length ? rows.map(tradeRow).join('') : `<tr><td colspan="12" class="empty-state">검색 결과가 없습니다.</td></tr>`);
  if(els['trade-table']) els['trade-table'].querySelectorAll('tr[data-id]').forEach(row => row.onclick = () => selectTrade(row.dataset.id));
  renderDetail();
}

function filteredTrades() {
  const q = getVal('q').trim().toLowerCase();
  const from = getVal('f-from'); const to = getVal('f-to');
  const status = getVal('f-status') || 'ALL'; const sort = getVal('sort') || 'newest';
  const arr = state.db.trades.filter(t => {
    const day = t.date.slice(0, 10);
    const hay = [day, t.ticker, t.setupEntry, t.setupExit, t.session, t.context, t.thesis, t.review, t.liveNotes, ...(t.tags || []), ...(t.mistakes || [])].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (status !== 'ALL' && t.status !== status) return false;
    return true;
  });
  const sorters = {
    newest: (a, b) => new Date(b.date) - new Date(a.date),
    oldest: (a, b) => new Date(a.date) - new Date(b.date),
    bestR: (a, b) => b.metrics.r - a.metrics.r,
    worstR: (a, b) => a.metrics.r - b.metrics.r,
  };
  return arr.sort(sorters[sort]);
}

function tradeRow(t) {
  const selected = t.id === state.selectedTradeId ? 'selected' : '';
  return `<tr class="${selected}" data-id="${t.id}"><td>${fmtDateTime(t.date)}</td><td>${statusBadge(t.status)}</td><td><strong>${escapeHtml(t.ticker)}</strong></td><td class="${t.side === 'LONG' ? 'positive' : 'negative'}">${t.side}</td><td>${escapeHtml(t.session)}</td><td>${escapeHtml(t.setupEntry)}</td><td class="mono">${num(t.metrics.avgEntry)}</td><td class="mono">${t.metrics.avgExit ? num(t.metrics.avgExit) : '-'}</td><td class="mono ${t.metrics.pnl >= 0 ? 'positive' : 'negative'}">${t.status === 'CLOSED' ? money(t.metrics.pnl) : '-'}</td><td class="mono ${t.metrics.r >= 0 ? 'positive' : 'negative'}">${t.status === 'CLOSED' ? `${t.metrics.r.toFixed(2)}R` : '-'}</td><td class="mono">${money(t.metrics.riskDollar)}</td><td>${chips(t.tags)}</td></tr>`;
}

function selectTrade(id) { state.selectedTradeId = id; renderLibrary(); }

function artifactLinks(arr = []) {
  if (!arr.length) return '<span class="neutral">-</span>';
  const tvLinks = arr.filter(u => u.includes('tradingview.com/x/'));
  const otherLinks = arr.filter(u => !u.includes('tradingview.com/x/'));
  let html = '';
  if (tvLinks.length) {
    html += `<div style="margin-top:10px; padding:12px; background:#18181b; border:1px solid #27272a; border-radius:8px;">
        <strong style="color:#fbbf24;">📂 Chart Vault (클릭하여 원본보기)</strong><div style="display:flex; gap:8px; margin-top:8px;">`;
    tvLinks.forEach((u, i) => { html += `<a href="${escapeAttr(u)}" target="_blank" style="padding:6px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#fff; text-decoration:none; font-size:12px;">📈 Chart ${i+1}</a>`; });
    html += `</div></div>`;
  }
  if (otherLinks.length) html += `<div style="margin-top:10px;">` + otherLinks.map((u, i) => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">🔗 Evidence Link ${i + 1}</a>`).join('<br>') + `</div>`;
  return html;
}

function renderDetail() {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (!trade) {
    setHtml('detail', emptyState('선택된 트레이드가 없습니다.'));
    setHtml('detail-insights', emptyState('데이터 없음'));
    return;
  }
  setText('review-breadcrumb', `${trade.ticker} · ${trade.side} · ${trade.setupEntry}`);
  
  let liveNoteHtml = trade.liveNotes ? `<div class="detail-box" style="margin-bottom:12px; border-color:var(--green);"><strong>🕒 Live Management Log</strong><br><br><span style="line-height:1.6; color:#a7f3d0; font-family:monospace;">${nl(escapeHtml(trade.liveNotes))}</span></div>` : '';
  
  setHtml('detail', `
    <div class="detail-actions">
      <button type="button" class="tool-btn" onclick="window.__desk.loadSelectedIntoJournal()">Journal에서 폼 열기</button>
    </div>
    <div class="detail-box">
      <div class="kv">
        <div>날짜</div><div>${fmtDateTime(trade.date)}</div>
        <div>티커</div><div>${escapeHtml(trade.ticker)}</div>
        <div>방향</div><div class="${trade.side === 'LONG' ? 'positive' : 'negative'}">${trade.side}</div>
        <div>손익</div><div class="mono ${trade.metrics.pnl >= 0 ? 'positive' : 'negative'}">${money(trade.metrics.pnl)} (${trade.metrics.r.toFixed(2)}R)</div>
      </div>
    </div>
    <div class="detail-box"><strong>증거 자료 (Charts)</strong><div>${artifactLinks(trade.artifacts)}</div></div>
    ${liveNoteHtml}
    <div class="detail-box"><strong>사후 복기 및 컨텍스트</strong><br><br><span style="line-height:1.6; color:#eef2ff;">${nl(escapeHtml(trade.review || '-'))}</span></div>
    <div class="detail-box"><strong>태그 & 실수</strong><div>${chips(trade.tags)} ${chips(trade.mistakes)}</div></div>`);
  
  const similar = similarTrades(trade);
  setHtml('detail-insights', `
    <div class="detail-box" style="margin-top:12px;"><strong>유사 샘플 비교</strong><div class="similar-list">${similar.length ? similar.map(item => `<div class="similar-item" onclick="if(document.getElementById('q')){document.getElementById('q').value='${item.id}';} window.__desk_lib_jump();"><strong>${fmtDateTime(item.date)}</strong><div>${escapeHtml(item.ticker)} · <span class="${item.metrics.r >= 0 ? 'positive' : 'negative'}">${item.metrics.r.toFixed(2)}R</span></div></div>`).join('') : '<span class="neutral">비교할 샘플 부족</span>'}</div></div>
  `);
}
window.__desk.loadSelectedIntoJournal = () => {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (trade) { switchView('journal'); loadTradeIntoForm(trade); }
};

function handleSubmit(event) {
  event.preventDefault();
  const trade = readForm();
  if (!trade.date || !trade.ticker) return alert('날짜와 티커가 필요합니다.');
  if (!trade.stopPrice || state.draftEntries.every(x => !Number(x.price))) return alert('손절가와 진입가가 필요합니다.');
  if (Math.round(sum(state.draftEntries.map(x => Number(x.weight || 0)))) !== 100) return alert('진입 비중 합계가 100이어야 합니다.');
  
  const normalized = normalizeTrade(trade);
  const index = state.db.trades.findIndex(t => t.id === normalized.id);
  if (index >= 0) state.db.trades[index] = normalized;
  else state.db.trades.unshift(normalized);

  syncMeta(normalized); saveDB(state.db); clearDraft(); state.dirty = false; state.selectedTradeId = normalized.id;
  render(); switchView('library');
}

function deleteTrade() {
  const id = getVal('trade-id'); if (!id) return;
  if (!confirm('삭제하시겠습니까?')) return;
  state.db.trades = state.db.trades.filter(t => t.id !== id);
  saveDB(state.db); clearDraft(); state.selectedTradeId = null; resetForm(); render(); switchView('library');
}

function duplicateTrade() {
  if (!getVal('trade-id')) return;
  setVal('trade-id', ''); setVal('trade-date', inputDate(new Date().toISOString()));
  state.dirty = true; switchView('journal'); refreshJournalStatus('복제본 준비됨'); persistDraft();
}

function readForm() {
  return {
    id: getVal('trade-id') || crypto.randomUUID(),
    date: toISO(getVal('trade-date')),
    ticker: getVal('ticker').trim().toUpperCase(),
    status: getVal('status'),
    session: getVal('session'),
    side: getVal('side'),
    setupEntry: getVal('setup-entry').trim().toUpperCase(),
    setupExit: getVal('setup-exit').trim().toUpperCase(),
    emotion: getVal('emotion').trim(),
    accountSize: Number(getVal('account-size') || 0),
    riskPct: Number(getVal('risk-pct') || 0),
    leverage: Number(getVal('leverage') || 1),
    makerFee: Number(getVal('maker-fee') || 0),
    takerFee: Number(getVal('taker-fee') || 0),
    stopPrice: Number(getVal('stop-price') || 0),
    stopType: getVal('stop-type'),
    adjustment: Number(getVal('adjustment') || 0),
    tags: splitComma(getVal('tags')),
    mistakes: splitComma(getVal('mistakes')),
    context: getVal('context').trim(),
    thesis: getVal('thesis').trim(),
    review: getVal('review').trim(),
    liveNotes: getVal('live-notes').trim(),
    artifacts: splitLines(getVal('artifacts')),
    entries: state.draftEntries.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    exits: state.draftExits.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
  };
}

function resetForm(options = {}) {
  setVal('trade-id', ''); setVal('trade-date', inputDate(new Date().toISOString()));
  setVal('stop-price', ''); setVal('adjustment', 0); setVal('tags', ''); setVal('mistakes', '');
  setVal('context', ''); setVal('thesis', ''); setVal('review', ''); setVal('artifacts', ''); setVal('live-notes', '');
  
  setVal('account-size', state.db.meta.accountBalance || 10000);
  
  state.draftEntries = [{ price: 0, type: 'M', weight: 100 }]; state.draftExits = [];
  renderLegs('entry'); renderLegs('exit'); state.dirty = false;
  if (!options.keepDraft) clearDraft();
  updatePreview(); refreshJournalStatus();
}

function loadTradeIntoForm(trade) {
  setVal('trade-id', trade.id); setVal('trade-date', inputDate(new Date(trade.date)));
  setVal('ticker', trade.ticker); setVal('status', trade.status); setVal('session', trade.session); setVal('side', trade.side);
  setVal('setup-entry', trade.setupEntry); setVal('setup-exit', trade.setupExit); setVal('emotion', trade.emotion || 'CALM');
  setVal('account-size', Math.round(trade.accountSize)); setVal('risk-pct', trade.riskPct); setVal('leverage', trade.leverage);
  setVal('maker-fee', trade.makerFee); setVal('taker-fee', trade.takerFee); setVal('stop-price', trade.stopPrice); setVal('stop-type', trade.stopType);
  setVal('adjustment', trade.adjustment ?? 0);
  setVal('tags', (trade.tags || []).join(', ')); setVal('mistakes', (trade.mistakes || []).join(', '));
  setVal('context', trade.context || ''); setVal('thesis', trade.thesis || ''); setVal('review', trade.review || ''); setVal('artifacts', (trade.artifacts || []).join('\n'));
  setVal('live-notes', trade.liveNotes || '');
  
  state.draftEntries = structuredClone(trade.entries || []); state.draftExits = structuredClone(trade.exits || []);
  renderLegs('entry'); renderLegs('exit'); state.dirty = false; updatePreview(); refreshJournalStatus();
}

function renderLegs(kind) {
  const target = kind === 'entry' ? state.draftEntries : state.draftExits;
  const holder = kind === 'entry' ? els.entries : els.exits;
  if(!holder) return;
  holder.innerHTML = target.map((row, index) => `
    <div class="leg-row">
      <div class="input-with-unit"><span class="unit">$</span><input type="number" step="0.01" value="${row.price}" data-kind="${kind}" data-index="${index}" data-field="price" placeholder="가격" /></div>
      <select data-kind="${kind}" data-index="${index}" data-field="type"><option value="M" ${row.type === 'M' ? 'selected' : ''}>Maker</option><option value="T" ${row.type === 'T' ? 'selected' : ''}>Taker</option></select>
      <div class="input-with-unit"><input type="number" step="0.1" value="${row.weight}" data-kind="${kind}" data-index="${index}" data-field="weight" placeholder="비중" /><span class="unit">%</span></div>
      <button type="button" class="btn-del" data-remove-kind="${kind}" data-remove-index="${index}">✕</button>
    </div>`).join('');

  holder.querySelectorAll('input, select').forEach(input => {
    input.oninput = input.onchange = () => {
      const arr = input.dataset.kind === 'entry' ? state.draftEntries : state.draftExits;
      arr[Number(input.dataset.index)][input.dataset.field] = input.value;
      markDirty(); updatePreview(); persistDraft();
    };
  });
  holder.querySelectorAll('[data-remove-kind]').forEach(btn => btn.onclick = () => {
    const arr = btn.dataset.removeKind === 'entry' ? state.draftEntries : state.draftExits;
    arr.splice(Number(btn.dataset.removeIndex), 1);
    if (btn.dataset.removeKind === 'entry' && !arr.length) arr.push({ price: 0, type: 'M', weight: 100 });
    markDirty(); renderLegs(btn.dataset.removeKind); updatePreview(); persistDraft();
  });
}

function updatePreview() {
  const metrics = recalcTrade(readForm());
  if (metrics.directionError || !metrics.valid) {
    resetRiskPlanner(); setHtml('calc-summary', '<span style="color:#ef4444;">유효한 진입가, 손절가(방향 확인), 비중 100%가 필요합니다.</span>'); return;
  }
  
  setText('risk-risk-dollar', money(metrics.riskDollar));
  setText('risk-qty', metrics.qty.toFixed(5));
  setText('risk-margin', money(metrics.margin));
  
  if(els['risk-slider']) {
    els['risk-slider'].textContent = `${metrics.sliderPct.toFixed(1)}%`;
    els['risk-slider'].style.color = metrics.sliderPct > 100 ? '#ef4444' : '#34d399';
  }
  
  setText('risk-notional', money(metrics.qty * metrics.avgEntry));
  setText('risk-stop-distance', `${(metrics.avgEntry ? Math.abs(metrics.avgEntry - Number(getVal('stop-price') || 0)) / metrics.avgEntry * 100 : 0).toFixed(2)}%`);
  setText('risk-fees', money(metrics.totalFees));
  
  setHtml('calc-summary', `Avg Entry: <strong>${num(metrics.avgEntry)}</strong> | Qty: <strong>${metrics.qty.toFixed(5)}</strong><br>Net PnL: <strong class="${metrics.pnl >= 0 ? 'positive' : 'negative'}">${money(metrics.pnl)} (${metrics.r.toFixed(2)}R)</strong>`);
}

function resetRiskPlanner() {
  setText('risk-risk-dollar', money(0)); setText('risk-qty', '0.00000');
  setText('risk-margin', money(0)); setText('risk-slider', '0.0%'); if(els['risk-slider']) els['risk-slider'].style.color = '#34d399';
  setText('risk-notional', money(0)); setText('risk-stop-distance', '0.00%'); setText('risk-fees', money(0));
}

function renderQuickFill() {
  if(!els['quick-tags']) return;
  renderQuickButtons('quick-tags', countTags(state.db.trades, t => t.tags || []).slice(0,6).map(x => x.label), value => appendCsvValue(els.tags, value));
  renderQuickButtons('quick-mistakes', countTags(state.db.trades, t => t.mistakes || []).slice(0,6).map(x => x.label), value => appendCsvValue(els.mistakes, value));
}

function renderQuickButtons(id, values, onClick) {
  const unique = uniq(values).filter(Boolean);
  setHtml(id, unique.length ? unique.map(v => `<button type="button" class="chip-btn" data-value="${escapeAttr(v)}">+ ${escapeHtml(v)}</button>`).join('') : '');
  if(els[id]) els[id].querySelectorAll('[data-value]').forEach(btn => btn.onclick = () => onClick(btn.dataset.value));
}

function appendCsvValue(input, value) {
  if(!input) return;
  const items = splitComma(input.value);
  if (!items.includes(value)) items.push(value);
  input.value = items.join(', '); markDirty(); updatePreview(); persistDraft();
}

function handleImport(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { state.db = parseImport(reader.result); saveDB(state.db); state.selectedTradeId = null; render(); alert('가져오기 완료!'); } catch { alert('유효한 JSON 파일이 아닙니다.'); } }; reader.readAsText(file);
}

function clearFilters() { ['q','f-from','f-to'].forEach(id => setVal(id, '')); setVal('f-status', 'ALL'); setVal('sort', 'newest'); renderLibrary(); }

function syncMeta(trade) {
  if (trade.ticker && !state.db.meta.tickers.includes(trade.ticker)) state.db.meta.tickers.push(trade.ticker);
  if (trade.setupEntry && !state.db.meta.entrySetups.includes(trade.setupEntry)) state.db.meta.entrySetups.push(trade.setupEntry);
  if (trade.setupExit && !state.db.meta.exitSetups.includes(trade.setupExit)) state.db.meta.exitSetups.push(trade.setupExit);
  if (trade.emotion && !state.db.meta.emotions.includes(trade.emotion)) state.db.meta.emotions.push(trade.emotion);
}

function similarTrades(trade) { return state.db.trades.filter(t => t.id !== trade.id).map(t => ({ ...t, score: (t.setupEntry === trade.setupEntry ? 4 : 0) + (t.ticker === trade.ticker ? 3 : 0) + (t.side === trade.side ? 2 : 0) + ((t.mistakes || []).some(x => (trade.mistakes || []).includes(x)) ? 1 : 0) })).filter(t => t.score > 0).sort((a,b) => b.score - a.score || new Date(b.date) - new Date(a.date)).slice(0, 5); }
function stepSelectedTrade(delta) { const rows = state.currentLibraryRows || []; if (!rows.length) return; const index = rows.findIndex(t => t.id === state.selectedTradeId); const nextIndex = Math.min(rows.length - 1, Math.max(0, index + delta)); state.selectedTradeId = rows[nextIndex].id; renderLibrary(); }
function filterBySelectedSetup() { const trade = state.db.trades.find(t => t.id === state.selectedTradeId); if (!trade) return; setVal('q', trade.setupEntry || ''); renderLibrary(); }
function filterBySelectedTicker() { const trade = state.db.trades.find(t => t.id === state.selectedTradeId); if (!trade) return; setVal('q', trade.ticker || ''); renderLibrary(); }
function clearQuickFilter() { setVal('q', ''); renderLibrary(); }

function hydrateInitialForm() { const draft = loadDraft(); if (draft) { applyDraftToForm(draft); state.dirty = false; state.draftMeta = draft.savedAt || null; refreshJournalStatus('임시저장 불러옴'); return; } resetForm({ keepDraft: true }); }
function applyDraftToForm(draft) {
  setVal('trade-id', draft.id || ''); setVal('trade-date', draft.tradeDate || inputDate(new Date().toISOString()));
  setVal('ticker', draft.ticker || 'BTCUSDT'); setVal('status', draft.status || 'CLOSED'); setVal('session', draft.session || 'NEW YORK'); setVal('side', draft.side || 'LONG');
  setVal('setup-entry', draft.setupEntry || 'BREAKOUT'); setVal('setup-exit', draft.setupExit || 'TRAIL STOP'); setVal('emotion', draft.emotion || 'CALM');
  setVal('account-size', Math.round(draft.accountSize ?? (state.db.meta.accountBalance || 10000))); setVal('risk-pct', draft.riskPct ?? 0.5); setVal('leverage', draft.leverage ?? 10);
  setVal('maker-fee', draft.makerFee ?? 0.02); setVal('taker-fee', draft.takerFee ?? 0.05); setVal('stop-price', draft.stopPrice ?? ''); setVal('stop-type', draft.stopType || 'M');
  setVal('adjustment', draft.adjustment ?? 0); setVal('tags', draft.tags || ''); setVal('mistakes', draft.mistakes || ''); setVal('context', draft.context || ''); setVal('thesis', draft.thesis || ''); setVal('review', draft.review || ''); setVal('artifacts', draft.artifacts || ''); setVal('live-notes', draft.liveNotes || '');
  state.draftEntries = Array.isArray(draft.entries) && draft.entries.length ? draft.entries : [{ price: 0, type: 'M', weight: 100 }]; state.draftExits = Array.isArray(draft.exits) ? draft.exits : [];
  renderLegs('entry'); renderLegs('exit'); updatePreview();
}
function persistDraft() { const draft = snapshotDraft(); saveDraft(draft); if(els['desk-rules']) { state.prefs.deskRules = els['desk-rules'].value; savePrefs(state.prefs); } state.draftMeta = new Date().toISOString(); refreshJournalStatus(); }
function snapshotDraft() { return { id: getVal('trade-id') || '', tradeDate: getVal('trade-date'), ticker: getVal('ticker'), status: getVal('status'), session: getVal('session'), side: getVal('side'), setupEntry: getVal('setup-entry'), setupExit: getVal('setup-exit'), emotion: getVal('emotion'), accountSize: getVal('account-size'), riskPct: getVal('risk-pct'), leverage: getVal('leverage'), makerFee: getVal('maker-fee'), takerFee: getVal('taker-fee'), stopPrice: getVal('stop-price'), stopType: getVal('stop-type'), adjustment: getVal('adjustment'), tags: getVal('tags'), mistakes: getVal('mistakes'), context: getVal('context'), thesis: getVal('thesis'), review: getVal('review'), liveNotes: getVal('live-notes'), artifacts: getVal('artifacts'), entries: structuredClone(state.draftEntries), exits: structuredClone(state.draftExits) }; }
function markDirty() { state.dirty = true; refreshJournalStatus(); }
function refreshJournalStatus(message = '') { if(!els['journal-status']) return; els['journal-status'].textContent = message || (state.dirty ? '저장 안 됨' : '정상'); els['draft-saved-at'].textContent = state.draftMeta ? `임시저장 ${fmtSavedAt(state.draftMeta)}` : ''; }
function fmtSavedAt(iso) { return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 's') { event.preventDefault(); if (state.view !== 'journal') switchView('journal'); if(els['trade-form']) els['trade-form'].requestSubmit(); return; }
    if (meta && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateTrade(); return; }
    if (!meta && event.key.toLowerCase() === 'j' && !isTypingContext(event.target) && state.view === 'library') { event.preventDefault(); stepSelectedTrade(1); return; }
    if (!meta && event.key.toLowerCase() === 'k' && !isTypingContext(event.target) && state.view === 'library') { event.preventDefault(); stepSelectedTrade(-1); return; }
  });
}
function isTypingContext(target) { return ['INPUT','TEXTAREA','SELECT'].includes(target?.tagName); }

function lineSvg(points) {
  const width = 640, height = 260, padX = 28, padY = 20; const ys = points.map(p => p.y); const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0); const range = maxY - minY || 1;
  const x = i => padX + (i * (width - padX * 2) / Math.max(1, points.length - 1)); const y = val => height - padY - ((val - minY) / range) * (height - padY * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.y)}`).join(' '); const area = `${path} L ${x(points.length - 1)} ${height - padY} L ${x(0)} ${height - padY} Z`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><line class="grid-line" x1="${padX}" x2="${width-padX}" y1="${y(0)}" y2="${y(0)}"></line><path class="area" d="${area}"></path><path class="line" d="${path}"></path><text class="axis" x="${padX}" y="15">${money(maxY)}</text><text class="axis" x="${padX}" y="${height - 4}">${money(minY)}</text></svg>`;
}
function barSvg(data) {
  const width = 640, height = 240, padX = 28, padY = 20; const max = Math.max(...data.map(d => Math.abs(d.value)), 1); const rowH = (height - padY * 2) / data.length;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${data.map((d, i) => {
    const w = (Math.abs(d.value) / max) * (width - 180); const y = padY + i * rowH + 6; const x = 150;
    return `<text class="axis" x="0" y="${y + 12}">${escapeHtml(d.label)}</text><rect class="${d.value >= 0 ? 'bar-pos' : 'bar-neg'}" x="${x}" y="${y}" width="${w}" height="16" rx="6"></rect><text class="axis" x="${x + w + 8}" y="${y + 12}">${d.value.toFixed(2)}R</text>`;
  }).join('')}</svg>`;
}

function label(v) { return ({ overview: 'Overview', journal: 'Journal', library: 'Library' })[v]; }
function money(n) { const v = Number(n || 0); return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`; }
function num(n) { return Number(n || 0).toFixed(2); }
function numberClass(v) { const s = String(v); if (s === 'MAX') return 'positive'; return s.startsWith('-') ? 'negative' : 'positive'; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDateTime(iso) { return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function statusBadge(status) { return `<span class="badge ${status === 'CLOSED' ? 'badge-good' : 'badge-warn'}">${status}</span>`; }
function chips(arr = []) { return arr.length ? `<div class="chips">${arr.map(x => `<span class="chip">${escapeHtml(x)}</span>`).join('')}</div>` : '<span class="neutral">-</span>'; }
function emptyState(text) { return `<div class="empty-state">${text}</div>`; }
function nl(text) { return text.replace(/\n/g, '<br>'); }
function splitComma(text) { return text.split(',').map(x => x.trim()).filter(Boolean); }
function splitLines(text) { return text.split('\n').map(x => x.trim()).filter(Boolean); }
function inputDate(date) { const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function toISO(value) { return value ? new Date(value).toISOString() : ''; }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function escapeHtml(str = '') { return String(str).replace(/[&<>"']/g, s => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
function escapeAttr(str = '') { return escapeHtml(str); }
function sum(arr) { return arr.reduce((a, b) => a + Number(b || 0), 0); }
