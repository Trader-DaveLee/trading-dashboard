export function summarize(trades) {
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => t.metrics.pnl > 0);
  const losses = closed.filter(t => t.metrics.pnl < 0);
  const grossProfit = sum(wins.map(t => t.metrics.pnl));
  const grossLossAbs = Math.abs(sum(losses.map(t => t.metrics.pnl)));
  const net = sum(closed.map(t => t.metrics.pnl));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const expectancy = avg(closed.map(t => t.metrics.pnl));
  const avgR = avg(closed.map(t => t.metrics.r));
  const maxDD = calcDrawdown(closed);
  const fees = sum(closed.map(t => t.metrics.totalFees));
  const leakRate = closed.length ? closed.filter(t => (t.mistakes || []).length).length / closed.length * 100 : 0;
  const profitFactor = grossLossAbs ? grossProfit / grossLossAbs : (grossProfit ? Infinity : 0);
  const avgWin = avg(wins.map(t => t.metrics.pnl));
  const avgLoss = avg(losses.map(t => t.metrics.pnl));
  return { closed, wins, losses, grossProfit, grossLossAbs, net, winRate, expectancy, avgR, maxDD, fees, leakRate, profitFactor, avgWin, avgLoss };
}

export function groupAverageR(trades, field) {
  const map = new Map();
  for (const trade of trades) {
    const key = field(trade);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade.metrics.r);
  }
  return [...map.entries()].map(([label, values]) => ({ label, value: avg(values), count: values.length })).sort((a, b) => b.value - a.value);
}

export function bucketStats(trades, field) {
  const map = new Map();
  for (const trade of trades) {
    const key = field(trade);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade);
  }
  return [...map.entries()].map(([label, rows]) => ({
    label,
    count: rows.length,
    totalPnl: sum(rows.map(r => r.metrics.pnl)),
    avgPnl: avg(rows.map(r => r.metrics.pnl)),
    avgR: avg(rows.map(r => r.metrics.r)),
    winRate: rows.length ? rows.filter(r => r.metrics.pnl > 0).length / rows.length * 100 : 0,
  })).sort((a, b) => b.avgR - a.avgR);
}

export function countTags(trades, selector) {
  const counts = new Map();
  for (const trade of trades) {
    for (const tag of selector(trade)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function tagStats(trades, selector) {
  const map = new Map();
  for (const trade of trades) {
    for (const tag of selector(trade)) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(trade);
    }
  }
  return [...map.entries()].map(([label, rows]) => ({
    label,
    count: rows.length,
    totalPnl: sum(rows.map(r => r.metrics.pnl)),
    avgPnl: avg(rows.map(r => r.metrics.pnl)),
    avgR: avg(rows.map(r => r.metrics.r)),
    winRate: rows.length ? rows.filter(r => r.metrics.pnl > 0).length / rows.length * 100 : 0,
  })).sort((a, b) => a.totalPnl - b.totalPnl);
}

export function emotionStats(trades) {
  return bucketStats(trades, trade => (trade.emotion || 'UNLABELED').trim().toUpperCase());
}

export function playbookBuckets(trades) {
  return bucketStats(trades, trade => String(trade.playbookScore ?? 'NA'))
    .sort((a, b) => Number(a.label) - Number(b.label));
}

export function recentWindowStats(trades, size = 20) {
  const rows = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-size);
  return {
    count: rows.length,
    avgR: avg(rows.map(r => r.metrics.r)),
    netPnl: sum(rows.map(r => r.metrics.pnl)),
    winRate: rows.length ? rows.filter(r => r.metrics.pnl > 0).length / rows.length * 100 : 0,
  };
}

function calcDrawdown(trades) {
  let equity = 0, peak = 0, maxDD = 0;
  for (const t of [...trades].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    equity += t.metrics.pnl;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }
  return maxDD;
}

export function sum(arr) { return arr.reduce((a, b) => a + Number(b || 0), 0); }
export function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }
