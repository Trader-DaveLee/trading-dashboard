export function sumWeights(rows) {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.weight || 0)), 0);
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function stopFeeRate(trade, maker, taker) {
  return (trade.stopType || 'M') === 'M' ? maker : taker;
}

function normalizeEntryLegs(trade) {
  return (trade.entries || []).filter(e => Number(e.price) > 0 && Number(e.weight) > 0).map(e => ({
    price: Number(e.price || 0),
    type: String(e.type || 'M').toUpperCase() === 'T' ? 'T' : 'M',
    weight: Math.max(0, Number(e.weight || 0)),
    leverage: Math.max(1, Number(e.leverage || trade.leverage || 1)),
  }));
}

function normalizeExitLegs(trade) {
  return (trade.exits || []).filter(e => Number(e.price) > 0 && Number(e.weight) > 0).map(e => ({
    price: Number(e.price || 0),
    type: String(e.type || 'M').toUpperCase() === 'T' ? 'T' : 'M',
    weight: Math.max(0, Number(e.weight || 0)),
    status: String(e.status || (trade.status === 'CLOSED' ? 'FILLED' : 'PLANNED')).toUpperCase() === 'FILLED' ? 'FILLED' : 'PLANNED',
  }));
}

export function recalcTrade(trade) {
  const side = trade.side === 'SHORT' ? -1 : 1;
  const maker = Number(trade.makerFee || 0) / 100;
  const taker = Number(trade.takerFee || 0) / 100;
  const stop = Number(trade.stopPrice || 0);
  const targetPrice = Number(trade.targetPrice || 0);
  const accountSize = Math.max(0, Number(trade.accountSize || 0));
  const riskPct = Math.max(0, Number(trade.riskPct || 0));
  const riskDollar = accountSize * riskPct / 100;
  const stopFee = stopFeeRate(trade, maker, taker);

  const entries = normalizeEntryLegs(trade);
  const exitRows = normalizeExitLegs(trade);
  const filledExits = exitRows.filter(e => e.status === 'FILLED' || trade.status === 'CLOSED');
  const plannedExits = trade.status === 'OPEN' ? exitRows.filter(e => e.status !== 'FILLED') : [];

  const filledExitPctRaw = sumWeights(filledExits);
  if (filledExitPctRaw > 100) {
    const base = baseMetrics(riskDollar);
    base.exitExceeds100 = true;
    base.actualExitPct = filledExitPctRaw;
    return base;
  }

  const entryWeightTotal = sumWeights(entries);
  if (!stop || !entries.length || entryWeightTotal <= 0) return baseMetrics(riskDollar);

  let directionError = false;
  let totalQty = 0;
  let totalNotional = 0;
  let totalMargin = 0;
  let entryFees = 0;
  let actualRiskUsed = 0;
  const entryBreakdown = [];

  for (const leg of entries) {
    const entryFeeRate = leg.type === 'M' ? maker : taker;
    if ((side === 1 && stop >= leg.price) || (side === -1 && stop <= leg.price)) directionError = true;
    const unitRisk = Math.abs(leg.price - stop) + leg.price * entryFeeRate + stop * stopFee;
    const legRiskBudget = riskDollar * (leg.weight / 100);
    const legQty = unitRisk > 0 ? legRiskBudget / unitRisk : 0;
    const legNotional = legQty * leg.price;
    const legMargin = legNotional / Math.max(1, leg.leverage);
    const legEntryFees = leg.price * legQty * entryFeeRate;
    const legStopRisk = legQty * unitRisk;

    totalQty += legQty;
    totalNotional += legNotional;
    totalMargin += legMargin;
    entryFees += legEntryFees;
    actualRiskUsed += legStopRisk;
    entryBreakdown.push({
      price: leg.price,
      type: leg.type,
      leverage: leg.leverage,
      weight: leg.weight,
      qty: legQty,
      notional: legNotional,
      margin: legMargin,
      riskDollar: legStopRisk,
    });
  }

  if (directionError || totalQty <= 0) return baseMetrics(riskDollar, 0, true);

  const avgEntry = totalNotional / totalQty;
  const weightedLeverage = totalMargin > 0 ? totalNotional / totalMargin : Math.max(1, Number(trade.leverage || 1));
  const sliderPct = accountSize ? (totalMargin / accountSize) * 100 : 0;
  const stopDistancePct = avgEntry ? (Math.abs(avgEntry - stop) / avgEntry) * 100 : 0;

  let avgExit = 0;
  let grossRealized = 0;
  let exitFees = 0;
  const actualExitPct = filledExitPctRaw;
  const actualRemainingPct = Math.max(0, 100 - actualExitPct);

  if (filledExits.length && actualExitPct > 0) {
    let totalClosedQty = 0;
    for (const leg of filledExits) {
      const closeQty = totalQty * (leg.weight / 100);
      const feeRate = leg.type === 'M' ? maker : taker;
      totalClosedQty += closeQty;
      avgExit += leg.price * closeQty;
      grossRealized += (leg.price - avgEntry) * side * closeQty;
      exitFees += leg.price * closeQty * feeRate;
    }
    avgExit = totalClosedQty > 0 ? avgExit / totalClosedQty : 0;
  }

  const entryFeesRealized = entryFees * (actualExitPct / 100);
  const entryFeesRemaining = entryFees - entryFeesRealized;
  const realizedPnl = grossRealized - entryFeesRealized - exitFees;

  const remainingQty = totalQty * (actualRemainingPct / 100);
  const remainingExposure = remainingQty * avgEntry;
  const residualRisk = remainingQty * (Math.abs(avgEntry - stop) + stop * stopFee);

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
  const grossForFee = Math.abs(grossRealized + grossUnrealized);
  const feePctOfGross = grossForFee > 0 ? (totalFees / grossForFee) * 100 : 0;

  const realizedR = riskDollar ? realizedPnl / riskDollar : 0;
  const unrealizedR = riskDollar ? unrealizedPnl / riskDollar : 0;
  const r = riskDollar ? netPnl / riskDollar : 0;
  const accountImpact = accountSize > 0 ? (netPnl / accountSize) * 100 : 0;
  const assumedCloseFee = remainingQty * avgEntry * taker;
  const breakEvenPrice = remainingQty > 0 ? avgEntry + (side * ((entryFeesRemaining + assumedCloseFee) / remainingQty)) : 0;
  const actualRiskPctOfBudget = riskDollar > 0 ? (actualRiskUsed / riskDollar) * 100 : 0;
  const availableRiskDollar = Math.max(0, riskDollar - actualRiskUsed);
  const overRiskDollar = Math.max(0, actualRiskUsed - riskDollar);

  let projectedPnl = 0;
  let projectedR = 0;
  let hasProjection = false;
  const projectionSteps = [];

  if (trade.status === 'OPEN' && plannedExits.length && remainingQty > 0) {
    let projectedClosedPct = 0;
    let cumulativePnl = realizedPnl;
    let cumulativeFees = 0;
    plannedExits.forEach((leg, idx) => {
      const closePct = Math.max(0, Number(leg.weight || 0));
      const closeQty = totalQty * (closePct / 100);
      const feeRate = leg.type === 'M' ? maker : taker;
      const gross = (leg.price - avgEntry) * side * closeQty;
      const entryFeeAlloc = entryFees * (closePct / 100);
      const exitFee = leg.price * closeQty * feeRate;
      cumulativeFees += exitFee;
      cumulativePnl += gross - entryFeeAlloc - exitFee;
      projectedClosedPct += closePct;
      const remPct = Math.max(0, 100 - actualExitPct - projectedClosedPct);
      const remQty = totalQty * (remPct / 100);
      const remRisk = remQty * (Math.abs(avgEntry - stop) + stop * stopFee);
      projectionSteps.push({
        label: `TP${idx + 1}`,
        price: leg.price,
        closePct,
        cumulativePnl,
        cumulativeR: riskDollar ? cumulativePnl / riskDollar : 0,
        remainingQty: remQty,
        remainingRisk: remRisk,
      });
    });
    projectedPnl = projectionSteps.length ? projectionSteps[projectionSteps.length - 1].cumulativePnl : 0;
    projectedR = riskDollar ? projectedPnl / riskDollar : 0;
    hasProjection = projectionSteps.length > 0;

    const projectedPct = actualExitPct + plannedExits.reduce((sum, leg) => sum + Number(leg.weight || 0), 0);
    if (targetPrice > 0 && projectedPct < 100) {
      const remPct = Math.max(0, 100 - projectedPct);
      const closeQty = totalQty * (remPct / 100);
      const gross = (targetPrice - avgEntry) * side * closeQty;
      const entryFeeAlloc = entryFees * (remPct / 100);
      const exitFee = targetPrice * closeQty * taker;
      projectedPnl += gross - entryFeeAlloc - exitFee;
      projectedR = riskDollar ? projectedPnl / riskDollar : 0;
      projectionSteps.push({
        label: 'Final TP',
        price: targetPrice,
        closePct: remPct,
        cumulativePnl: projectedPnl,
        cumulativeR: projectedR,
        remainingQty: 0,
        remainingRisk: 0,
      });
      hasProjection = true;
    }
  } else if (trade.status === 'OPEN' && targetPrice > 0 && remainingQty > 0) {
    const projectedGross = (targetPrice - avgEntry) * side * remainingQty;
    const projectedExitFees = targetPrice * remainingQty * taker;
    projectedPnl = realizedPnl + projectedGross - entryFeesRemaining - projectedExitFees;
    projectedR = riskDollar ? projectedPnl / riskDollar : 0;
    hasProjection = true;
    projectionSteps.push({
      label: 'TP',
      price: targetPrice,
      closePct: actualRemainingPct,
      cumulativePnl: projectedPnl,
      cumulativeR: projectedR,
      remainingQty: 0,
      remainingRisk: 0,
    });
  }

  return {
    valid: true, directionError: false, exitExceeds100: false, missingMarkPrice,
    riskDollar, avgEntry, avgExit, qty: totalQty, margin: totalMargin, sliderPct, notional: totalNotional, stopDistancePct, stopDistanceAbs: Math.abs(avgEntry - stop),
    actualExitPct, plannedExitPct: sumWeights(plannedExits), remainingPct: actualRemainingPct, remainingQty, remainingExposure, residualRisk,
    grossRealized, realizedPnl, grossUnrealized, unrealizedPnl, pnl: netPnl, netPnl,
    realizedR, unrealizedR, r, totalFees, entryFees, exitFees, feePctOfGross,
    breakEvenPrice, accountImpact, projectedPnl, projectedR, hasProjection, projectionSteps,
    scaleInCount: entries.length, scaleOutCount: exitRows.length,
    entryBreakdown, weightedLeverage, actualRiskUsed, actualRiskPctOfBudget, availableRiskDollar, overRiskDollar,
  };
}

