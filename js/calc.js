export function sumWeights(rows) {
  return rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
}

export function recalcTrade(trade) {
  const side = trade.side === 'SHORT' ? -1 : 1;
  const maker = Number(trade.makerFee || 0) / 100;
  const taker = Number(trade.takerFee || 0) / 100;
  const stop = Number(trade.stopPrice || 0);
  const accountSize = Number(trade.accountSize || 0);
  const riskPct = Number(trade.riskPct || 0);
  const riskDollar = accountSize * riskPct / 100;
  const entries = (trade.entries || []).filter(e => Number(e.price) > 0 && Number(e.weight) > 0);
  const exits = (trade.exits || []).filter(e => Number(e.price) > 0 && Number(e.weight) > 0);

  const invalid = !stop || !entries.length || Math.round(sumWeights(entries)) !== 100;
  if (invalid) return baseMetrics(riskDollar);

  let avgEntry = 0;
  let riskPerUnit = 0;
  let directionError = false;
  for (const leg of entries) {
    const price = Number(leg.price);
    const weight = Number(leg.weight) / 100;
    const fee = leg.type === 'M' ? maker : taker;
    avgEntry += price * weight;
    if ((side === 1 && stop >= price) || (side === -1 && stop <= price)) directionError = true;
    riskPerUnit += weight * (Math.abs(price - stop) + price * fee);
  }
  riskPerUnit += stop * ((trade.stopType || 'M') === 'M' ? maker : taker);
  if (!riskPerUnit || directionError) return baseMetrics(riskDollar, avgEntry, true);

  const qty = riskDollar / riskPerUnit;
  const margin = qty * avgEntry / Math.max(1, Number(trade.leverage || 1));
  let totalFees = 0;
  for (const leg of entries) totalFees += Number(leg.price) * qty * (Number(leg.weight) / 100) * (leg.type === 'M' ? maker : taker);

  let avgExit = 0;
  let grossPnl = 0;
  const exitTotal = sumWeights(exits);
  if (exits.length && exitTotal > 0) {
    for (const leg of exits) {
      const price = Number(leg.price);
      const weight = Number(leg.weight) / 100;
      avgExit += price * (Number(leg.weight) / exitTotal);
      grossPnl += (price - avgEntry) * side * (qty * weight);
      totalFees += price * (qty * weight) * (leg.type === 'M' ? maker : taker);
    }
  }

  const adjustment = Number(trade.adjustment || 0);
  const pnl = exits.length ? grossPnl - totalFees + adjustment : 0;
  return {
    valid: true,
    directionError: false,
    riskDollar,
    avgEntry,
    avgExit,
    qty,
    margin,
    pnl,
    r: riskDollar ? pnl / riskDollar : 0,
    totalFees,
  };
}

function baseMetrics(riskDollar = 0, avgEntry = 0, directionError = false) {
  return { valid: false, directionError, riskDollar, avgEntry, avgExit: 0, qty: 0, margin: 0, pnl: 0, r: 0, totalFees: 0 };
}
