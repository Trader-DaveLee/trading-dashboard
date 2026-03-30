import { recalcTrade } from './calc.js';
import { summarize, groupAverageR, countTags, tagStats, bucketStats, recentWindowStats } from './analytics.js';
import { loadDB, saveDB, exportDB, parseImport, normalizeTrade, loadDraft, saveDraft, clearDraft, loadPrefs, savePrefs } from './storage.js';

const state = {
  db: loadDB(), view: 'overview', month: new Date(), selectedTradeId: null,
  draftEntries: [{ price: 0, type: 'M', weight: 100 }], draftExits: [], dirty: false, prefs: loadPrefs(), draftMeta: null,
};

const views = ['overview', 'journal', 'library'];
const els = {};
window.__desk = { manageDrops: t => manageDrops(t) };

// HTML과 완벽하게 동기화된 최신 ID 리스트
const ID_LIST = [
  'nav','export-json','import-json-btn','import-json','journal-status','draft-saved-at',
  'metrics','prev-month','calendar-title','next-month','cal-days','equity-chart',
  'editId','ticker','grade','setupEntry','acc','risk','lev','fM','fT','dir','sl','slType',
  'entries_container','add-entry','entry_res','setupExit','exits_container','add-exit','exit_res',
  'toggle-deep-journal','deep-journal-section','emotion','fineTune','tags','mistakes',
  'quick-tags','quick-mistakes','img1','img2','memo','btnOpen','btnClose','reset-form',
  'delete-trade','btnCancel','risk-risk-dollar','risk-qty','risk-margin','risk-slider',
  'risk-notional','risk-stop-distance','risk-fees','desk-rules','q','f-from','f-to',
  'f-status','sort','clear-filters','library-result-count','history_body','detail',
  'chart_vault','vault_links','detail-insights'
];

// Dynamic Metadata Pools
let tickers = JSON.parse(localStorage.getItem('oms_tickers_v7')) || ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
let setupsE = JSON.parse(localStorage.getItem('oms_setups_e_v7')) || ["BREAKOUT", "MEAN REVERSION"];
let setupsX = JSON.parse(localStorage.getItem('oms_setups_x_v7')) || ["1.5R TARGET", "TRAIL STOP"];
let emotions = JSON.parse(localStorage.getItem('oms_emotions_v7')) || ["CALM", "FOMO", "REVENGE", "TIRED"];

bootstrap();

function bootstrap() { cacheEls(); bindEvents(); renderDrops(); hydrateInitialForm(); render(); }
function cacheEls() { ID_LIST.forEach(id => { els[id] = document.getElementById(id); }); }

function bindEvents() {
  document.getElementById('prev-month').onclick = () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); };
  document.getElementById('next-month').onclick = () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); };
  
  els['add-entry'].onclick = () => { state.draftEntries.push({ price: 0, type: 'M', weight: 0 }); renderLegs('entry'); updatePreview(); };
  els['add-exit'].onclick = () => { state.draftExits.push({ price: 0, type: 'M', weight: 0 }); renderLegs('exit'); updatePreview(); };
  
  els['btnOpen'].onclick = () => saveTrade('OPEN');
  els['btnClose'].onclick = () => saveTrade('CLOSED');
  els['reset-form'].onclick = resetForm;
  els['delete-trade'].onclick = deleteTrade;
  els['export-json'].onclick = () => exportDB(state.db);
  els['import-json-btn'].onclick = () => els['import-json'].click();
  els['import-json'].onchange = handleImport;
  els['clear-filters'].onclick = clearFilters;
  
  els['toggle-deep-journal'].onclick = (e) => {
    els['deep-journal-section'].classList.toggle('hidden');
    e.target.textContent = els['deep-journal-section'].classList.contains('hidden') ? '📝 딥 저널링 펼치기 (감정, 실수, 차트) ▼' : '📝 딥 저널링 접기 ▲';
  };

  const inputFields = ['ticker','grade','setupEntry','setupExit','acc','risk','lev','fM','fT','dir','sl','slType','emotion','fineTune','tags','mistakes','img1','img2','memo','desk-rules'];
  inputFields.forEach(id => {
    if(els[id]) { 
      els[id].addEventListener('input', () => { markDirty(); updatePreview(); persistDraft(); }); 
      els[id].addEventListener('change', () => { markDirty(); updatePreview(); persistDraft(); }); 
    }
  });

  ['q','f-from','f-to','f-status','sort'].forEach(id => { 
    if(els[id]) { els[id].addEventListener('input', renderHistory); els[id].addEventListener('change', renderHistory); } 
  });
}