export function generatePlannerSuggestion(trade) {
  const currentPrice = Number(trade.currentPrice || trade.markPrice || trade.targetPrice || 0);
  const stop = Number(trade.stopPrice || 0);
  const legsCount = Math.max(1, Math.min(4, Number(trade.plannerLegs || 3)));
  const side = trade.side === 'SHORT' ? -1 : 1;
  if (!currentPrice || !stop || !trade.accountSize || !trade.riskPct) return { valid: false, reason: '현재가, 손절가, 계좌, 리스크를 먼저 입력하세요.' };
  if ((side === 1 && stop >= currentPrice) || (side === -1 && stop <= currentPrice)) return { valid: false, reason: '현재가와 손절가 방향이 맞지 않습니다.' };

  const dist = Math.abs(currentPrice - stop);
  const depthRatio = trade.plannerMode === 'LADDER_TIGHT' ? 0.45 : trade.plannerMode === 'LADDER_DEEP' ? 0.15 : 0.30;
  const deepest = trade.plannerMode === 'SINGLE' || legsCount === 1
    ? currentPrice
    : (side === 1 ? stop + dist * depthRatio : stop - dist * depthRatio);

  const prices = [];
  for (let i = 0; i < legsCount; i += 1) {
    if (legsCount === 1) prices.push(currentPrice);
    else {
      const t = i / (legsCount - 1);
      prices.push(currentPrice + (deepest - currentPrice) * t);
    }
  }

  let weightsRaw;
  if (trade.plannerWeightMode === 'FRONTLOADED') {
    weightsRaw = Array.from({ length: legsCount }, (_, i) => legsCount - i);
  } else if (trade.plannerWeightMode === 'BACKLOADED') {
    weightsRaw = Array.from({ length: legsCount }, (_, i) => i + 1);
  } else {
    weightsRaw = Array.from({ length: legsCount }, () => 1);
  }
  const rawSum = weightsRaw.reduce((a, b) => a + b, 0);
  const weights = weightsRaw.map(w => (w / rawSum) * 100);

  let entries = prices.map((price, idx) => ({
    price: round(price, 4),
    type: 'T',
    weight: round(weights[idx], 2),
    leverage: Math.max(1, Number(trade.leverage || 1)),
  }));

  let metrics = recalcTrade({ ...trade, entries, exits: [] });
  entries = entries.map((entry, idx) => {
    const breakdown = metrics.entryBreakdown[idx];
    const desiredCapital = Math.max(1, Number(trade.accountSize || 0) * (entry.weight / 100));
    const suggestedLeverage = breakdown && breakdown.notional > 0 ? Math.max(1, Math.ceil(breakdown.notional / desiredCapital)) : Math.max(1, Number(trade.leverage || 1));
    return { ...entry, leverage: Math.max(1, suggestedLeverage, Number(trade.leverage || 1)) };
  });

  metrics = recalcTrade({ ...trade, entries, exits: [] });
  return {
    valid: true,
    entries,
    metrics,
    currentPrice: round(currentPrice, 4),
    stopPrice: round(stop, 4),
    plannerMode: trade.plannerMode || 'LADDER',
    plannerWeightMode: trade.plannerWeightMode || 'BACKLOADED',
  };
}

