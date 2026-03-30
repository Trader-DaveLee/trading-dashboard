import { recalcTrade } from './calc.js';
import { summarize, groupAverageR, countTags, tagStats, bucketStats, recentWindowStats } from './analytics.js';
import { loadDB, saveDB, exportDB, parseImport, normalizeTrade, loadDraft, saveDraft, clearDraft, loadPrefs, savePrefs } from './storage.js';

const state = {
  db: loadDB(),
  view: 'overview',
  month: new Date(),
  selectedTradeId: null,
  draftEntries: [{ price: 0, type: 'M', weight: 100 }],
  draftExits: [],
  dirty: false,
  prefs: loadPrefs(),
  draftMeta: null,
};

const views = ['overview', 'journal', 'library'];
const els = {};
window.__desk = {
  selectTrade: id => selectTrade(id),
  applySameSetupFilter: () => filterBySelectedSetup(),
  applySameTickerFilter: () => filterBySelectedTicker(),
  loadSelectedIntoJournal: () => openSelectedInJournal(),
};
const ID_LIST = ['nav','metrics','calendar','calendar-title','equity-chart','setup-chart','mistake-list','research-notes','entries','exits','calc-summary','trade-form','trade-id','trade-date','ticker','status','session','side','setup-entry','setup-exit','grade','account-size','risk-pct','leverage','playbook-score','maker-fee','taker-fee','stop-price','stop-type','adjustment','tags','mistakes','emotion','context','thesis','review','artifacts','trade-table','detail','detail-insights','q','f-from','f-to','f-status','f-side','f-session','f-setup','f-tag','f-mistake','sort','ticker-list','setup-entry-list','setup-exit-list','journal-status','draft-saved-at','library-result-count','compact-toggle','review-position','review-breadcrumb','prev-trade','next-trade','filter-same-setup','filter-same-ticker','clear-quick-filter','export-json','import-json-btn','import-json','desk-rules','risk-risk-dollar','risk-qty','risk-margin','risk-notional','risk-stop-distance','risk-fees'];

bootstrap();

function bootstrap() {
  cacheEls();
  bindEvents();
  hydrateInitialForm();
  render();
}

function cacheEls() {
  ID_LIST.forEach(id => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  document.getElementById('prev-month').onclick = () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); };
  document.getElementById('next-month').onclick = () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); };
  document.getElementById('add-entry').onclick = () => { state.draftEntries.push({ price: 0, type: 'M', weight: 0 }); renderLegs('entry'); updatePreview(); };
  document.getElementById('add-exit').onclick = () => { state.draftExits.push({ price: 0, type: 'M', weight: 0 }); renderLegs('exit'); updatePreview(); };
  document.getElementById('reset-form').onclick = resetForm;
  document.getElementById('delete-trade').onclick = deleteTrade;
  document.getElementById('duplicate-trade').onclick = duplicateTrade;
  document.getElementById('export-json').onclick = () => exportDB(state.db);
  document.getElementById('import-json-btn').onclick = () => document.getElementById('import-json').click();
  document.getElementById('import-json').onchange = handleImport;
  document.getElementById('clear-filters').onclick = clearFilters;
  document.getElementById('compact-toggle').onclick = toggleCompactTable;
  els['prev-trade'].onclick = () => stepSelectedTrade(-1);
  els['next-trade'].onclick = () => stepSelectedTrade(1);
  els['filter-same-setup'].onclick = filterBySelectedSetup;
  els['filter-same-ticker'].onclick = filterBySelectedTicker;
  els['clear-quick-filter'].onclick = clearQuickFilter;
  els['trade-form'].addEventListener('submit', handleSubmit);
  bindKeyboardShortcuts();

  ['trade-date','ticker','status','session','side','setup-entry','setup-exit','grade','account-size','risk-pct','leverage','playbook-score','maker-fee','taker-fee','stop-price','stop-type','adjustment','tags','mistakes','emotion','context','thesis','review','artifacts','desk-rules'].forEach(id => {
    els[id].addEventListener('input', () => { markDirty(); updatePreview(); persistDraft(); });
    els[id].addEventListener('change', () => { markDirty(); updatePreview(); persistDraft(); });
  });
  ['q','f-from','f-to','f-status','f-side','f-session','f-setup','f-tag','f-mistake','sort'].forEach(id => {
    els[id].addEventListener('input', renderLibrary);
    els[id].addEventListener('change', renderLibrary);
  });
}

function render() {
  renderNav();
  renderMetaLists();
  renderOverview();
  renderLibrary();
  applyPrefs();
  updatePreview();
  refreshJournalStatus();
}

function renderNav() {
  els.nav.innerHTML = views.map(view => `<button class="${state.view === view ? 'active' : ''}" data-view="${view}">${label(view)}</button>`).join('');
  els.nav.querySelectorAll('button').forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
}

function switchView(view) {
  state.view = view;
  views.forEach(v => document.getElementById(`view-${v}`).classList.toggle('active', v === view));
  renderNav();
}

