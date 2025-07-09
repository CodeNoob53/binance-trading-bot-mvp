import { config } from './config.js';
import * as db from './database.js';
import * as binance from './binanceClient.js';
import logger from './logger.js';

// Активні угоди в пам'яті
const activeTrades = new Map();
const cooldowns = new Map();

export const scanForNewListings = async () => {
  try {
    const exchangeInfo = await binance.getExchangeInfo();
    const currentSymbols = exchangeInfo.symbols
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => s.symbol);
    
    const knownSymbols = db.getKnownSymbols();
    const newSymbols = currentSymbols.filter(s => !knownSymbols.includes(s));
    
    if (newSymbols.length > 0) {
      logger.info(`🆕 New listings detected: ${newSymbols.join(', ')}`);
      
      for (const symbol of newSymbols) {
        await handleNewListing(symbol);
      }
      
      db.saveKnownSymbols(currentSymbols);
    }
    
  } catch (error) {
    logger.error('Scan error:', error.message);
  }
};

const handleNewListing = async (symbol) => {
  try {
    // Перевірки
    if (cooldowns.has(symbol)) {
      logger.info(`⏰ ${symbol} is on cooldown`);
      return;
    }
    
    if (activeTrades.size >= config.MAX_OPEN_TRADES) {
      logger.warn(`🚫 Max trades limit reached (${activeTrades.size}/${config.MAX_OPEN_TRADES})`);
      return;
    }
    
    const balance = await binance.getBalance();
    if (balance < config.BUY_AMOUNT_USDT) {
      logger.error(`💰 Insufficient balance: ${balance} USDT`);
      return;
    }
    
    // Перевірка ліквідності
    const liquidity = await binance.checkLiquidity(symbol);
    if (liquidity < config.MIN_LIQUIDITY_USDT) {
      logger.warn(`📊 Low liquidity for ${symbol}: ${liquidity.toFixed(2)} USDT`);
      return;
    }
    
    // Виконання угоди
    await executeTrade(symbol);
    
    // Встановлення cooldown
    cooldowns.set(symbol, true);
    setTimeout(() => cooldowns.delete(symbol), 60 * 60 * 1000); // 1 година
    
  } catch (error) {
    logger.error(`Failed to handle ${symbol}:`, error.message);
  }
};

const executeTrade = async (symbol) => {
  const price = await binance.getPrice(symbol);
  const quantity = (config.BUY_AMOUNT_USDT / price).toFixed(8);
  
  // Купівля
  const buyOrder = await binance.marketBuy(symbol, quantity);
  const buyPrice = parseFloat(buyOrder.fills[0].price);
  const executedQty = parseFloat(buyOrder.executedQty);
  
  logger.info(`✅ Bought ${symbol}: ${executedQty} @ ${buyPrice}`);
  
  // Розрахунок TP/SL
  const feeAdjustment = 2 * config.BINANCE_FEE;
  const tpPrice = (buyPrice * (1 + config.TAKE_PROFIT_PERCENT + feeAdjustment)).toFixed(8);
  const slPrice = (buyPrice * (1 - config.STOP_LOSS_PERCENT - feeAdjustment)).toFixed(8);
  
  // Розміщення ордерів
  const [tpOrder, slOrder] = await Promise.all([
    binance.placeLimitSell(symbol, executedQty, tpPrice),
    binance.placeStopLoss(symbol, executedQty, slPrice, slPrice)
  ]);
  
  // Збереження в БД
  const trade = {
    symbol,
    buyPrice,
    buyQuantity: executedQty,
    buyOrderId: buyOrder.orderId,
    tpOrderId: tpOrder.orderId,
    slOrderId: slOrder.orderId
  };
  
  const tradeId = db.saveTrade(trade);
  trade.id = tradeId;
  
  activeTrades.set(tradeId, trade);
  
  logger.info(`🎯 TP: ${tpPrice} | 🛡️ SL: ${slPrice}`);
};

export const monitorActiveTrades = async () => {
  const dbTrades = db.getActiveTrades();
  
  for (const trade of dbTrades) {
    if (!activeTrades.has(trade.id)) {
      activeTrades.set(trade.id, trade);
    }
    
    try {
      const [tpStatus, slStatus] = await Promise.all([
        binance.getOrderStatus(trade.symbol, trade.tpOrderId),
        binance.getOrderStatus(trade.symbol, trade.slOrderId)
      ]);
      
      if (tpStatus?.status === 'FILLED') {
        await handleFilledOrder(trade, 'TP', tpStatus);
      } else if (slStatus?.status === 'FILLED') {
        await handleFilledOrder(trade, 'SL', slStatus);
      }
      
    } catch (error) {
      logger.error(`Monitor error for ${trade.symbol}:`, error.message);
    }
  }
};

const handleFilledOrder = async (trade, type, orderStatus) => {
  const sellPrice = parseFloat(orderStatus.price);
  const profitLoss = ((sellPrice - trade.buyPrice) / trade.buyPrice * 100).toFixed(2);
  
  // Скасування протилежного ордера
  const cancelOrderId = type === 'TP' ? trade.slOrderId : trade.tpOrderId;
  await binance.cancelOrder(trade.symbol, cancelOrderId);
  
  // Оновлення БД
  db.updateTrade(trade.id, {
    status: `FILLED_${type}`,
    exitTime: Date.now(),
    sellPrice,
    profitLoss
  });
  
  activeTrades.delete(trade.id);
  
  const emoji = type === 'TP' ? '🎉' : '🛑';
  logger.info(`${emoji} Trade closed: ${trade.symbol} ${type} | P&L: ${profitLoss}%`);
};