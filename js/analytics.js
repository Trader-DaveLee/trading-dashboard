export function summarize(trades) {
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => t.metrics.pnl > 0);
  const losses = closed.filter(t => t.metrics.pnl < 0);
  const open = trades.filter(t => t.status === 'OPEN');

  const grossProfit = sum(wins.map(t => t.metrics.pnl));
  const grossLossAbs = Math.abs(sum(losses.map(t => t.metrics.pnl)));
  const net = sum(closed.map(t => t.metrics.pnl));
  const totalNet = sum(trades.map(t => t.metrics.pnl));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const expectancy = avg(closed.map(t => t.metrics.pnl));
  const avgR = avg(closed.map(t => t.metrics.r));
  const maxDD = calcDrawdown(closed);
  const fees = sum(trades.map(t => t.metrics.totalFees));
  const leakRate = closed.length ? closed.filter(t => (t.mistakes || []).length).length / closed.length * 100 : 0;
  const profitFactor = grossLossAbs ? grossProfit / grossLossAbs : (grossProfit ? Infinity : 0);
  const avgWin = avg(wins.map(t => t.metrics.pnl));
  const avgLoss = avg(losses.map(t => t.metrics.pnl));
  const avgScore = avg(closed.map(t => t.playbookScore));
  const realized = sum(trades.map(t => t.metrics.realizedPnl));
  const unrealized = sum(open.map(t => t.metrics.unrealizedPnl));

  return {
    trades, closed, wins, losses, open,
    grossProfit, grossLossAbs, net, totalNet, winRate, expectancy, avgR, maxDD, fees,
    leakRate, profitFactor, avgWin, avgLoss, avgScore, realized, unrealized,
  };
}

export function groupAverageR(trades, field) {
  const map = new Map();
  for (const trade of trades) {
    const key = field(trade);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade.metrics.r);
  }
  return [...map.entries()]
    .map(([label, values]) => ({ label, value: avg(values), count: values.length }))
    .sort((a, b) => b.value - a.value);
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
    avgScore: avg(rows.map(r => r.playbookScore)),
    feeDrag: sum(rows.map(r => r.metrics.totalFees)),
  })).sort((a, b) => b.avgR - a.avgR);
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
    avgScore: avg(rows.map(r => r.playbookScore)),
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
    realizedPnl: sum(rows.map(r => r.metrics.realizedPnl)),
    unrealizedPnl: sum(rows.map(r => r.metrics.unrealizedPnl)),
    winRate: rows.length ? rows.filter(r => r.metrics.pnl > 0).length / rows.length * 100 : 0,
    feeDrag: sum(rows.map(r => r.metrics.totalFees)),
    avgScore: avg(rows.map(r => r.playbookScore)),
  };
}

export function sessionSetupStats(trades) {
  return bucketStats(trades, trade => `${trade.session} · ${trade.setupEntry}`.trim())
    .filter(row => row.label !== ' · ');
}

export function gradeStats(trades) {
  return bucketStats(trades, trade => trade.grade || 'UNLABELED');
}

export function filterTradesByDate(trades, from, to) {
  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const toTime = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
  return trades.filter(trade => {
    const time = new Date(trade.date).getTime();
    return time >= fromTime && time <= toTime;
  });
}

export function calcDrawdown(trades) {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const trade of [...trades].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    equity += trade.metrics.pnl;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }
  return maxDD;
}

export function sum(arr) {
  return arr.reduce((acc, value) => acc + Number(value || 0), 0);
}

export function avg(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}