function renderMetaLists() {
  els['desk-rules'].value = state.prefs.deskRules || '';

  els['ticker-list'].innerHTML = uniq(state.db.meta.tickers).sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  els['setup-entry-list'].innerHTML = uniq(state.db.meta.entrySetups).sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  els['setup-exit-list'].innerHTML = uniq(state.db.meta.exitSetups).sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function renderOverview() {
  const s = summarize(state.db.trades);
  const metrics = [
    { label: 'Net PnL', value: money(s.net), sub: `${s.closed.length} closed trades`, tone: 'metric-profit', size: 'primary' },
    { label: 'Profit Factor', value: s.profitFactor === Infinity ? 'MAX' : s.profitFactor.toFixed(2), sub: 'gross profit / gross loss', tone: 'metric-accent', size: 'primary' },
    { label: 'Win Rate', value: `${s.winRate.toFixed(1)}%`, sub: `${s.wins.length}W / ${s.losses.length}L`, tone: 'metric-accent', size: 'primary' },
    { label: 'Expectancy', value: money(s.expectancy), sub: '평균 달러 기대값', tone: 'metric-neutral', size: 'secondary' },
    { label: 'Average R', value: `${s.avgR.toFixed(2)}R`, sub: '닫힌 트레이드 기준', tone: 'metric-accent', size: 'secondary' },
    { label: 'Max Drawdown', value: money(s.maxDD), sub: '누적 손익 기준', tone: 'metric-loss', size: 'secondary' },
    { label: 'Fees Paid', value: money(s.fees), sub: '닫힌 트레이드 총 수수료', tone: 'metric-warn', size: 'secondary' },
    { label: 'Leak Rate', value: `${s.leakRate.toFixed(1)}%`, sub: '실수 태그 포함 비율', tone: 'metric-warn', size: 'tertiary' },
    { label: 'Avg Win', value: money(s.avgWin), sub: '이긴 트레이드 평균', tone: 'metric-profit', size: 'tertiary' },
    { label: 'Avg Loss', value: money(s.avgLoss), sub: '진 트레이드 평균', tone: 'metric-loss', size: 'tertiary' },
    { label: 'Open Trades', value: `${state.db.trades.filter(t => t.status === 'OPEN').length}`, sub: '미청산 기록', tone: 'metric-neutral', size: 'tertiary' },
    { label: 'Best Setup', value: bestSetupLabel(s.closed), sub: '표본 2개 이상 우선', tone: 'metric-accent', size: 'tertiary' },
  ];
  els.metrics.innerHTML = metrics.map(item => `<div class="metric ${item.tone} ${item.size}"><div class="label">${item.label}</div><div class="value ${numberClass(item.value)}">${item.value}</div><div class="sub">${item.sub}</div></div>`).join('');
  renderCalendar();
  renderEquity(s.closed);
  renderSetupChart(s.closed);
  renderMistakes(s.closed);
  renderResearchNotes(s.closed);
}

function renderCalendar() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  els['calendar-title'].textContent = new Date(y, m).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const first = new Date(y, m, 1).getDay();
  const total = new Date(y, m + 1, 0).getDate();
  let html = days.map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first; i++) html += `<div class="day empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const pnl = state.db.trades.filter(t => t.status === 'CLOSED' && t.date.slice(0, 10) === key).reduce((sum, t) => sum + t.metrics.pnl, 0);
    html += `<button class="day" data-day="${key}"><span class="date">${d}</span><span class="pnl ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'}">${pnl ? money(pnl) : ''}</span></button>`;
  }
  els.calendar.innerHTML = html;
  els.calendar.querySelectorAll('[data-day]').forEach(btn => btn.onclick = () => {
    els.q.value = btn.dataset.day;
    switchView('library');
    renderLibrary();
  });
}

function renderEquity(closed) {
  if (!closed.length) return els['equity-chart'].innerHTML = emptyState('데이터가 없습니다.');
  const sorted = [...closed].sort((a, b) => new Date(a.date) - new Date(b.date));
  let equity = 0;
  const points = sorted.map((t, i) => ({ x: i, y: (equity += t.metrics.pnl) }));
  els['equity-chart'].innerHTML = lineSvg(points);
}

function renderSetupChart(closed) {
  const data = groupAverageR(closed, t => t.setupEntry).slice(0, 8);
  els['setup-chart'].innerHTML = data.length ? barSvg(data) : emptyState('셋업 데이터가 없습니다.');
}

function renderMistakes(closed) {
  const counts = countTags(closed, t => t.mistakes).slice(0, 5);
  const costs = tagStats(closed, t => t.mistakes).slice(0, 5);
  const byLabel = new Map(costs.map(x => [x.label, x]));
  els['mistake-list'].innerHTML = counts.length ? counts.map(item => {
    const stat = byLabel.get(item.label);
    return `<div class="note-box"><strong>${escapeHtml(item.label)}</strong><div>빈도 ${item.value}회 · 누적 ${money(stat?.totalPnl || 0)} · 평균 ${Number(stat?.avgR || 0).toFixed(2)}R</div></div>`;
  }).join('') : emptyState('실수 태그가 없습니다.');
}

function renderResearchNotes(closed) {
  const notes = [];
  const setups = groupAverageR(closed, t => t.setupEntry).filter(x => x.count >= 2);
  if (setups[0]) notes.push(`현재 가장 유리한 셋업은 <strong>${escapeHtml(setups[0].label)}</strong>이며 평균 <strong>${setups[0].value.toFixed(2)}R</strong>입니다.`);
  const sessions = bucketStats(closed, t => t.session).filter(x => x.count >= 2);
  if (sessions[0]) notes.push(`가장 성과가 좋은 세션은 <strong>${escapeHtml(sessions[0].label)}</strong>이며 평균 <strong>${sessions[0].avgR.toFixed(2)}R</strong>입니다.`);
  const mistakes = tagStats(closed, t => t.mistakes);
  if (mistakes[0]) notes.push(`비용이 가장 큰 실수는 현재 <strong>${escapeHtml(mistakes[0].label)}</strong>입니다. 반복 빈도보다 총손실을 먼저 보십시오.`);
  const recent = recentWindowStats(closed, 20);
  if (recent.count >= 5) notes.push(`최근 ${recent.count}개 샘플의 평균은 <strong>${recent.avgR.toFixed(2)}R</strong>, 승률은 <strong>${recent.winRate.toFixed(1)}%</strong>입니다.`);
  if (!notes.length) notes.push('표본이 더 쌓이면 자동 인사이트가 더 유의미해집니다.');
  els['research-notes'].innerHTML = notes.map(x => `<div class="note-box">${x}</div>`).join('');
}

function renderLibrary() {
  const rows = filteredTrades();
  state.currentLibraryRows = rows;
  const selectedExists = rows.some(t => t.id === state.selectedTradeId);
  if (!selectedExists) state.selectedTradeId = rows[0]?.id || null;
  els['library-result-count'].textContent = `${rows.length}개 결과`;
  els['compact-toggle'].textContent = state.prefs.compactTable ? '표준 밀도' : '컴팩트 밀도';
  const selectedIndex = rows.findIndex(t => t.id === state.selectedTradeId);
  els['review-position'].textContent = rows.length ? `${selectedIndex + 1} / ${rows.length}` : '0 / 0';
  els['trade-table'].innerHTML = rows.length ? rows.map(tradeRow).join('') : `<tr><td colspan="12" class="empty-state">검색 결과가 없습니다.</td></tr>`;
  els['trade-table'].querySelectorAll('tr[data-id]').forEach(row => row.onclick = () => selectTrade(row.dataset.id));
  renderDetail();
}

function filteredTrades() {
  const q = els.q.value.trim().toLowerCase();
  const from = els['f-from'].value;
  const to = els['f-to'].value;
  const status = els['f-status'].value;
  const side = els['f-side'].value;
  const session = els['f-session'].value;
  const setup = els['f-setup'].value.trim().toLowerCase();
  const tag = els['f-tag'].value.trim().toLowerCase();
  const mistake = els['f-mistake'].value.trim().toLowerCase();
  const sort = els.sort.value;
  const arr = state.db.trades.filter(t => {
    const day = t.date.slice(0, 10);
    const hay = [day, t.ticker, t.setupEntry, t.setupExit, t.session, t.context, t.thesis, t.review, ...(t.tags || []), ...(t.mistakes || [])].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (status !== 'ALL' && t.status !== status) return false;
    if (side !== 'ALL' && t.side !== side) return false;
    if (session !== 'ALL' && t.session !== session) return false;
    if (setup && !String(t.setupEntry || '').toLowerCase().includes(setup)) return false;
    if (tag && !(t.tags || []).some(x => x.toLowerCase().includes(tag))) return false;
    if (mistake && !(t.mistakes || []).some(x => x.toLowerCase().includes(mistake))) return false;
    return true;
  });
  const sorters = {
    newest: (a, b) => new Date(b.date) - new Date(a.date),
    oldest: (a, b) => new Date(a.date) - new Date(b.date),
    bestR: (a, b) => b.metrics.r - a.metrics.r,
    worstR: (a, b) => a.metrics.r - b.metrics.r,
    bestPnl: (a, b) => b.metrics.pnl - a.metrics.pnl,
    worstPnl: (a, b) => a.metrics.pnl - b.metrics.pnl,
  };
  return arr.sort(sorters[sort]);
}

function tradeRow(t) {
  const selected = t.id === state.selectedTradeId ? 'selected' : '';
  return `<tr class="${selected}" data-id="${t.id}"><td>${fmtDateTime(t.date)}</td><td>${statusBadge(t.status)}</td><td><strong>${escapeHtml(t.ticker)}</strong></td><td class="${t.side === 'LONG' ? 'positive' : 'negative'}">${t.side}</td><td>${escapeHtml(t.session)}</td><td>${escapeHtml(t.setupEntry)}</td><td class="mono">${num(t.metrics.avgEntry)}</td><td class="mono">${t.metrics.avgExit ? num(t.metrics.avgExit) : '-'}</td><td class="mono ${t.metrics.pnl >= 0 ? 'positive' : 'negative'}">${t.status === 'CLOSED' ? money(t.metrics.pnl) : '-'}</td><td class="mono ${t.metrics.r >= 0 ? 'positive' : 'negative'}">${t.status === 'CLOSED' ? `${t.metrics.r.toFixed(2)}R` : '-'}</td><td class="mono">${money(t.metrics.riskDollar)}</td><td>${chips(t.tags)}</td></tr>`;
}

function selectTrade(id) {
  state.selectedTradeId = id;
  renderLibrary();
}

function renderDetail() {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (!trade) {
    els.detail.innerHTML = emptyState('선택된 트레이드가 없습니다.');
    els['detail-insights'].innerHTML = emptyState('데이터 없음');
    return;
  }
  els['review-breadcrumb'].textContent = `${trade.ticker} · ${trade.side} · ${trade.setupEntry}`;
  const cohort = setupCohortStats(trade);
  els.detail.innerHTML = `
    <div class="detail-actions">
      <button type="button" onclick="window.__desk.loadSelectedIntoJournal()">Journal로 열기</button>
      <button type="button" onclick="window.__desk.applySameSetupFilter()">같은 셋업 보기</button>
      <button type="button" onclick="window.__desk.applySameTickerFilter()">같은 종목 보기</button>
    </div>
    <div class="detail-box">
      <div class="kv">
        <div>날짜</div><div>${fmtDateTime(trade.date)}</div>
        <div>티커</div><div>${escapeHtml(trade.ticker)}</div>
        <div>방향</div><div class="${trade.side === 'LONG' ? 'positive' : 'negative'}">${trade.side}</div>
        <div>세션</div><div>${escapeHtml(trade.session)}</div>
        <div>셋업</div><div>${escapeHtml(trade.setupEntry)} / ${escapeHtml(trade.setupExit)}</div>
        <div>손익</div><div class="mono ${trade.metrics.pnl >= 0 ? 'positive' : 'negative'}">${money(trade.metrics.pnl)}</div>
        <div>R</div><div class="mono ${trade.metrics.r >= 0 ? 'positive' : 'negative'}">${trade.metrics.r.toFixed(2)}R</div>
        <div>수수료</div><div class="mono">${money(trade.metrics.totalFees)}</div>
      </div>
    </div>
    <div class="review-grid">
      <div class="review-stat"><span class="eyebrow">Setup Cohort</span><strong>${cohort.count} samples</strong><div>평균 ${cohort.avgR.toFixed(2)}R · 승률 ${cohort.winRate.toFixed(1)}%</div></div>
      <div class="review-stat"><span class="eyebrow">Selected Trade</span><strong class="${trade.metrics.r >= 0 ? 'positive' : 'negative'}">${trade.metrics.r.toFixed(2)}R</strong><div>${trade.status === 'CLOSED' ? money(trade.metrics.pnl) : 'OPEN'}</div></div>
    </div>
    <div class="detail-box"><strong>진입 분할</strong><div>${legSummary(trade.entries)}</div></div>
    <div class="detail-box"><strong>청산 분할</strong><div>${legSummary(trade.exits)}</div></div>
    <div class="detail-box"><strong>컨텍스트</strong><div>${nl(escapeHtml(trade.context || '-'))}</div></div>
    <div class="detail-box"><strong>진입 논리</strong><div>${nl(escapeHtml(trade.thesis || '-'))}</div></div>
    <div class="detail-box"><strong>복기</strong><div>${nl(escapeHtml(trade.review || '-'))}</div></div>
    <div class="detail-box"><strong>태그</strong><div class="chips">${chips(trade.tags)}</div></div>
    <div class="detail-box"><strong>실수</strong><div class="chips">${chips(trade.mistakes)}</div></div>
    <div class="detail-box"><strong>증거 자료</strong><div>${artifactLinks(trade.artifacts)}</div></div>`;
  const similar = similarTrades(trade);
  els['detail-insights'].innerHTML = `
    ${tradeInsights(trade).map(x => `<div class="note-box">${x}</div>`).join('')}
    <div class="detail-box"><strong>유사 샘플</strong><div class="similar-list">${similar.length ? similar.map(item => `<div class="similar-item" onclick="window.__desk.selectTrade('${item.id}')"><strong>${fmtDateTime(item.date)}</strong><div>${escapeHtml(item.ticker)} · ${escapeHtml(item.setupEntry)} · <span class="${item.metrics.r >= 0 ? 'positive' : 'negative'}">${item.metrics.r.toFixed(2)}R</span></div></div>`).join('') : '<span class="neutral">비교할 샘플 부족</span>'}</div></div>
  `;
  loadTradeIntoForm(trade);
}

function handleSubmit(event) {
  event.preventDefault();
  const trade = readForm();
  if (!trade.date || !trade.ticker) return alert('날짜와 티커가 필요합니다.');
  if (!trade.stopPrice || state.draftEntries.every(x => !Number(x.price))) return alert('손절가와 진입가가 필요합니다.');
  if (Math.round(sum(state.draftEntries.map(x => Number(x.weight || 0)))) !== 100) return alert('진입 비중 합계가 100이어야 합니다.');
  if (trade.status === 'CLOSED' && state.draftExits.length && Math.round(sum(state.draftExits.map(x => Number(x.weight || 0)))) !== 100) return alert('닫힌 트레이드는 청산 비중 합계가 100이어야 합니다.');

  const normalized = normalizeTrade(trade);
  const index = state.db.trades.findIndex(t => t.id === normalized.id);
  if (index >= 0) state.db.trades[index] = normalized;
  else state.db.trades.unshift(normalized);

  syncMeta(normalized);
  saveDB(state.db);
  clearDraft();
  state.dirty = false;
  state.selectedTradeId = normalized.id;
  render();
  switchView('library');
}

function deleteTrade() {
  const id = els['trade-id'].value;
  if (!id) return alert('삭제할 트레이드가 선택되지 않았습니다.');
  if (!confirm('현재 선택된 트레이드를 삭제하시겠습니까?')) return;
  state.db.trades = state.db.trades.filter(t => t.id !== id);
  saveDB(state.db);
  clearDraft();
  state.selectedTradeId = null;
  resetForm();
  render();
}

function duplicateTrade() {
  if (!els['trade-id'].value) return;
  els['trade-id'].value = '';
  els['trade-date'].value = inputDate(new Date().toISOString());
  state.dirty = true;
  switchView('journal');
  refreshJournalStatus('복제본 준비됨');
  persistDraft();
}


function readForm() {
  return {
    id: els['trade-id'].value || crypto.randomUUID(),
    date: toISO(els['trade-date'].value),
    ticker: els.ticker.value.trim().toUpperCase(),
    status: els.status.value,
    session: els.session.value,
    side: els.side.value,
    setupEntry: els['setup-entry'].value.trim().toUpperCase(),
    setupExit: els['setup-exit'].value.trim().toUpperCase(),
    grade: els.grade.value,
    accountSize: Number(els['account-size'].value || 0),
    riskPct: Number(els['risk-pct'].value || 0),
    leverage: Number(els.leverage.value || 1),
    playbookScore: Number(els['playbook-score'].value || 0),
    makerFee: Number(els['maker-fee'].value || 0),
    takerFee: Number(els['taker-fee'].value || 0),
    stopPrice: Number(els['stop-price'].value || 0),
    stopType: els['stop-type'].value,
    adjustment: Number(els.adjustment.value || 0),
    tags: splitComma(els.tags.value),
    mistakes: splitComma(els.mistakes.value),
    emotion: els.emotion.value.trim(),
    context: els.context.value.trim(),
    thesis: els.thesis.value.trim(),
    review: els.review.value.trim(),
    artifacts: splitLines(els.artifacts.value),
    entries: state.draftEntries.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    exits: state.draftExits.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
  };
}

function resetForm(options = {}) {
  const keepDate = options.keepDate ?? false;
  const keepCore = options.keepCore ?? false;
  const currentDate = keepDate ? els['trade-date'].value : '';
  const core = keepCore ? {
    ticker: els.ticker.value,
    status: els.status.value,
    session: els.session.value,
    side: els.side.value,
    setupEntry: els['setup-entry'].value,
    setupExit: els['setup-exit'].value,
    grade: els.grade.value,
    accountSize: els['account-size'].value,
    riskPct: els['risk-pct'].value,
    leverage: els.leverage.value,
    makerFee: els['maker-fee'].value,
    takerFee: els['taker-fee'].value,
    playbookScore: els['playbook-score'].value,
  } : null;
  selectedTradeReset();
  els['trade-id'].value = '';
  els['trade-date'].value = currentDate || inputDate(new Date().toISOString());
  els.ticker.value = core?.ticker || 'BTCUSDT';
  els.status.value = core?.status || 'CLOSED';
  els.session.value = core?.session || 'NEW YORK';
  els.side.value = core?.side || 'LONG';
  els['setup-entry'].value = core?.setupEntry || 'BREAKOUT';
  els['setup-exit'].value = core?.setupExit || 'TRAIL STOP';
  els.grade.value = core?.grade || 'B';
  els['account-size'].value = core?.accountSize || 10000;
  els['risk-pct'].value = core?.riskPct || 0.5;
  els.leverage.value = core?.leverage || 10;
  els['playbook-score'].value = core?.playbookScore || 5;
  els['maker-fee'].value = core?.makerFee || 0.02;
  els['taker-fee'].value = core?.takerFee || 0.05;
  els['stop-price'].value = '';
  els['stop-type'].value = 'M';
  els.adjustment.value = 0;
  els.tags.value = '';
  els.mistakes.value = '';
  els.emotion.value = '';
  els.context.value = '';
  els.thesis.value = '';
  els.review.value = '';
  els.artifacts.value = '';
  state.draftEntries = [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = [];
  renderLegs('entry');
  renderLegs('exit');
  state.dirty = false;
  if (!options.keepDraft) clearDraft();
  updatePreview();
  refreshJournalStatus();
}

function selectedTradeReset() {
  state.selectedTradeId = null;
}

function loadTradeIntoForm(trade) {
  els['trade-id'].value = trade.id;
  els['trade-date'].value = inputDate(new Date(trade.date));
  els.ticker.value = trade.ticker;
  els.status.value = trade.status;
  els.session.value = trade.session;
  els.side.value = trade.side;
  els['setup-entry'].value = trade.setupEntry;
  els['setup-exit'].value = trade.setupExit;
  els.grade.value = trade.grade;
  els['account-size'].value = trade.accountSize;
  els['risk-pct'].value = trade.riskPct;
  els.leverage.value = trade.leverage;
  els['playbook-score'].value = trade.playbookScore;
  els['maker-fee'].value = trade.makerFee;
  els['taker-fee'].value = trade.takerFee;
  els['stop-price'].value = trade.stopPrice;
  els['stop-type'].value = trade.stopType;
  els.adjustment.value = trade.adjustment ?? 0;
  els.tags.value = (trade.tags || []).join(', ');
  els.mistakes.value = (trade.mistakes || []).join(', ');
  els.emotion.value = trade.emotion || '';
  els.context.value = trade.context || '';
  els.thesis.value = trade.thesis || '';
  els.review.value = trade.review || '';
  els.artifacts.value = (trade.artifacts || []).join('\n');
  state.draftEntries = structuredClone(trade.entries || []);
  state.draftExits = structuredClone(trade.exits || []);
  renderLegs('entry');
  renderLegs('exit');
  state.dirty = false;
  updatePreview();
  refreshJournalStatus();
}

function renderLegs(kind) {
  const target = kind === 'entry' ? state.draftEntries : state.draftExits;
  const holder = kind === 'entry' ? els.entries : els.exits;
  holder.innerHTML = target.map((row, index) => `
    <div class="leg-row">
      <input type="number" step="0.01" value="${row.price}" data-kind="${kind}" data-index="${index}" data-field="price" />
      <select data-kind="${kind}" data-index="${index}" data-field="type"><option value="M" ${row.type === 'M' ? 'selected' : ''}>Maker</option><option value="T" ${row.type === 'T' ? 'selected' : ''}>Taker</option></select>
      <input type="number" step="0.1" value="${row.weight}" data-kind="${kind}" data-index="${index}" data-field="weight" />
      <button type="button" data-remove-kind="${kind}" data-remove-index="${index}">삭제</button>
    </div>`).join('');

  holder.querySelectorAll('[data-field]').forEach(input => {
    input.oninput = input.onchange = () => {
      const arr = input.dataset.kind === 'entry' ? state.draftEntries : state.draftExits;
      arr[Number(input.dataset.index)][input.dataset.field] = input.value;
      markDirty();
      updatePreview();
      persistDraft();
    };
  });
  holder.querySelectorAll('[data-remove-kind]').forEach(btn => btn.onclick = () => {
    const arr = btn.dataset.removeKind === 'entry' ? state.draftEntries : state.draftExits;
    arr.splice(Number(btn.dataset.removeIndex), 1);
    if (btn.dataset.removeKind === 'entry' && !arr.length) arr.push({ price: 0, type: 'M', weight: 100 });
    markDirty();
    renderLegs(btn.dataset.removeKind);
    updatePreview();
    persistDraft();
  });
}

function updatePreview() {
  const metrics = recalcTrade(readForm());
  if (metrics.directionError) {
    resetRiskPlanner();
    els['calc-summary'].innerHTML = '손절 방향이 포지션 방향과 맞지 않습니다.';
    return;
  }
  if (!metrics.valid) {
    resetRiskPlanner();
    els['calc-summary'].innerHTML = '유효한 진입가, 손절가, 진입 비중 100%가 필요합니다.';
    return;
  }
  const exitWeight = sum(state.draftExits.map(x => Number(x.weight || 0)));
  els['risk-risk-dollar'].textContent = money(metrics.riskDollar);
  els['risk-qty'].textContent = metrics.qty.toFixed(5);
  els['risk-margin'].textContent = money(metrics.margin);
  els['risk-notional'].textContent = money(metrics.qty * metrics.avgEntry);
  const stopDistance = metrics.avgEntry ? Math.abs(metrics.avgEntry - Number(els['stop-price'].value || 0)) / metrics.avgEntry * 100 : 0;
  els['risk-stop-distance'].textContent = `${stopDistance.toFixed(2)}%`;
  els['risk-fees'].textContent = money(metrics.totalFees);
  els['calc-summary'].innerHTML = `
    Qty <strong>${metrics.qty.toFixed(5)}</strong> · Avg Entry <strong>${num(metrics.avgEntry)}</strong> · Margin <strong>${money(metrics.margin)}</strong><br>
    Avg Exit <strong>${metrics.avgExit ? num(metrics.avgExit) : '-'}</strong> · Exit Weight <strong>${exitWeight}%</strong> · Fees <strong>${money(metrics.totalFees)}</strong><br>
    Risk <strong>${money(metrics.riskDollar)}</strong> · Net PnL <strong class="${metrics.pnl >= 0 ? 'positive' : 'negative'}">${money(metrics.pnl)}</strong> · <strong class="${metrics.r >= 0 ? 'positive' : 'negative'}">${metrics.r.toFixed(2)}R</strong>
  `;
}


function resetRiskPlanner() {
  els['risk-risk-dollar'].textContent = money(0);
  els['risk-qty'].textContent = '0.00000';
  els['risk-margin'].textContent = money(0);
  els['risk-notional'].textContent = money(0);
  els['risk-stop-distance'].textContent = '0.00%';
  els['risk-fees'].textContent = money(0);
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.db = parseImport(reader.result);
      saveDB(state.db);
      state.selectedTradeId = null;
      render();
      alert('가져오기가 완료되었습니다.');
    } catch {
      alert('유효한 JSON 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
}

function clearFilters() {
  ['q','f-from','f-to','f-setup','f-tag','f-mistake'].forEach(id => els[id].value = '');
  ['f-status','f-side','f-session'].forEach(id => els[id].value = 'ALL');
  els.sort.value = 'newest';
  renderLibrary();
}

function syncMeta(trade) {
  if (trade.ticker && !state.db.meta.tickers.includes(trade.ticker)) state.db.meta.tickers.push(trade.ticker);
  if (trade.setupEntry && !state.db.meta.entrySetups.includes(trade.setupEntry)) state.db.meta.entrySetups.push(trade.setupEntry);
  if (trade.setupExit && !state.db.meta.exitSetups.includes(trade.setupExit)) state.db.meta.exitSetups.push(trade.setupExit);
}

function bestFocus(closed) {
  const setups = groupAverageR(closed, t => t.setupEntry).filter(x => x.count >= 3);
  return setups[0] ? `${setups[0].label} 표본 확대` : '샘플 축적 필요';
}
function biggestLeak(closed) {
  const mistakes = tagStats(closed, t => t.mistakes);
  return mistakes[0] ? mistakes[0].label : '실수 태그 없음';
}
function systemHealth(closed) {
  if (closed.length < 10) return '초기 구축 단계';
  const rich = closed.filter(t => t.tags.length && t.mistakes.length && t.context && t.thesis).length / closed.length;
  if (rich < 0.5) return '메타데이터 부족';
  return '연구 가능 수준';
}
function bestSetupLabel(closed) {
  const setups = groupAverageR(closed, t => t.setupEntry).filter(x => x.count >= 2);
  return setups[0] ? `${setups[0].label} (${setups[0].value.toFixed(2)}R)` : 'N/A';
}

function setupCohortStats(trade) {
  const cohort = state.db.trades.filter(t => t.id !== trade.id && t.status === 'CLOSED' && t.setupEntry === trade.setupEntry && t.side === trade.side);
  const count = cohort.length;
  const avgR = count ? sum(cohort.map(t => t.metrics.r)) / count : 0;
  const winRate = count ? cohort.filter(t => t.metrics.r > 0).length / count * 100 : 0;
  return { count, avgR, winRate };
}

function similarTrades(trade) {
  return state.db.trades
    .filter(t => t.id !== trade.id)
    .map(t => ({
      ...t,
      score: (t.setupEntry === trade.setupEntry ? 4 : 0) + (t.ticker === trade.ticker ? 3 : 0) + (t.side === trade.side ? 2 : 0) + ((t.mistakes || []).some(x => (trade.mistakes || []).includes(x)) ? 1 : 0)
    }))
    .filter(t => t.score > 0)
    .sort((a,b) => b.score - a.score || new Date(b.date) - new Date(a.date))
    .slice(0, 5);
}

function stepSelectedTrade(delta) {
  const rows = state.currentLibraryRows || [];
  if (!rows.length) return;
  const index = rows.findIndex(t => t.id === state.selectedTradeId);
  const nextIndex = Math.min(rows.length - 1, Math.max(0, index + delta));
  state.selectedTradeId = rows[nextIndex].id;
  renderLibrary();
}

function filterBySelectedSetup() {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (!trade) return;
  els['f-setup'].value = trade.setupEntry || '';
  renderLibrary();
}

function filterBySelectedTicker() {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (!trade) return;
  els.q.value = trade.ticker || '';
  renderLibrary();
}

function clearQuickFilter() {
  els.q.value = '';
  els['f-setup'].value = '';
  renderLibrary();
}

function openSelectedInJournal() {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (!trade) return;
  switchView('journal');
  loadTradeIntoForm(trade);
}

function tradeInsights(trade) {
  const arr = [];
  arr.push(`이 트레이드는 <strong>${trade.setupEntry || 'UNLABELED'}</strong> 셋업 샘플입니다.`);
  arr.push((trade.mistakes || []).length ? `실수 태그가 <strong>${trade.mistakes.length}개</strong> 달려 있습니다.` : '실수 태그가 없습니다. 결과가 좋아도 실행 검토가 필요합니다.');
  arr.push(trade.metrics.totalFees > 0 ? `수수료는 <strong>${money(trade.metrics.totalFees)}</strong>입니다.` : '수수료 정보가 충분하지 않습니다.');
  arr.push(trade.status === 'OPEN' ? '미청산 기록입니다. 종료 후 재평가가 필요합니다.' : `이 트레이드의 결과는 <strong>${trade.metrics.r.toFixed(2)}R</strong>입니다.`);
  return arr;
}

function legSummary(legs = []) {
  if (!legs.length) return '<span class="neutral">-</span>';
  return legs.map((leg, index) => `#${index + 1} ${num(leg.price)} · ${Number(leg.weight || 0)}% · ${leg.type === 'M' ? 'Maker' : 'Taker'}`).join('<br>');
}


