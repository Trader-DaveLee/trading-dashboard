import { recalcTrade } from './calc.js';
import { summarize, groupAverageR, countTags, tagPnl, emotionStats, playbookBuckets } from './analytics.js';
import { loadDB, saveDB, exportDB, parseImport, normalizeTrade } from './storage.js';

const state = {
  db: loadDB(),
  view: 'overview',
  month: new Date(),
  selectedTradeId: null,
  draftEntries: [{ price: 0, type: 'M', weight: 100 }],
  draftExits: [],
};

const views = ['overview', 'journal', 'library', 'research'];
const els = {};

bootstrap();

function bootstrap() {
  cacheEls();
  bindEvents();
  resetForm();
  render();
}

function cacheEls() {
  ['nav','metrics','calendar','calendar-title','equity-chart','setup-chart','mistake-list','research-notes','hero-focus','hero-leak','hero-health','entries','exits','calc-summary','trade-form','trade-id','trade-date','ticker','status','session','side','setup-entry','setup-exit','grade','account-size','risk-pct','leverage','playbook-score','maker-fee','taker-fee','stop-price','stop-type','tags','mistakes','emotion','context','thesis','review','artifacts','trade-table','detail','detail-insights','q','f-status','f-side','f-setup','f-tag','sort','ticker-list','setup-entry-list','setup-exit-list','research-setups','research-mistakes','research-emotions','research-discipline'].forEach(id => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.getElementById('prev-month').onclick = () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); };
  document.getElementById('next-month').onclick = () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); };
  document.getElementById('add-entry').onclick = () => { state.draftEntries.push({ price: 0, type: 'M', weight: 0 }); renderLegs('entry'); updatePreview(); };
  document.getElementById('add-exit').onclick = () => { state.draftExits.push({ price: 0, type: 'M', weight: 0 }); renderLegs('exit'); updatePreview(); };
  document.getElementById('reset-form').onclick = resetForm;
  document.getElementById('delete-trade').onclick = deleteTrade;
  document.getElementById('export-json').onclick = () => exportDB(state.db);
  document.getElementById('import-json-btn').onclick = () => document.getElementById('import-json').click();
  document.getElementById('import-json').onchange = handleImport;
  els['trade-form'].addEventListener('submit', handleSubmit);

  ['trade-date','ticker','status','session','side','setup-entry','setup-exit','grade','account-size','risk-pct','leverage','playbook-score','maker-fee','taker-fee','stop-price','stop-type','tags','mistakes','emotion','context','thesis','review','artifacts'].forEach(id => {
    els[id].addEventListener('input', updatePreview);
    els[id].addEventListener('change', updatePreview);
  });
  ['q','f-status','f-side','f-setup','f-tag','sort'].forEach(id => {
    els[id].addEventListener('input', renderLibrary);
    els[id].addEventListener('change', renderLibrary);
  });
}