function render() { renderNav(); renderOverview(); renderHistory(); updatePreview(); refreshJournalStatus(); renderQuickTags(); }

function renderNav() { 
  els.nav.innerHTML = views.map(view => `<button class="${state.view === view ? 'active' : ''}" data-view="${view}">${view.toUpperCase()}</button>`).join(''); 
  els.nav.querySelectorAll('button').forEach(btn => btn.onclick = () => switchView(btn.dataset.view)); 
}

function switchView(view) { 
  state.view = view; 
  document.querySelectorAll('.ds-tab').forEach(el => el.classList.remove('active')); 
  document.getElementById('view-'+view).classList.add('active'); 
  renderNav(); 
  if(view==='overview') renderOverview(); 
}

// --- Dropdowns & Quick Tags ---
function renderDrops() { populate('ticker', tickers); populate('setupEntry', setupsE); populate('setupExit', setupsX); populate('emotion', emotions); }
function populate(id, data) { let sel = els[id]; if(!sel) return; sel.innerHTML = ''; data.forEach(s => sel.appendChild(new Option(s, s))); }

function manageDrops(type) {
  let title = type==='ticker'?'Ticker':type==='setupE'?'Entry Setup':type==='setupX'?'Exit Setup':'Emotion';
  let arr = type==='ticker'?tickers:type==='setupE'?setupsE:type==='setupX'?setupsX:emotions;
  let id = type==='ticker'?'ticker':type==='setupE'?'setupEntry':type==='setupX'?'setupExit':'emotion';
  
  let act = prompt(`Manage ${title}\n추가하려면 'ADD', 삭제하려면 'DEL'을 입력하세요:`).toUpperCase();
  if(act === 'ADD') { let n = prompt(`새로운 ${title} 이름:`); if(n) { arr.push(n.toUpperCase()); saveDrops(); els[id].value = n.toUpperCase(); } } 
  else if(act === 'DEL') { let v = els[id].value; if(type==='ticker') tickers=tickers.filter(x=>x!==v); else if(type==='setupE') setupsE=setupsE.filter(x=>x!==v); else if(type==='setupX') setupsX=setupsX.filter(x=>x!==v); else emotions=emotions.filter(x=>x!==v); saveDrops(); }
}
function saveDrops() { localStorage.setItem('oms_tickers_v7', JSON.stringify(tickers)); localStorage.setItem('oms_setups_e_v7', JSON.stringify(setupsE)); localStorage.setItem('oms_setups_x_v7', JSON.stringify(setupsX)); localStorage.setItem('oms_emotions_v7', JSON.stringify(emotions)); renderDrops(); }

function renderQuickTags() {
    if(!els['quick-tags']) return;
    const popularTags = countTags(state.db.trades, t => t.tags || []).slice(0,6).map(x=>x.label);
    const popularMistakes = countTags(state.db.trades, t => t.mistakes || []).slice(0,6).map(x=>x.label);
    
    els['quick-tags'].innerHTML = popularTags.map(t => `<button type="button" class="chip-btn" onclick="document.getElementById('tags').value += (document.getElementById('tags').value ? ', ' : '') + '${t}';">+ ${t}</button>`).join('');
    els['quick-mistakes'].innerHTML = popularMistakes.map(t => `<button type="button" class="chip-btn" style="color:var(--warn);" onclick="document.getElementById('mistakes').value += (document.getElementById('mistakes').value ? ', ' : '') + '${t}';">+ ${t}</button>`).join('');
}

// --- Draft & Forms ---
function hydrateInitialForm() { const draft = loadDraft(); if (draft) { applyDraftToForm(draft); state.dirty = false; state.draftMeta = draft.savedAt || null; refreshJournalStatus('임시저장 불러옴'); return; } resetForm({ keepDraft: true }); }