function hydrateInitialForm() {
  const draft = loadDraft();
  if (draft) {
    applyDraftToForm(draft);
    state.dirty = false;
    state.draftMeta = draft.savedAt || null;
    refreshJournalStatus('임시저장 불러옴');
    return;
  }
  resetForm({ keepDraft: true });
}

function applyDraftToForm(draft) {
  els['trade-id'].value = draft.id || '';
  els['trade-date'].value = draft.tradeDate || inputDate(new Date().toISOString());
  els.ticker.value = draft.ticker || 'BTCUSDT';
  els.status.value = draft.status || 'CLOSED';
  els.session.value = draft.session || 'NEW YORK';
  els.side.value = draft.side || 'LONG';
  els['setup-entry'].value = draft.setupEntry || 'BREAKOUT';
  els['setup-exit'].value = draft.setupExit || 'TRAIL STOP';
  els.grade.value = draft.grade || 'B';
  els['account-size'].value = draft.accountSize ?? 10000;
  els['risk-pct'].value = draft.riskPct ?? 0.5;
  els.leverage.value = draft.leverage ?? 10;
  els['playbook-score'].value = draft.playbookScore ?? 5;
  els['maker-fee'].value = draft.makerFee ?? 0.02;
  els['taker-fee'].value = draft.takerFee ?? 0.05;
  els['stop-price'].value = draft.stopPrice ?? '';
  els['stop-type'].value = draft.stopType || 'M';
  els.adjustment.value = draft.adjustment ?? 0;
  els.tags.value = draft.tags || '';
  els.mistakes.value = draft.mistakes || '';
  els.emotion.value = draft.emotion || '';
  els.context.value = draft.context || '';
  els.thesis.value = draft.thesis || '';
  els.review.value = draft.review || '';
  els.artifacts.value = draft.artifacts || '';
  state.draftEntries = Array.isArray(draft.entries) && draft.entries.length ? draft.entries : [{ price: 0, type: 'M', weight: 100 }];
  state.draftExits = Array.isArray(draft.exits) ? draft.exits : [];
  renderLegs('entry');
  renderLegs('exit');
  updatePreview();
}