function render() {
  renderNav();
  renderMetaLists();
  renderOverview();
  renderLibrary();
  renderResearch();
  updatePreview();
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
  els['ticker-list'].innerHTML = uniq(state.db.meta.tickers).sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  els['setup-entry-list'].innerHTML = uniq(state.db.meta.entrySetups).sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  els['setup-exit-list'].innerHTML = uniq(state.db.meta.exitSetups).sort().map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function renderOverview() {
  const s = summarize(state.db.trades);
  const metrics = [
    ['Net PnL', money(s.net), `${s.closed.length} closed trades`],
    ['Profit Factor', s.profitFactor === Infinity ? 'MAX' : s.profitFactor.toFixed(2), 'gross profit / gross loss'],
    ['Win Rate', `${s.winRate.toFixed(1)}%`, `${s.wins.length}W / ${s.losses.length}L`],
    ['Expectancy', money(s.expectancy), '평균 달러 기대값'],
    ['Average R', `${s.avgR.toFixed(2)}R`, '닫힌 트레이드 기준'],
    ['Max Drawdown', money(s.maxDD), '누적 손익 기준'],
  ];
  els.metrics.innerHTML = metrics.map(([label, value, sub]) => `<div class="metric"><div class="label">${label}</div><div class="value ${numberClass(value)}">${value}</div><div class="sub">${sub}</div></div>`).join('');
  els['hero-focus'].textContent = bestFocus(s.closed);
  els['hero-leak'].textContent = biggestLeak(s.closed);
  els['hero-health'].textContent = systemHealth(s.closed);
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
  els.calendar.querySelectorAll('[data-day]').forEach(btn => btn.onclick = () => { els.q.value = btn.dataset.day; switchView('library'); renderLibrary(); });
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
  const items = countTags(closed, t => t.mistakes).slice(0, 8);
  els['mistake-list'].innerHTML = items.length ? items.map(i => `<div class="note-box"><strong>${escapeHtml(i.label)}</strong><div>${i.value}회</div></div>`).join('') : emptyState('실수 태그가 없습니다.');
}

function renderResearchNotes(closed) {
  const notes = [];
  const setups = groupAverageR(closed, t => t.setupEntry);
  if (setups[0]) notes.push(`현재 가장 유리한 셋업은 <strong>${escapeHtml(setups[0].label)}</strong>이며 평균 <strong>${setups[0].value.toFixed(2)}R</strong>입니다.`);
  const mistakes = countTags(closed, t => t.mistakes);
  if (mistakes[0]) notes.push(`가장 자주 반복된 실수는 <strong>${escapeHtml(mistakes[0].label)}</strong>입니다. 먼저 줄일 우선순위입니다.`);
  const lowScore = closed.filter(t => Number(t.playbookScore) <= 4);
  const highScore = closed.filter(t => Number(t.playbookScore) >= 8);
  if (lowScore.length && highScore.length) {
    notes.push(`플레이북 점수 8점 이상 표본과 4점 이하 표본의 평균 R 차이를 지속적으로 추적하십시오.`);
  }
  if (!notes.length) notes.push('표본이 더 쌓이면 자동 인사이트가 더 유의미해집니다.');
  els['research-notes'].innerHTML = notes.map(x => `<div class="note-box">${x}</div>`).join('');
}

function renderLibrary() {
  const rows = filteredTrades();
  els['trade-table'].innerHTML = rows.length ? rows.map(tradeRow).join('') : `<tr><td colspan="11" class="empty-state">검색 결과가 없습니다.</td></tr>`;
  els['trade-table'].querySelectorAll('tr[data-id]').forEach(row => row.onclick = () => selectTrade(row.dataset.id));
  if (!state.selectedTradeId && rows[0]) state.selectedTradeId = rows[0].id;
  renderDetail();
}

function filteredTrades() {
  const q = els.q.value.trim().toLowerCase();
  const status = els['f-status'].value;
  const side = els['f-side'].value;
  const setup = els['f-setup'].value.trim().toLowerCase();
  const tag = els['f-tag'].value.trim().toLowerCase();
  const sort = els.sort.value;
  const arr = state.db.trades.filter(t => {
    const hay = [t.date.slice(0,10), t.ticker, t.setupEntry, t.setupExit, t.context, t.thesis, t.review, ...(t.tags || []), ...(t.mistakes || [])].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (status !== 'ALL' && t.status !== status) return false;
    if (side !== 'ALL' && t.side !== side) return false;
    if (setup && !String(t.setupEntry || '').toLowerCase().includes(setup)) return false;
    if (tag && !(t.tags || []).some(x => x.toLowerCase().includes(tag))) return false;
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
  return `<tr data-id="${t.id}"><td>${fmtDateTime(t.date)}</td><td>${statusBadge(t.status)}</td><td><strong>${escapeHtml(t.ticker)}</strong></td><td class="${t.side === 'LONG' ? 'positive' : 'negative'}">${t.side}</td><td>${escapeHtml(t.setupEntry)}</td><td class="mono">${num(t.metrics.avgEntry)}</td><td class="mono">${t.metrics.avgExit ? num(t.metrics.avgExit) : '-'}</td><td class="mono ${t.metrics.pnl >= 0 ? 'positive' : 'negative'}">${t.status === 'CLOSED' ? money(t.metrics.pnl) : '-'}</td><td class="mono ${t.metrics.r >= 0 ? 'positive' : 'negative'}">${t.status === 'CLOSED' ? `${t.metrics.r.toFixed(2)}R` : '-'}</td><td class="mono">${money(t.metrics.riskDollar)}</td><td>${chips(t.tags)}</td></tr>`;
}

function selectTrade(id) {
  state.selectedTradeId = id;
  renderDetail();
}

function renderDetail() {
  const trade = state.db.trades.find(t => t.id === state.selectedTradeId);
  if (!trade) {
    els.detail.innerHTML = emptyState('선택된 트레이드가 없습니다.');
    els['detail-insights'].innerHTML = emptyState('데이터 없음');
    return;
  }
  els.detail.innerHTML = `
    <div class="detail-box">
      <div class="kv">
        <div>날짜</div><div>${fmtDateTime(trade.date)}</div>
        <div>티커</div><div>${escapeHtml(trade.ticker)}</div>
        <div>방향</div><div class="${trade.side === 'LONG' ? 'positive' : 'negative'}">${trade.side}</div>
        <div>셋업</div><div>${escapeHtml(trade.setupEntry)} / ${escapeHtml(trade.setupExit)}</div>
        <div>손익</div><div class="mono ${trade.metrics.pnl >= 0 ? 'positive' : 'negative'}">${money(trade.metrics.pnl)}</div>
        <div>R</div><div class="mono ${trade.metrics.r >= 0 ? 'positive' : 'negative'}">${trade.metrics.r.toFixed(2)}R</div>
        <div>플레이북</div><div>${trade.playbookScore}/10 · Grade ${trade.grade}</div>
      </div>
    </div>
    <div class="detail-box"><strong>컨텍스트</strong><div>${escapeHtml(trade.context || '-')}</div></div>
    <div class="detail-box"><strong>진입 논리</strong><div>${escapeHtml(trade.thesis || '-')}</div></div>
    <div class="detail-box"><strong>복기</strong><div>${nl(escapeHtml(trade.review || '-'))}</div></div>
    <div class="detail-box"><strong>태그</strong><div class="chips">${chips(trade.tags)}</div></div>
    <div class="detail-box"><strong>실수</strong><div class="chips">${chips(trade.mistakes)}</div></div>
    <div class="detail-box"><strong>증거 자료</strong><div>${artifactLinks(trade.artifacts)}</div></div>`;
  els['detail-insights'].innerHTML = tradeInsights(trade).map(x => `<div class="note-box">${x}</div>`).join('');
  loadTradeIntoForm(trade);
}

function renderResearch() {
  const closed = state.db.trades.filter(t => t.status === 'CLOSED');
  const setups = groupAverageR(closed, t => t.setupEntry);
  els['research-setups'].innerHTML = setups.length ? setups.map(x => `<div class="note-box"><strong>${escapeHtml(x.label)}</strong><div>표본 ${x.count}개 · 평균 ${x.value.toFixed(2)}R</div></div>`).join('') : emptyState('데이터 없음');

  const mistakes = tagPnl(closed, t => t.mistakes).slice(0, 10);
  els['research-mistakes'].innerHTML = mistakes.length ? mistakes.map(x => `<div class="note-box"><strong>${escapeHtml(x.label)}</strong><div>표본 ${x.count}개 · 누적 ${money(x.totalPnl)}</div></div>`).join('') : emptyState('실수 태그 없음');

  const emotions = emotionStats(closed);
  els['research-emotions'].innerHTML = emotions.length ? emotions.map(x => `<div class="note-box"><strong>${escapeHtml(x.label)}</strong><div>표본 ${x.count}개 · 평균 ${x.avgR.toFixed(2)}R</div></div>`).join('') : emptyState('감정 데이터 없음');

  const playbook = playbookBuckets(closed);
  els['research-discipline'].innerHTML = playbook.length ? playbook.map(x => `<div class="note-box"><strong>점수 ${escapeHtml(x.label)}</strong><div>표본 ${x.count}개 · 평균 ${x.avgR.toFixed(2)}R</div></div>`).join('') : emptyState('플레이북 점수 데이터 없음');
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
  state.selectedTradeId = null;
  resetForm();
  render();
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
    tags: splitComma(els.tags.value),
    mistakes: splitComma(els.mistakes.value),
    emotion: els.emotion.value.trim(),
    context: els.context.value.trim(),
    thesis: els.thesis.value.trim(),
    review: els.review.value.trim(),
    artifacts: splitLines(els.artifacts.value),
    entries: state.draftEntries.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    exits: state.draftExits.map(x => ({ price: Number(x.price || 0), type: x.type || 'M', weight: Number(x.weight || 0) })),
    adjustment: 0,
  };
}

function resetForm() {
  els['trade-id'].value = '';
  els['trade-date'].value = inputDate(new Date());
  els.ticker.value = 'BTCUSDT';
  els.status.value = 'CLOSED';
  els.session.value = 'NEW YORK';
  els.side.value = 'LONG';
  els['setup-entry'].value = 'BREAKOUT';
  els['setup-exit'].value = 'TRAIL STOP';
  els.grade.value = 'B';
  els['account-size'].value = '10000';
  els['risk-pct'].value = '0.5';
  els.leverage.value = '10';
  els['playbook-score'].value = '5';
  els['maker-fee'].value = '0.02';
  els['taker-fee'].value = '0.05';
  els['stop-price'].value = '';
  els['stop-type'].value = 'M';
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
  updatePreview();
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
  updatePreview();
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
      updatePreview();
    };
  });
  holder.querySelectorAll('[data-remove-kind]').forEach(btn => btn.onclick = () => {
    const arr = btn.dataset.removeKind === 'entry' ? state.draftEntries : state.draftExits;
    arr.splice(Number(btn.dataset.removeIndex), 1);
    if (btn.dataset.removeKind === 'entry' && !arr.length) arr.push({ price: 0, type: 'M', weight: 100 });
    renderLegs(btn.dataset.removeKind);
    updatePreview();
  });
}