export function calcScaleInScenario(trade, candidate) {
  const price = Number(candidate?.price || 0);
  const weight = Math.max(0, Number(candidate?.weight || 0));
  const leverage = Math.max(1, Number(candidate?.leverage || trade.leverage || 1));
  const type = String(candidate?.type || 'T').toUpperCase() === 'M' ? 'M' : 'T';
  if (!price || !weight) return { valid: false, reason: '추가 진입가와 Risk Share를 입력하세요.' };
  const metricsBefore = trade.metrics || recalcTrade(trade);
  const scenarioTrade = { ...trade, entries: [...(trade.entries || []), { price, weight, leverage, type }] };
  const metricsAfter = recalcTrade(scenarioTrade);
  return {
    valid: metricsAfter.valid,
    candidate: { price, weight, leverage, type },
    before: metricsBefore,
    after: metricsAfter,
    deltaQty: metricsAfter.qty - metricsBefore.qty,
    deltaMargin: metricsAfter.margin - metricsBefore.margin,
    deltaRisk: metricsAfter.actualRiskUsed - metricsBefore.actualRiskUsed,
    deltaProjectedPnl: metricsAfter.projectedPnl - metricsBefore.projectedPnl,
    deltaProjectedR: metricsAfter.projectedR - metricsBefore.projectedR,
    withinRiskLimit: metricsAfter.actualRiskPctOfBudget <= 100.0001,
  };
}

function baseMetrics(riskDollar = 0, avgEntry = 0, directionError = false) {
  return {
    valid: false, directionError, exitExceeds100: false, missingMarkPrice: false, riskDollar, avgEntry, avgExit: 0,
    qty: 0, margin: 0, sliderPct: 0, notional: 0, stopDistancePct: 0, stopDistanceAbs: 0, actualExitPct: 0, plannedExitPct: 0,
    remainingPct: 0, remainingQty: 0, remainingExposure: 0, residualRisk: 0,
    grossRealized: 0, realizedPnl: 0, grossUnrealized: 0, unrealizedPnl: 0,
    pnl: 0, netPnl: 0, realizedR: 0, unrealizedR: 0, r: 0,
    totalFees: 0, entryFees: 0, exitFees: 0, feePctOfGross: 0, breakEvenPrice: 0, accountImpact: 0, projectedPnl: 0, projectedR: 0, hasProjection: false, projectionSteps: [],
    scaleInCount: 0, scaleOutCount: 0, entryBreakdown: [], weightedLeverage: 1, actualRiskUsed: 0, actualRiskPctOfBudget: 0, availableRiskDollar: riskDollar, overRiskDollar: 0,
  };
}