function persistDraft() {
  const draft = snapshotDraft();
  saveDraft(draft);
  state.prefs.deskRules = els['desk-rules'].value;
  savePrefs(state.prefs);
  state.draftMeta = new Date().toISOString();
  refreshJournalStatus();
}

function snapshotDraft() {
  return {
    id: els['trade-id'].value || '',
    tradeDate: els['trade-date'].value,
    ticker: els.ticker.value,
    status: els.status.value,
    session: els.session.value,
    side: els.side.value,
    setupEntry: els['setup-entry'].value,
    setupExit: els['setup-exit'].value,
    grade: els.grade.value,
    accountSize: els['account-size'].value,
    riskPct: els['risk-pct'].value,
    leverage: els.leverage.value,
    playbookScore: els['playbook-score'].value,
    makerFee: els['maker-fee'].value,
    takerFee: els['taker-fee'].value,
    stopPrice: els['stop-price'].value,
    stopType: els['stop-type'].value,
    adjustment: els.adjustment.value,
    tags: els.tags.value,
    mistakes: els.mistakes.value,
    emotion: els.emotion.value,
    context: els.context.value,
    thesis: els.thesis.value,
    review: els.review.value,
    artifacts: els.artifacts.value,
    entries: structuredClone(state.draftEntries),
    exits: structuredClone(state.draftExits),
  };
}