function applyDraftToForm(draft) {
  if(els['editId']) els['editId'].value = draft.id || '';
  if(els['ticker']) els['ticker'].value = draft.ticker || 'BTCUSDT';
  if(els['grade']) els['grade'].value = draft.grade || 'B';
  if(els['setupEntry']) els['setupEntry'].value = draft.setupEntry || 'BREAKOUT';
  if(els['setupExit']) els['setupExit'].value = draft.setupExit || 'TRAIL STOP';
  if(els['dir']) els['dir'].value = draft.side === 'SHORT' ? -1 : 1;
  if(els['acc']) els['acc'].value = draft.accountSize ?? 10000;
  if(els['risk']) els['risk'].value = draft.riskPct ?? 0.5;
  if(els['lev']) els['lev'].value = draft.leverage ?? 10;
  if(els['fM']) els['fM'].value = draft.makerFee ?? 0.02;
  if(els['fT']) els['fT'].value = draft.takerFee ?? 0.05;
  if(els['sl']) els['sl'].value = draft.stopPrice ?? '';
  if(els['slType']) els['slType'].value = draft.stopType || 'M';
  if(els['emotion']) els['emotion'].value = draft.emotion || 'CALM';
  if(els['fineTune']) els['fineTune'].value = draft.adjustment ?? 0;
  if(els['tags']) els['tags'].value = draft.tags || '';
  if(els['mistakes']) els['mistakes'].value = draft.mistakes || '';
  if(els['memo']) els['memo'].value = draft.review || '';
  if(els['img1']) els['img1'].value = draft.artifacts?.[0] || '';
  if(els['img2']) els['img2'].value = draft.artifacts?.[1] || '';

  state.draftEntries = Array.isArray(draft.entries) && draft.entries.length ? draft.entries : [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = Array.isArray(draft.exits) ? draft.exits : [];
  renderLegs('entry'); renderLegs('exit'); updatePreview();
}

function snapshotDraft() {
  return {
    id: els['editId']?.value || '',
    tradeDate: new Date().toISOString(), // Internal sync
    ticker: els['ticker']?.value || 'BTCUSDT',
    status: 'OPEN',
    session: 'NEW YORK', // Background default
    side: els['dir']?.value == -1 ? 'SHORT' : 'LONG',
    setupEntry: els['setupEntry']?.value || '',
    setupExit: els['setupExit']?.value || '',
    grade: els['grade']?.value || 'B',
    emotion: els['emotion']?.value || '',
    accountSize: Number(els['acc']?.value || 10000),
    riskPct: Number(els['risk']?.value || 0.5),
    leverage: Number(els['lev']?.value || 10),
    makerFee: Number(els['fM']?.value || 0.02),
    takerFee: Number(els['fT']?.value || 0.05),
    stopPrice: Number(els['sl']?.value || 0),
    stopType: els['slType']?.value || 'M',
    adjustment: Number(els['fineTune']?.value || 0),
    tags: els['tags']?.value || '',
    mistakes: els['mistakes']?.value || '',
    review: els['memo']?.value || '',
    artifacts: [els['img1']?.value, els['img2']?.value].filter(Boolean),
    entries: structuredClone(state.draftEntries),
    exits: structuredClone(state.draftExits)
  };
}

function persistDraft() { const draft = snapshotDraft(); saveDraft(draft); if(els['desk-rules']) {state.prefs.deskRules = els['desk-rules'].value; savePrefs(state.prefs);} state.draftMeta = new Date().toISOString(); refreshJournalStatus(); }
function markDirty() { state.dirty = true; refreshJournalStatus(); }
function refreshJournalStatus(msg = '') { if(!els['journal-status']) return; els['journal-status'].textContent = msg || (state.dirty ? '저장 필요' : '정상'); els['draft-saved-at'].textContent = state.draftMeta ? new Date(state.draftMeta).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''; }

function renderLegs(kind) {
  const target = kind === 'entry' ? state.draftEntries : state.draftExits; 
  const holder = kind === 'entry' ? els['entries_container'] : els['exits_container'];
  if(!holder) return;
  holder.innerHTML = target.map((row, index) => `<div class="leg-row"><input type="number" step="0.01" value="${row.price}" data-kind="${kind}" data-index="${index}" data-field="price" /><select data-kind="${kind}" data-index="${index}" data-field="type"><option value="M" ${row.type === 'M' ? 'selected' : ''}>Mkr</option><option value="T" ${row.type === 'T' ? 'selected' : ''}>Tkr</option></select><input type="number" step="0.1" value="${row.weight}" data-kind="${kind}" data-index="${index}" data-field="weight" /><button type="button" class="btn-del" data-remove-kind="${kind}" data-remove-index="${index}">✕</button></div>`).join('');
  holder.querySelectorAll('[data-field]').forEach(input => { input.onchange = () => { const arr = input.dataset.kind === 'entry' ? state.draftEntries : state.draftExits; arr[Number(input.dataset.index)][input.dataset.field] = input.value; markDirty(); updatePreview(); persistDraft(); }; });
  holder.querySelectorAll('[data-remove-kind]').forEach(btn => { btn.onclick = () => { const arr = btn.dataset.removeKind === 'entry' ? state.draftEntries : state.draftExits; arr.splice(Number(btn.dataset.removeIndex), 1); if (btn.dataset.removeKind === 'entry' && !arr.length) arr.push({ price: 0, type: 'M', weight: 100 }); markDirty(); renderLegs(btn.dataset.removeKind); updatePreview(); persistDraft(); }; });
}

function updatePreview() {
  const draft = snapshotDraft();
  const metrics = recalcTrade(draft);
  
  if (metrics.directionError || !metrics.valid) { if(els['calc-summary']) els['calc-summary'].innerHTML = '<span style="color:var(--red);">유효한 진입가, 손절가, 비중 100%가 필요합니다.</span>'; return; }
  
  if(els['risk-risk-dollar']) els['risk-risk-dollar'].textContent = `-$${Math.abs(metrics.riskDollar).toFixed(2)}`;
  if(els['risk-qty']) els['risk-qty'].textContent = metrics.qty.toFixed(5);
  if(els['risk-margin']) els['risk-margin'].textContent = `$${metrics.margin.toFixed(2)}`;
  if(els['risk-slider']) { els['risk-slider'].textContent = `${metrics.sliderPct.toFixed(1)}%`; els['risk-slider'].style.color = metrics.sliderPct > 100 ? 'var(--red)' : 'var(--green)'; }
  if(els['risk-notional']) els['risk-notional'].textContent = `$${(metrics.qty * metrics.avgEntry).toFixed(2)}`;
  if(els['risk-stop-distance']) els['risk-stop-distance'].textContent = `${(metrics.avgEntry ? Math.abs(metrics.avgEntry - Number(els['sl'].value||0))/metrics.avgEntry*100 : 0).toFixed(2)}%`;
  if(els['risk-fees']) els['risk-fees'].textContent = `$${metrics.totalFees.toFixed(2)}`;
  
  if(els['calc-summary']) els['calc-summary'].innerHTML = `Avg Entry: <strong style="color:#fff;">${metrics.avgEntry.toFixed(2)}</strong> | Qty: <strong style="color:#fff;">${metrics.qty.toFixed(5)}</strong><br>Net PnL: <strong class="${metrics.pnl >= 0 ? 'win' : 'loss'}">$${metrics.pnl.toFixed(2)} (${metrics.r.toFixed(2)}R)</strong>`;
}

// --- CRUD ---
function saveTrade(stat) {
  let draft = snapshotDraft();
  let metrics = recalcTrade(draft);
  if (metrics.size === 0 || !metrics.valid) return alert("유효한 진입가/손절가를 입력하세요.");
  if (stat === 'CLOSED' && state.draftExits.reduce((s, x) => s + (parseFloat(x.weight)||0), 0) !== 100) return alert("CLOSED 상태로 저장하려면 청산 비중 합계가 100%여야 합니다.");

  let existingTrade = state.db.trades.find(t => t.id === draft.id);
  let tradeDate = existingTrade ? existingTrade.date : new Date().toISOString();

  let trade = { 
      ...draft, 
      id: draft.id || crypto.randomUUID(), 
      status: stat, 
      date: tradeDate, 
      dispDate: new Date(tradeDate).toLocaleDateString('ko-KR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}),
      tags: draft.tags.split(',').map(x=>x.trim()).filter(Boolean), 
      mistakes: draft.mistakes.split(',').map(x=>x.trim()).filter(Boolean), 
      metrics: metrics 
  };
  
  let idx = state.db.trades.findIndex(t => t.id === trade.id);
  if(idx >= 0) state.db.trades[idx] = trade; else state.db.trades.unshift(trade);
  
  saveDB(state.db); clearDraft(); state.dirty = false;
  resetForm(); renderOverview(); renderHistory(); switchView('library'); renderQuickTags();
}

function loadIntoForm(id) {
  let t = state.db.trades.find(x => x.id === id); if(!t) return;
  if(t.ticker && !tickers.includes(t.ticker)) { tickers.push(t.ticker); saveDrops(); }
  if(t.setupEntry && !setupsE.includes(t.setupEntry)) { setupsE.push(t.setupEntry); saveDrops(); }
  if(t.setupExit && !setupsX.includes(t.setupExit)) { setupsX.push(t.setupExit); saveDrops(); }
  if(t.emotion && !emotions.includes(t.emotion)) { emotions.push(t.emotion); saveDrops(); }
  
  applyDraftToForm({ id: t.id, ticker: t.ticker, side: t.side, setupEntry: t.setupEntry, setupExit: t.setupExit, grade: t.grade, emotion: t.emotion, accountSize: t.accountSize, riskPct: t.riskPct, leverage: t.leverage, makerFee: t.makerFee, takerFee: t.takerFee, stopPrice: t.stopPrice, stopType: t.stopType, adjustment: t.adjustment, tags: (t.tags||[]).join(', '), mistakes: (t.mistakes||[]).join(', '), review: t.review, artifacts: t.artifacts, entries: structuredClone(t.entries), exits: structuredClone(t.exits) });
  
  if(els['btnCancel']) els['btnCancel'].style.display = "block";
  switchView('journal');
}

function resetForm(opt={}) { if(els['editId']) els['editId'].value = ""; state.draftEntries = [{ price: 0, type: 'M', weight: 100 }]; state.draftExits = []; if(els['sl']) els['sl'].value = ""; if(els['fineTune']) els['fineTune'].value = 0; if(els['memo']) els['memo'].value = ""; if(els['tags']) els['tags'].value = ""; if(els['mistakes']) els['mistakes'].value = ""; if(els['img1']) els['img1'].value = ""; if(els['img2']) els['img2'].value = ""; renderLegs('entry'); renderLegs('exit'); updatePreview(); if(!opt.keepDraft) clearDraft(); if(els['btnCancel']) els['btnCancel'].style.display = "none"; }
function cancelEdit() { resetForm(); switchView('library'); }
function deleteTrade() { let id = els['editId']?.value; if(!id) return; if(confirm('Delete this trade?')) { state.db.trades = state.db.trades.filter(t => t.id !== id); saveDB(state.db); resetForm(); renderOverview(); renderHistory(); switchView('library'); } }

// --- Library & Overview ---
function renderHistory() {
  let b = els['history_body']; if(!b) return; b.innerHTML = '';
  let q = els.q?.value.toLowerCase() || ''; let start = els['fStart']?.value; let end = els['fEnd']?.value; let stat = els['f-status']?.value || 'ALL'; let sort = els.sort?.value || 'newest';
  
  let arr = state.db.trades.filter(t => {
    let d = t.date.slice(0,10); let h = [t.ticker, t.setupEntry, t.setupExit, t.grade, ...(t.tags||[])].join(' ').toLowerCase();
    if(q && !h.includes(q)) return false; if(start && d < start) return false; if(end && d > end) return false; if(stat !== 'ALL' && t.status !== stat) return false; return true;
  });
  
  const sorters = { newest: (a,b)=>new Date(b.date)-new Date(a.date), oldest: (a,b)=>new Date(a.date)-new Date(b.date), bestR: (a,b)=>b.metrics.r - a.metrics.r, worstR: (a,b)=>a.metrics.r - b.metrics.r };
  arr.sort(sorters[sort]);
  if(els['library-result-count']) els['library-result-count'].textContent = `${arr.length}개 결과`;
  
  arr.forEach(t => {
    let tr = document.createElement('tr');
    tr.onclick = () => { loadIntoForm(t.id); showVault(t); };
    let grd = t.grade || 'B';
    tr.innerHTML = `<td><span class="${t.status==='OPEN'?'badge-open':'badge-closed'}">${t.status}</span></td>
        <td><span style="color:#71717a;">${t.dispDate || new Date(t.date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</span></td><td style="font-weight:700; color:#fafafa;">${t.ticker}</td>
        <td><span class="badge ${grd}">${grd}</span></td><td class="${t.side==='LONG'?'win':'loss'}">${t.side==='LONG'?'L':'S'}</td>
        <td>${t.metrics.avgEntry.toFixed(2)}</td><td>${t.metrics.avgExit > 0 ? t.metrics.avgExit.toFixed(2) : '-'}</td>
        <td class="${t.metrics.pnl>=0?'win':'loss'}" style="font-weight:700;">${t.status==='OPEN'?'-':(t.metrics.pnl>=0?'+$':'-$')+Math.abs(t.metrics.pnl).toFixed(2)}</td>
        <td class="${t.metrics.pnl>=0?'win':'loss'}">${t.status==='OPEN'?'-':t.metrics.r.toFixed(2)+'R'}</td>`;
    b.appendChild(tr);
  });
}

function showVault(t) {
  let v = els['chart_vault']; let l = els['vault_links']; if(!v || !l) return; l.innerHTML = '';
  let links = (t.artifacts||[]).filter(u => u.includes('tradingview.com/x/'));
  if(links.length) {
      v.style.display = 'block';
      links.forEach((u,i) => { let imgId = u.split('/x/')[1].replace('/',''); l.innerHTML += `<a href="${u}" target="_blank" class="vault-btn">📈 Chart ${i+1}</a>`; });
  } else { v.style.display = 'none'; }
  if(els['detail']) els['detail'].innerHTML = `<div class="detail-box" style="margin-bottom:15px;"><strong>📝 Memo & Context</strong><br><br><span style="color:#e2e8f0; line-height:1.6;">${(t.review || 'No memo').replace(/\n/g,'<br>')}</span></div>`;
}

function clearFilters() { if(els.q) els.q.value = ''; if(els['fStart']) els['fStart'].value = ''; if(els['fEnd']) els['fEnd'].value = ''; if(els['f-status']) els['f-status'].value = 'ALL'; renderHistory(); }
function handleImport(e) { let r = new FileReader(); r.onload = (ev) => { try { let d = JSON.parse(ev.target.result); if(d.trades) { state.db = d; saveDB(state.db); renderOverview(); renderHistory(); alert("데이터가 성공적으로 복원되었습니다!"); } } catch(err) { alert("잘못된 백업 파일입니다."); } }; r.readAsText(e.target.files[0]); e.target.value=''; }

// --- Dashboard ---
function renderOverview() {
  const s = summarize(state.db.trades);
  const metrics = [
    { label: 'Net PnL', value: s.net>=0?`+$${s.net.toFixed(2)}`:`-$${Math.abs(s.net).toFixed(2)}`, tone: 'metric-profit', size: 'primary' },
    { label: 'Profit Factor', value: s.profitFactor === Infinity ? 'MAX' : s.profitFactor.toFixed(2), tone: 'metric-accent', size: 'primary' },
    { label: 'Win Rate', value: `${s.winRate.toFixed(1)}%`, tone: 'metric-accent', size: 'primary' },
    { label: 'Expectancy', value: s.expectancy>=0?`+$${s.expectancy.toFixed(2)}`:`-$${Math.abs(s.expectancy).toFixed(2)}`, tone: 'metric-neutral', size: 'primary' },
  ];
  if(els.metrics) els.metrics.innerHTML = metrics.map(item => `<div class="m-box"><div class="m-title">${item.label}</div><div class="m-val">${item.value}</div></div>`).join('');
  renderCalendar();
}

function renderCalendar() {
  let y = state.month.getFullYear(); let m = state.month.getMonth();
  if(els['calendar-title']) els['calendar-title'].textContent = new Date(y, m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  let first = new Date(y, m, 1).getDay(); let total = new Date(y, m + 1, 0).getDate();
  let h = ''; for (let i = 0; i < first; i++) h += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= total; d++) {
    let key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let pnl = state.db.trades.filter(t => t.status === 'CLOSED' && t.date.slice(0, 10) === key).reduce((sum, t) => sum + t.metrics.pnl, 0);
    h += `<div class="cal-cell ${pnl>0?'profit':pnl<0?'loss':''}" onclick="document.getElementById('fStart').value='${key}'; document.getElementById('fEnd').value='${key}'; window.__desk.switchView('library');"><div class="c-date">${d}</div><div class="c-pnl">${pnl? (pnl>0?'+$':'-$')+Math.abs(pnl).toFixed(2) : ''}</div></div>`;
  }
  if(els['cal-days']) els['cal-days'].innerHTML = h;
}
window.__desk.switchView = switchView;
