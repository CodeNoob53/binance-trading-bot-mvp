import * as db from '../database.js';
import logger from '../logger.js';
import { config } from '../config.js';

export class HistoricalSimulator {
  constructor(initialBalance = 1000) {
    this.balance = initialBalance;
    this.initialBalance = initialBalance;
    this.trades = [];
    this.activeTrades = new Map();
    this.currentTime = null;
    this.priceHistory = new Map();
  }

  async loadHistoricalData(startDate, endDate) {
    logger.info(`Loading historical data from ${startDate} to ${endDate}`);
    this.listings = await db.getListingHistory(
      new Date(startDate).getTime(),
      new Date(endDate).getTime()
    );
    logger.info(`Loaded ${this.listings.length} historical listings`);
    return this.listings;
  }

  async runSimulation(parameters = config) {
    const runId = `sim_${Date.now()}`;
    logger.info(`Starting simulation run: ${runId}`);
    
    for (const listing of this.listings) {
      this.currentTime = listing.listingTime;
      
      // Симуляція виявлення нового лістингу
      await this.simulateNewListing(listing, parameters);
      
      // Симуляція моніторингу через 1 годину
      this.currentTime = listing.listingTime + 3600000;
      await this.checkTrades(listing.price1h, listing);
      
      // Симуляція моніторингу через 24 години
      this.currentTime = listing.listingTime + 86400000;
      await this.checkTrades(listing.price24h, listing);
      
      // Симуляція моніторингу через 48 годин
      this.currentTime = listing.listingTime + 172800000;
      await this.checkTrades(listing.price48h, listing);
    }
    
    // Закриття всіх відкритих позицій
    await this.closeAllPositions();
    
    // Аналіз результатів
    const results = this.analyzeResults(runId, parameters);
    await db.saveSimulationResult(results);
    
    return results;
  }

  async simulateNewListing(listing, parameters) {
    // Перевірка умов входу
    if (this.activeTrades.size >= parameters.MAX_OPEN_TRADES) {
      logger.debug(`Max trades reached, skipping ${listing.symbol}`);
      return;
    }
    
    if (this.balance < parameters.BUY_AMOUNT_USDT) {
      logger.debug(`Insufficient balance, skipping ${listing.symbol}`);
      return;
    }
    
    // Симуляція купівлі
    const buyPrice = listing.initialPrice;
    const quantity = parameters.BUY_AMOUNT_USDT / buyPrice;
    
    const trade = {
      id: this.trades.length + 1,
      symbol: listing.symbol,
      buyPrice,
      buyQuantity: quantity,
      buyOrderId: `SIM_BUY_${Date.now()}`,
      entryTime: this.currentTime,
      tpPrice: buyPrice * (1 + parameters.TAKE_PROFIT_PERCENT),
      slPrice: buyPrice * (1 - parameters.STOP_LOSS_PERCENT),
      status: 'ACTIVE',
      maxPrice: buyPrice,
      minPrice: buyPrice
    };
    
    this.balance -= parameters.BUY_AMOUNT_USDT;
    this.trades.push(trade);
    this.activeTrades.set(trade.id, trade);
    
    logger.info(`[SIM] Bought ${listing.symbol} at ${buyPrice}`);
  }

  async checkTrades(currentPrice, listing) {
    for (const [id, trade] of this.activeTrades) {
      if (trade.symbol !== listing.symbol) continue;
      
      // Оновлення мін/макс
      trade.maxPrice = Math.max(trade.maxPrice, currentPrice);
      trade.minPrice = Math.min(trade.minPrice, currentPrice);
      
      // Перевірка TP
      if (currentPrice >= trade.tpPrice) {
        await this.closeTrade(trade, currentPrice, 'TP');
      }
      // Перевірка SL
      else if (currentPrice <= trade.slPrice) {
        await this.closeTrade(trade, currentPrice, 'SL');
      }
    }
  }

  async closeTrade(trade, sellPrice, reason) {
    trade.sellPrice = sellPrice;
    trade.exitTime = this.currentTime;
    trade.status = `FILLED_${reason}`;
    trade.profitLoss = ((sellPrice - trade.buyPrice) / trade.buyPrice * 100);
    trade.holdTime = trade.exitTime - trade.entryTime;
    
    this.balance += sellPrice * trade.buyQuantity;
    this.activeTrades.delete(trade.id);
    
    logger.info(`[SIM] Closed ${trade.symbol} at ${sellPrice} (${reason}) | P&L: ${trade.profitLoss.toFixed(2)}%`);
  }

  async closeAllPositions() {
    for (const [id, trade] of this.activeTrades) {
      // Закриття за останньою відомою ціною
      const lastPrice = trade.buyPrice; // В реальності тут була б поточна ціна
      await this.closeTrade(trade, lastPrice, 'FORCE');
    }
  }

  analyzeResults(runId, parameters) {
    const winningTrades = this.trades.filter(t => t.profitLoss > 0);
    const losingTrades = this.trades.filter(t => t.profitLoss <= 0);
    
    const totalProfit = ((this.balance - this.initialBalance) / this.initialBalance * 100);
    
    const profits = this.trades.map(t => t.profitLoss || 0);
    const maxDrawdown = this.calculateMaxDrawdown();
    const sharpeRatio = this.calculateSharpeRatio(profits);
    
    const bestTrade = this.trades.reduce((best, trade) => 
      (!best || trade.profitLoss > best.profitLoss) ? trade : best, null
    );
    
    const worstTrade = this.trades.reduce((worst, trade) => 
      (!worst || trade.profitLoss < worst.profitLoss) ? trade : worst, null
    );
    
    return {
      runId,
      parameters,
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalProfit,
      maxDrawdown,
      sharpeRatio,
      winRate: (winningTrades.length / this.trades.length * 100) || 0,
      avgProfit: winningTrades.length > 0 ? 
        winningTrades.reduce((sum, t) => sum + t.profitLoss, 0) / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ?
        losingTrades.reduce((sum, t) => sum + Math.abs(t.profitLoss), 0) / losingTrades.length : 0,
      bestTrade: bestTrade ? {
        symbol: bestTrade.symbol,
        profit: bestTrade.profitLoss,
        holdTime: bestTrade.holdTime
      } : null,
      worstTrade: worstTrade ? {
        symbol: worstTrade.symbol,
        loss: worstTrade.profitLoss,
        holdTime: worstTrade.holdTime
      } : null
    };
  }

  calculateMaxDrawdown() {
    let peak = this.initialBalance;
    let maxDrawdown = 0;
    let currentBalance = this.initialBalance;
    
    for (const trade of this.trades) {
      if (trade.status.includes('FILLED')) {
        currentBalance += (trade.sellPrice - trade.buyPrice) * trade.buyQuantity;
        if (currentBalance > peak) {
          peak = currentBalance;
        }
        const drawdown = ((peak - currentBalance) / peak * 100);
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }
    
    return maxDrawdown;
  }

  calculateSharpeRatio(returns) {
    if (returns.length === 0) return 0;
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? (avgReturn / stdDev) : 0;
  }
}