function markDirty() {
  state.dirty = true;
  refreshJournalStatus();
}

function refreshJournalStatus(message = '') {
  const status = message || (state.dirty ? '저장되지 않은 변경사항' : '입력 상태 정상');
  els['journal-status'].textContent = status;
  els['draft-saved-at'].textContent = state.draftMeta ? `임시저장 ${fmtSavedAt(state.draftMeta)}` : '임시저장 없음';
}

function fmtSavedAt(iso) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function renderQuickFill() {
  renderQuickButtons('quick-tickers', frequentValues(state.db.trades, t => t.ticker, 6), value => { els.ticker.value = value; markDirty(); updatePreview(); persistDraft(); });
  renderQuickButtons('quick-entry-setups', frequentValues(state.db.trades, t => t.setupEntry, 6), value => { els['setup-entry'].value = value; markDirty(); updatePreview(); persistDraft(); });
  renderQuickButtons('quick-exit-setups', frequentValues(state.db.trades, t => t.setupExit, 6), value => { els['setup-exit'].value = value; markDirty(); updatePreview(); persistDraft(); });
  renderQuickButtons('quick-tags', countTags(state.db.trades, t => t.tags).slice(0,8).map(x => x.label), value => appendCsvValue(els.tags, value));
  renderQuickButtons('quick-mistakes', countTags(state.db.trades, t => t.mistakes).slice(0,8).map(x => x.label), value => appendCsvValue(els.mistakes, value));
}

