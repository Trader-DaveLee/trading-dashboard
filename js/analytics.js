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
  return { closed, wins, losses, grossProfit, grossLossAbs, net, winRate, expectancy, avgR, maxDD, fees, leakRate, profitFactor };
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

export function countTags(trades, selector) {
  const counts = new Map();
  for (const trade of trades) {
    for (const tag of selector(trade)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function tagPnl(trades, selector) {
  const map = new Map();
  for (const trade of trades) {
    for (const tag of selector(trade)) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(trade.metrics.pnl);
    }
  }
  return [...map.entries()].map(([label, values]) => ({ label, count: values.length, totalPnl: sum(values), avgPnl: avg(values), avgR: avg(values) })).sort((a, b) => a.totalPnl - b.totalPnl);
}

export function emotionStats(trades) {
  const buckets = new Map();
  for (const trade of trades) {
    const key = (trade.emotion || 'unlabeled').trim();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(trade.metrics.r);
  }
  return [...buckets.entries()].map(([label, arr]) => ({ label, count: arr.length, avgR: avg(arr) })).sort((a, b) => b.avgR - a.avgR);
}

export function playbookBuckets(trades) {
  const buckets = new Map();
  for (const trade of trades) {
    const key = String(trade.playbookScore ?? 'na');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(trade.metrics.r);
  }
  return [...buckets.entries()].map(([label, arr]) => ({ label, count: arr.length, avgR: avg(arr) })).sort((a, b) => Number(a.label) - Number(b.label));
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
