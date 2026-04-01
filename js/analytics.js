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
  const realized = sum(trades.map(t => t.metrics.realizedPnl));
  const unrealized = sum(open.map(t => t.metrics.unrealizedPnl));

  return {
    trades, closed, wins, losses, open,
    grossProfit, grossLossAbs, net, totalNet, winRate, expectancy, avgR, maxDD, fees,
    leakRate, profitFactor, avgWin, avgLoss, realized, unrealized,
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
    feeDrag: sum(rows.map(r => r.metrics.totalFees)),
  })).sort((a, b) => b.avgR - a.avgR);
}

export function tagStats(trades, selector) {
  const map = new Map();
  for (const trade of trades) {
    for (const tag of selector(trade) || []) {
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

// ✨ 타임존 오차 없이 로컬(한국시간) 날짜를 안전하게 문자열로 비교
export function filterTradesByDate(trades, from, to) {
  return trades.filter(trade => {
    const tradeLocal = new Date(trade.date);
    if (Number.isNaN(tradeLocal.getTime())) return true;
    
    const pad = n => String(n).padStart(2, '0');
    const tradeDateStr = `${tradeLocal.getFullYear()}-${pad(tradeLocal.getMonth() + 1)}-${pad(tradeLocal.getDate())}`;

    if (from && tradeDateStr < from) return false;
    if (to && tradeDateStr > to) return false;
    return true;
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