function renderQuickButtons(id, values, onClick) {
  const unique = uniq(values).filter(Boolean);
  els[id].innerHTML = unique.length ? unique.map(v => `<button type="button" class="chip-button" data-value="${escapeAttr(v)}">${escapeHtml(v)}</button>`).join('') : '<span class="neutral">아직 축적된 샘플이 없습니다.</span>';
  els[id].querySelectorAll('[data-value]').forEach(btn => btn.onclick = () => onClick(btn.dataset.value));
}

function appendCsvValue(input, value) {
  const items = splitComma(input.value);
  if (!items.includes(value)) items.push(value);
  input.value = items.join(', ');
  markDirty();
  updatePreview();
  persistDraft();
}

function frequentValues(trades, selector, limit = 6) {
  const counts = new Map();
  trades.forEach(t => { const v = selector(t); if (v) counts.set(v, (counts.get(v) || 0) + 1); });
  return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, limit).map(([v]) => v);
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (state.view !== 'journal') switchView('journal');
      els['trade-form'].requestSubmit();
      return;
    }
    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateTrade();
      return;
    }
    if (meta && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      switchView('library');
      els.q.focus();
      els.q.select();
      return;
    }
    if (!meta && event.key.toLowerCase() === 'j' && !isTypingContext(event.target) && state.view === 'library') { event.preventDefault(); stepSelectedTrade(1); return; }
    if (!meta && event.key.toLowerCase() === 'k' && !isTypingContext(event.target) && state.view === 'library') { event.preventDefault(); stepSelectedTrade(-1); return; }
    if (!meta && event.key.toLowerCase() === 'n' && !isTypingContext(event.target)) {
      event.preventDefault();
      switchView('journal');
      resetForm();
    }
  });
}

