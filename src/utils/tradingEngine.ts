import { MarketPrice, Position, TradingBot, SystemLog } from "../types";
import { dbService } from "./db";

// Hardcoded starter prices
export const INITIAL_PRICES: Record<string, number> = {
  "BTC/USDT": 67520.0,
  "ETH/USDT": 3465.0,
  "SOL/USDT": 146.5,
  "BNB/USDT": 582.0,
};

// Simulate 24-hour baseline variations
export const INITIAL_CHANGES: Record<string, number> = {
  "BTC/USDT": 3.42,
  "ETH/USDT": -1.15,
  "SOL/USDT": 8.74,
  "BNB/USDT": 0.52,
};

/**
 * Generate a randomized tick for simulating real crypto market volatility
 */
export function getUpdatedPrices(currentPrices: Record<string, number>): Record<string, number> {
  const nextPrices: Record<string, number> = { ...currentPrices };
  
  for (const pair in nextPrices) {
    const price = nextPrices[pair];
    // Random fluctuation percentage between -0.15% and +0.15% per tick
    const changePct = (Math.random() * 0.3 - 0.15) / 100;
    const tickChange = price * changePct;
    nextPrices[pair] = parseFloat((price + tickChange).toFixed(pair.startsWith("SOL") ? 2 : 1));
  }
  
  return nextPrices;
}

/**
 * Handles evaluation of Trailing Profits, Trailing Stop Losses, and DCA Safety Orders
 * for all open positions against current market prices.
 */
