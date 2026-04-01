export function sumWeights(rows) {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.weight || 0)), 0);
}

export function recalcTrade(trade) {
  const side = trade.side === 'SHORT' ? -1 : 1;
  const maker = Number(trade.makerFee || 0) / 100;
  const taker = Number(trade.takerFee || 0) / 100;
  const stop = Number(trade.stopPrice || 0);
  const accountSize = Math.max(0, Number(trade.accountSize || 0));
  const riskPct = Math.max(0, Number(trade.riskPct || 0));
  const riskDollar = accountSize * riskPct / 100;

  const entries = (trade.entries || []).filter(e => Number(e.price) > 0 && Number(e.weight) > 0);
  const exits = (trade.exits || []).filter(e => Number(e.price) > 0 && Number(e.weight) > 0);

  const entryTotal = sumWeights(entries);
  const exitTotalRaw = sumWeights(exits);
  
  if (exitTotalRaw > 100) {
    const base = baseMetrics(riskDollar);
    base.exitExceeds100 = true;
    base.exitPct = exitTotalRaw;
    return base;
  }

  const exitPct = exitTotalRaw;
  const remainingPct = Math.max(0, 100 - exitPct);

  const invalid = !stop || !entries.length || Math.round(entryTotal) !== 100;
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

  const qty = riskDollar ? riskDollar / riskPerUnit : 0;
  const margin = qty * avgEntry / Math.max(1, Number(trade.leverage || 1));
  const sliderPct = accountSize ? (margin / accountSize) * 100 : 0;
  const notional = qty * avgEntry;
  const stopDistancePct = avgEntry ? (Math.abs(avgEntry - stop) / avgEntry) * 100 : 0;

  let entryFees = 0;
  for (const leg of entries) {
    entryFees += Number(leg.price) * qty * (Number(leg.weight) / 100) * (leg.type === 'M' ? maker : taker);
  }

  let exitFees = 0;
  let grossRealized = 0;
  let avgExit = 0;

  if (exits.length && exitPct > 0) {
    for (const leg of exits) {
      const price = Number(leg.price);
      const weightPct = Number(leg.weight) / 100;
      const normalizedExitWeight = Number(leg.weight) / exitPct;
      avgExit += price * normalizedExitWeight;
      grossRealized += (price - avgEntry) * side * (qty * weightPct);
      exitFees += price * (qty * weightPct) * (leg.type === 'M' ? maker : taker);
    }
  }

  const entryFeesRealized = entryFees * (exitPct / 100);
  const entryFeesRemaining = entryFees - entryFeesRealized;
  const realizedPnl = grossRealized - entryFeesRealized - exitFees;

  const remainingQty = qty * (remainingPct / 100);
  const remainingExposure = remainingQty * avgEntry;
  const residualRisk = remainingQty * (Math.abs(avgEntry - stop) + stop * ((trade.stopType || 'M') === 'M' ? maker : taker));

  let grossUnrealized = 0;
  let unrealizedPnl = 0;
  const markPrice = Number(trade.markPrice || 0);
  const missingMarkPrice = remainingQty > 0 && markPrice === 0;

  if (remainingQty > 0 && markPrice > 0) {
    grossUnrealized = (markPrice - avgEntry) * side * remainingQty;
    unrealizedPnl = grossUnrealized - entryFeesRemaining;
  }

  const totalFees = entryFees + exitFees;
  const adjustment = Number(trade.adjustment || 0);
  const netPnl = realizedPnl + unrealizedPnl + adjustment;
  const feePctOfGross = grossRealized || grossUnrealized
    ? (totalFees / Math.max(1e-9, Math.abs(grossRealized + grossUnrealized))) * 100
    : 0;

  const realizedR = riskDollar ? realizedPnl / riskDollar : 0;
  const unrealizedR = riskDollar ? unrealizedPnl / riskDollar : 0;
  const r = riskDollar ? netPnl / riskDollar : 0;

  // ✨ 신규: 정확한 본절가(Break-Even Price) 및 계좌 수익률(ROI)
  const breakEvenPrice = qty > 0 ? avgEntry + (side * (entryFees / qty)) : 0;
  const accountImpact = accountSize > 0 ? (netPnl / accountSize) * 100 : 0;

  // ✨ 신규: 타겟 도달 시 예상 성과 (Projected PnL & R)
  let projectedPnl = 0;
  let projectedR = 0;
  if (exits.length > 0 && trade.status === 'OPEN') {
    let projectedGross = 0;
    let projectedExitFees = 0;
    let exitWeightSum = sumWeights(exits);
    if (exitWeightSum > 0) {
      for (const leg of exits) {
         const price = Number(leg.price);
         const w = (Number(leg.weight) / exitWeightSum); // 비중 100%로 환산
         projectedGross += (price - avgEntry) * side * (qty * w);
         projectedExitFees += price * (qty * w) * (leg.type === 'M' ? maker : taker);
      }
    }
    projectedPnl = projectedGross - entryFees - projectedExitFees;
    projectedR = riskDollar ? projectedPnl / riskDollar : 0;
  }

  return {
    valid: true, directionError: false, exitExceeds100: false, missingMarkPrice,
    riskDollar, avgEntry, avgExit, qty, margin, sliderPct, notional, stopDistancePct,
    exitPct, remainingPct, remainingQty, remainingExposure, residualRisk,
    grossRealized, realizedPnl, grossUnrealized, unrealizedPnl, pnl: netPnl, netPnl,
    realizedR, unrealizedR, r, totalFees, entryFees, exitFees, feePctOfGross,
    breakEvenPrice, accountImpact, projectedPnl, projectedR,
    scaleInCount: entries.length, scaleOutCount: exits.length,
  };
}

function baseMetrics(riskDollar = 0, avgEntry = 0, directionError = false) {
  return {
    valid: false, directionError, exitExceeds100: false, missingMarkPrice: false, riskDollar, avgEntry, avgExit: 0,
    qty: 0, margin: 0, sliderPct: 0, notional: 0, stopDistancePct: 0, exitPct: 0,
    remainingPct: 0, remainingQty: 0, remainingExposure: 0, residualRisk: 0,
    grossRealized: 0, realizedPnl: 0, grossUnrealized: 0, unrealizedPnl: 0,
    pnl: 0, netPnl: 0, realizedR: 0, unrealizedR: 0, r: 0,
    totalFees: 0, entryFees: 0, exitFees: 0, feePctOfGross: 0, breakEvenPrice: 0, accountImpact: 0, projectedPnl: 0, projectedR: 0,
    scaleInCount: 0, scaleOutCount: 0,
  };
}