function updatePreview() {
  const metrics = recalcTrade(readForm());
  if (metrics.directionError) {
    els['calc-summary'].innerHTML = '손절 방향이 포지션 방향과 맞지 않습니다.';
    return;
  }
  if (!metrics.valid) {
    els['calc-summary'].innerHTML = '유효한 진입가, 손절가, 진입 비중 100%가 필요합니다.';
    return;
  }
  const exitWeight = sum(state.draftExits.map(x => Number(x.weight || 0)));
  els['calc-summary'].innerHTML = `
    Qty <strong>${metrics.qty.toFixed(5)}</strong> · Avg Entry <strong>${num(metrics.avgEntry)}</strong> · Margin <strong>${money(metrics.margin)}</strong><br>
    Avg Exit <strong>${metrics.avgExit ? num(metrics.avgExit) : '-'}</strong> · Exit Weight <strong>${exitWeight}%</strong> · Fees <strong>${money(metrics.totalFees)}</strong><br>
    Net PnL <strong class="${metrics.pnl >= 0 ? 'positive' : 'negative'}">${money(metrics.pnl)}</strong> · <strong class="${metrics.r >= 0 ? 'positive' : 'negative'}">${metrics.r.toFixed(2)}R</strong>
  `;
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

function syncMeta(trade) {
  if (trade.ticker && !state.db.meta.tickers.includes(trade.ticker)) state.db.meta.tickers.push(trade.ticker);
  if (trade.setupEntry && !state.db.meta.entrySetups.includes(trade.setupEntry)) state.db.meta.entrySetups.push(trade.setupEntry);
  if (trade.setupExit && !state.db.meta.exitSetups.includes(trade.setupExit)) state.db.meta.exitSetups.push(trade.setupExit);
}

function bestFocus(closed) {
  const setups = groupAverageR(closed, t => t.setupEntry).filter(x => x.count >= 2);
  return setups[0] ? `${setups[0].label} 표본 확대` : '샘플 축적 필요';
}
function biggestLeak(closed) {
  const mistakes = countTags(closed, t => t.mistakes);
  return mistakes[0] ? mistakes[0].label : '실수 태그 없음';
}
function systemHealth(closed) {
  if (closed.length < 10) return '초기 구축 단계';
  const tagged = closed.filter(t => t.tags.length && t.mistakes.length).length / closed.length;
  if (tagged < 0.5) return '메타데이터 부족';
  return '연구 가능 수준';
}

function tradeInsights(trade) {
  const arr = [];
  arr.push(`이 트레이드는 <strong>${trade.setupEntry || 'UNLABELED'}</strong> 셋업 샘플입니다.`);
  arr.push(`플레이북 점수는 <strong>${trade.playbookScore}/10</strong>입니다.`);
  arr.push((trade.mistakes || []).length ? `실수 태그가 <strong>${trade.mistakes.length}개</strong> 달려 있습니다.` : '실수 태그가 없습니다. 결과가 좋아도 실행 검토가 필요합니다.');
  arr.push(trade.metrics.totalFees > 0 ? `수수료는 <strong>${money(trade.metrics.totalFees)}</strong>입니다.` : '수수료 정보가 충분하지 않습니다.');
  return arr;
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

function label(v) { return ({ overview: 'Overview', journal: 'Journal', library: 'Library', research: 'Research' })[v]; }
function money(n) { const v = Number(n || 0); return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`; }
function num(n) { return Number(n || 0).toFixed(2); }
function numberClass(v) { return String(v).startsWith('-') ? 'negative' : 'positive'; }
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