export async function tickPositions(
  userId: string,
  positions: Position[],
  bots: TradingBot[],
  prices: Record<string, number>,
  userBalances: Record<string, Record<string, number>>,
  onPositionsUpdated: (updatedList: Position[]) => void,
  onBalancesUpdated: (updatedBal: Record<string, Record<string, number>>) => void,
  futuresPrices?: Record<string, number>
): Promise<void> {
  if (positions.length === 0) return;

  let listsUpdated = false;
  const nextPositions = [...positions];

  for (let i = 0; i < nextPositions.length; i++) {
    const pos = { ...nextPositions[i] };
    if (pos.status === "closed") continue;

    const isFutures = (pos.leverage && pos.leverage > 1);
    const currentPrice = isFutures 
      ? (futuresPrices && futuresPrices[pos.pair]) || prices[pos.pair]
      : prices[pos.pair];

    if (!currentPrice) continue;

    // Update real-time metrics
    pos.currentPrice = currentPrice;
    
    // Calculate PnL relative to trade direction
    if (pos.type === "long") {
      pos.pnl = (currentPrice - pos.entryPrice) * pos.amount;
      pos.pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    } else { // Short direction
      pos.pnl = (pos.entryPrice - currentPrice) * pos.amount;
      pos.pnlPercent = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
    }

    // Determine high / low bounds for Trailing Triggers
    if (pos.type === "long") {
      if (currentPrice > pos.maxPriceSeen) {
        pos.maxPriceSeen = currentPrice;
        
        // If Trailing Stop Loss is enabled, dynamically drag SL floor upward!
        const botConfig = bots.find(b => b.id === pos.botId);
        if (botConfig && botConfig.stopLossPercent && botConfig.trailingSlEnabled) {
          const slDistance = pos.maxPriceSeen * (botConfig.stopLossPercent / 100);
          pos.slTriggerPrice = parseFloat((pos.maxPriceSeen - slDistance).toFixed(4));
        }
      }
    } else {
      // Short: Tracks low bounds for trailing
      const currentMin = pos.minPriceSeen ?? pos.entryPrice;
      if (currentPrice < currentMin) {
        pos.minPriceSeen = currentPrice;
        
        const botConfig = bots.find(b => b.id === pos.botId);
        if (botConfig && botConfig.stopLossPercent && botConfig.trailingSlEnabled) {
          const slDistance = pos.minPriceSeen * (botConfig.stopLossPercent / 100);
          pos.slTriggerPrice = parseFloat((pos.minPriceSeen + slDistance).toFixed(4));
        }
      }
    }

    // Core Config for Bot controlling this trade
    const bot = bots.find(b => b.id === pos.botId);
    if (!bot) continue;

    // Trigger States Check
    const trailingTpOffset = pos.trailingTpPercent !== undefined ? pos.trailingTpPercent : (bot.trailingTpPercent || 0);
    const hasTrailingProfit = trailingTpOffset > 0;

    // ----------------------------------------------------
    // CHECK TAKE PROFIT (TP) & TRAILING TAKE PROFIT
    // ----------------------------------------------------
    let shouldCloseTrade = false;
    let closeReason: Position["closeReason"] = "manual";

    if (pos.type === "long") {
      // Intial Take Profit target crossed
      if (currentPrice >= pos.tpTriggerPrice) {
        if (hasTrailingProfit) {
          if (!pos.trailingTpActive) {
            pos.trailingTpActive = true;
            listsUpdated = true;
            await dbService.addLog(
              userId,
              `🚀 [TRAILING ACTIVE] ${pos.pair} Take-Profit target of +${bot.takeProfitPercent}% reached at $${pos.tpTriggerPrice}. Launching Trailing Take Profit (Tracking peak at $${currentPrice.toFixed(2)})`,
              "info",
              pos.botId,
              bot.name
            );
          }
        } else {
          // Standard TP execution (No trailing configured)
          shouldCloseTrade = true;
          closeReason = "tp";
        }
      }

      // If trailing TP is active, check for trend reversal/deviation breech
      if (pos.trailingTpActive) {
        const trailingDropThreshold = pos.maxPriceSeen * (1 - trailingTpOffset / 100);
        if (currentPrice <= trailingDropThreshold) {
          shouldCloseTrade = true;
          closeReason = "trailing_tp";
        }
      }
    } else { // SHORT POSITION
      if (currentPrice <= pos.tpTriggerPrice) {
        if (hasTrailingProfit) {
          if (!pos.trailingTpActive) {
            pos.trailingTpActive = true;
            listsUpdated = true;
            await dbService.addLog(
              userId,
              `🚀 [TRAILING ACTIVE] Short ${pos.pair} Take-Profit target reached at $${pos.tpTriggerPrice}. Active Trailing monitoring.`,
              "info",
              pos.botId,
              bot.name
            );
          }
        } else {
          shouldCloseTrade = true;
          closeReason = "tp";
        }
      }

      if (pos.trailingTpActive) {
        // For Short, we triggers close when price bounces back up from min observed price
        const currentMin = pos.minPriceSeen ?? pos.entryPrice;
        const trailingBounceThreshold = currentMin * (1 + trailingTpOffset / 100);
        if (currentPrice >= trailingBounceThreshold) {
          shouldCloseTrade = true;
          closeReason = "trailing_tp";
        }
      }
    }

    // ----------------------------------------------------
    // CHECK STOP LOSS (SL)
    // ----------------------------------------------------
    if (!shouldCloseTrade && pos.slTriggerPrice && pos.slTriggerPrice > 0) {
      if (pos.type === "long") {
        if (currentPrice <= pos.slTriggerPrice) {
          shouldCloseTrade = true;
          closeReason = "sl";
        }
      } else { // Short direction
        if (currentPrice >= pos.slTriggerPrice) {
          shouldCloseTrade = true;
          closeReason = "sl";
        }
      }
    }

    // Execute Trade Exit Case
    if (shouldCloseTrade) {
      pos.status = "closed";
      pos.closedAt = new Date().toISOString();
      pos.closeReason = closeReason;

      // Settle Virtual Balances
      const returnUsdt = pos.totalInvested + pos.pnl;
      const matchedExchange = pos.exchange || "binance";

      const nextBal = { ...userBalances };
      if (!nextBal[matchedExchange]) nextBal[matchedExchange] = { USDT: 0 };
      nextBal[matchedExchange].USDT = parseFloat((nextBal[matchedExchange].USDT + returnUsdt).toFixed(2));
      onBalancesUpdated(nextBal);
      await dbService.updateUserProfile(userId, { 
        balances: nextBal,
        spotBalances: nextBal,
        futuresBalances: nextBal
      });

      // Save database entry
      await dbService.savePosition(pos);
      nextPositions.splice(i, 1); // remove from active loop
      i--; // adjust count index
      listsUpdated = true;

      // Log Event
      const finalRoy = pos.pnlPercent.toFixed(2);
      const isProfit = pos.pnl >= 0;
      const logMessage = isProfit
        ? `🟢 [POSITION CLOSED - TAKE PROFIT] Bot "${bot.name}" closed ${pos.pair} @ $${currentPrice} (${isProfit ? "+" : ""}${finalRoy}% ROI). Settle balance +$${returnUsdt.toFixed(2)} USDT`
        : `🔴 [POSITION CLOSED - STOP LOSS] Bot "${bot.name}" executed exit trigger for ${pos.pair} @ $${currentPrice} (${finalRoy}% ROI). Settle balance +$${returnUsdt.toFixed(2)} USDT`;

      await dbService.addLog(userId, logMessage, isProfit ? "tp_fill" : "sl_fill", pos.botId, bot.name);
      continue;
    }

    // ----------------------------------------------------
    // CHECK DCA SAFETY ORDERS (ONLY FOR DCA TYPE BOTS)
    // ----------------------------------------------------
    if (bot.type === "dca" && bot.priceDeviation && bot.maxSafetyOrders && bot.safetyOrderSize) {
      const requiredDeviation = bot.priceDeviation * (pos.safetyOrdersCount + 1);
      let isSafetyTriggered = false;

      if (pos.type === "long") {
        const priceDropPct = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        if (priceDropPct >= requiredDeviation && pos.safetyOrdersCount < bot.maxSafetyOrders) {
          isSafetyTriggered = true;
        }
      } else { // short direction
        const priceRisePct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        if (priceRisePct >= requiredDeviation && pos.safetyOrdersCount < bot.maxSafetyOrders) {
          isSafetyTriggered = true;
        }
      }

      // Check if price fell/rose enough to trigger safety order scale-in
      if (isSafetyTriggered) {
        // Trigger Safety scale-in with proper margin allocation
        const safetySize = bot.safetyOrderSize || 100;
        const leverage = pos.leverage || 1;
        const marginNeeded = parseFloat((safetySize / leverage).toFixed(2));
        const matchedExchange = pos.exchange || "binance";

        // Check if available balance supports locking the required margin
        const currentUsdt = userBalances[matchedExchange]?.USDT || 0;
        if (currentUsdt >= marginNeeded) {
          // Subtract only required margin from exchange balance if it requires margin (Futures)
          const nextBal = { ...userBalances };
          nextBal[matchedExchange].USDT = parseFloat((nextBal[matchedExchange].USDT - marginNeeded).toFixed(2));
          onBalancesUpdated(nextBal);
          await dbService.updateUserProfile(userId, { 
            balances: nextBal,
            spotBalances: nextBal,
            futuresBalances: nextBal
          });

          // Accumulate positions
          const addedAmount = safetySize / currentPrice;
          
          pos.safetyOrdersCount += 1;
          pos.totalInvested += safetySize;
          pos.marginLocked = parseFloat(((pos.marginLocked || 0) + marginNeeded).toFixed(2));
          pos.amount += addedAmount;
          // Weighted entry price modification (averaging down)
          pos.entryPrice = parseFloat((pos.totalInvested / pos.amount).toFixed(4));
          
          // Re-calculate target take profit threshold price from new scaled entry!
          const targetMargin = bot.takeProfitPercent;
          if (pos.type === "long") {
            pos.tpTriggerPrice = parseFloat((pos.entryPrice * (1 + targetMargin / 100)).toFixed(4));
            if (bot.stopLossPercent) {
              const slDistance = pos.entryPrice * (bot.stopLossPercent / 100);
              pos.slTriggerPrice = parseFloat((pos.entryPrice - slDistance).toFixed(4));
            }
          } else { // short position
            pos.tpTriggerPrice = parseFloat((pos.entryPrice * (1 - targetMargin / 100)).toFixed(4));
            if (bot.stopLossPercent) {
               const slDistance = pos.entryPrice * (bot.stopLossPercent / 100);
              pos.slTriggerPrice = parseFloat((pos.entryPrice + slDistance).toFixed(4));
            }
          }

          await dbService.savePosition(pos);
          listsUpdated = true;

          await dbService.addLog(
            userId,
            `🛡️ [DCA SAFETY ORDER FILLED] Bot "${bot.name}" scaled-in safety order #${pos.safetyOrdersCount} for ${pos.pair} (${pos.type.toUpperCase()}) @ $${currentPrice}. Nominal: +$${safetySize} USDT, Locked Margin: +$${marginNeeded} USDT (${leverage}x). New Weighted Avg Entry: $${pos.entryPrice}. Total Position Value: $${(pos.entryPrice * pos.amount * leverage).toFixed(2)}`,
            "dca_fill",
            pos.botId,
            bot.name
          );
        } else {
          // Insufficient funds for DCA
          await dbService.addLog(
            userId,
            `⚠️ [DCA FAILURE] Bot "${bot.name}" failed to fill safety order #${pos.safetyOrdersCount + 1} due to insufficient exchange USDT balance. Required Margin: ${marginNeeded} USDT, Available: ${currentUsdt.toFixed(2)} USDT`,
            "error",
            pos.botId,
            bot.name
          );
        }
      }
    }

    // Save state update periodically if there is significant price modification
    if (Math.abs(pos.currentPrice - positions[i].currentPrice) > pos.entryPrice * 0.0002) {
      await dbService.savePosition(pos);
      nextPositions[i] = pos;
      listsUpdated = true;
    }
  }

  if (listsUpdated) {
    onPositionsUpdated(nextPositions);
  }
}