function isTypingContext(target) {
  return ['INPUT','TEXTAREA','SELECT'].includes(target?.tagName);
}

function toggleCompactTable() {
  state.prefs.compactTable = !state.prefs.compactTable;
  savePrefs(state.prefs);
  applyPrefs();
  renderLibrary();
}

function applyPrefs() {
  document.body.classList.toggle('compact-table', !!state.prefs.compactTable);
}

function lineSvg(points) {
  const width = 640, height = 260, padX = 28, padY = 20;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0);
  const range = maxY - minY || 1;
  const x = i => padX + (i * (width - padX * 2) / Math.max(1, points.length - 1));
  const y = val => height - padY - ((val - minY) / range) * (height - padY * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.y)}`).join(' ');
  const area = `${path} L ${x(points.length - 1)} ${height - padY} L ${x(0)} ${height - padY} Z`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <line class="grid-line" x1="${padX}" x2="${width-padX}" y1="${y(0)}" y2="${y(0)}"></line>
    <path class="area" d="${area}"></path>
    <path class="line" d="${path}"></path>
    <text class="axis" x="${padX}" y="15">${money(maxY)}</text>
    <text class="axis" x="${padX}" y="${height - 4}">${money(minY)}</text>
  </svg>`;
}

function barSvg(data) {
  const width = 640, height = 240, padX = 28, padY = 20;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const rowH = (height - padY * 2) / data.length;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${data.map((d, i) => {
    const w = (Math.abs(d.value) / max) * (width - 180);
    const y = padY + i * rowH + 6;
    const x = 150;
    return `<text class="axis" x="0" y="${y + 12}">${escapeHtml(d.label)}</text>
      <rect class="${d.value >= 0 ? 'bar-pos' : 'bar-neg'}" x="${x}" y="${y}" width="${w}" height="16" rx="6"></rect>
      <text class="axis" x="${x + w + 8}" y="${y + 12}">${d.value.toFixed(2)}R</text>`;
  }).join('')}</svg>`;
}

function label(v) { return ({ overview: 'Overview', journal: 'Journal', library: 'Library' })[v]; }
function money(n) { const v = Number(n || 0); return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`; }
function num(n) { return Number(n || 0).toFixed(2); }
function numberClass(v) {
  const s = String(v);
  if (s === 'MAX') return 'positive';
  return s.startsWith('-') ? 'negative' : 'positive';
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDateTime(iso) { return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function statusBadge(status) { return `<span class="badge ${status === 'CLOSED' ? 'badge-good' : 'badge-warn'}">${status}</span>`; }
function chips(arr = []) { return arr.length ? `<div class="chips">${arr.map(x => `<span class="chip">${escapeHtml(x)}</span>`).join('')}</div>` : '<span class="neutral">-</span>'; }
function artifactLinks(arr = []) { return arr.length ? arr.map((u, i) => `<div><a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">Evidence ${i + 1}</a></div>`).join('') : '<span class="neutral">-</span>'; }
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
