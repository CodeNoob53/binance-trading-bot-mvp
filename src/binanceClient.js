import { Spot } from '@binance/connector';
import { config } from './config.js';
import { isSimulation, currentMode } from './modes.js';
import logger from './logger.js';

let client = null;

/**
 * Ініціалізує клієнт Binance API
 * @returns {Promise<Spot>} Клієнт Binance API
 */
export const initializeBinanceClient = async () => {
  if (client) {
    return client;
  }

  const mode = currentMode();
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('API keys are not set in environment variables');
  }

  // Створюємо клієнт з відповідними налаштуваннями
  client = new Spot(apiKey, apiSecret, {
    baseURL: mode === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com'
  });

  logger.info(`Binance client initialized in ${mode} mode`);
  return client;
};

// Mock дані для симуляції
const mockData = {
  exchangeInfo: {
    symbols: [
      { symbol: 'BTCUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.01'}] },
      { symbol: 'ETHUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.01'}] },
      { symbol: 'BNBUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.01'}] },
      { symbol: 'SOLUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.01'}] },
      { symbol: 'XRPUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.0001'}] },
      { symbol: 'PIXELUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.00001'}] },
      { symbol: 'PORTALUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.0001'}] },
      { symbol: 'ACEUSDT', status: 'TRADING', quoteAsset: 'USDT', filters: [{filterType: 'PRICE_FILTER', tickSize: '0.001'}] },
      // Додайте більше символів
    ]
  },
  balance: { USDT: { available: '10000' } },
  klines: (symbol, interval, startTime, endTime, limit) => {
    logger.warn(`Mock Klines called for ${symbol}, interval ${interval}. This is a simulation.`);
    // Повертаємо пустий масив або заглушку для mock-режиму,
    // бо завантаження реальних Klines не має відбуватися в симуляції через binanceClient
    // АБО: якщо ви хочете тестувати download-historical у симуляції,
    // то тут має бути логіка, яка генерує "мокових" Klines.
    // Наразі для download-historical ми очікуємо реальне підключення до Binance.
    return []; 
  }
};

let exchangeInfoCache = null;
let cacheTimestamp = 0;

/**
 * Отримує інформацію про всі доступні торгові пари
 * @returns {Promise<Array>} Масив об'єктів з інформацією про торгові пари
 */
export const getExchangeInfo = async () => {
  const client = await initializeBinanceClient();
  const response = await client.exchangeInfo();
  return response.data.symbols;
};

export const getBalance = async (asset = 'USDT') => {
  if (isSimulation()) {
    return parseFloat(mockData.balance[asset]?.available || 0);
  }
  
  const client = await initializeBinanceClient();
  const balances = await client.balance();
  return parseFloat(balances[asset]?.available || 0);
};

/**
 * Отримує історичні дані (свічки) для вказаної торгової пари
 * @param {string} symbol - Торгова пара (наприклад, 'BTCUSDT')
 * @param {string} interval - Інтервал свічок (наприклад, '1m', '5m', '1h')
 * @param {number} startTime - Початковий час в мілісекундах
 * @param {number} endTime - Кінцевий час в мілісекундах
 * @param {number} limit - Максимальна кількість свічок (макс. 1000)
 * @returns {Promise<Array>} Масив свічок
 */
export const getKlines = async (symbol, interval, startTime, endTime, limit = 1000) => {
  const client = await initializeBinanceClient();
  const response = await client.klines(symbol, interval, {
    startTime,
    endTime,
    limit
  });
  return response.data;
};

// Активні угоди в пам'яті
const activeTrades = new Map();
const cooldowns = new Map();

export const scanForNewListings = async () => {
  try {
    const exchangeInfo = await getExchangeInfo();
    const currentSymbols = exchangeInfo.map(s => s.symbol);
    
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
    if (cooldowns.has(symbol)) {
      logger.info(`⏰ ${symbol} is on cooldown`);
      return;
    }
    if (activeTrades.size >= config.MAX_OPEN_TRADES) {
      logger.warn(`🚫 Max trades limit reached (${activeTrades.size}/${config.MAX_OPEN_TRADES})`);
      return;
    }
    const balance = await getBalance();
    if (balance < config.BUY_AMOUNT_USDT) {
      logger.error(`💰 Insufficient balance: ${balance} USDT`);
      return;
    }
    const liquidity = await client.checkLiquidity(symbol);
    if (liquidity < config.MIN_LIQUIDITY_USDT) {
      logger.warn(`📊 Low liquidity for ${symbol}: ${liquidity.toFixed(2)} USDT`);
      return;
    }
    await executeTrade(symbol);
    cooldowns.set(symbol, true);
    setTimeout(() => cooldowns.delete(symbol), 60 * 60 * 1000); // 1 година
  } catch (error) {
    logger.error(`Failed to handle ${symbol}:`, error.message);
  }
};

const executeTrade = async (symbol) => {
  const price = await client.getPrice(symbol);
  const quantity = (config.BUY_AMOUNT_USDT / price).toFixed(8);
  const buyOrder = await client.marketBuy(symbol, quantity);
  const buyPrice = parseFloat(buyOrder.fills[0].price);
  const executedQty = parseFloat(buyOrder.executedQty);
  logger.info(`✅ Bought ${symbol}: ${executedQty} @ ${buyPrice}`);
  const feeAdjustment = 2 * config.BINANCE_FEE;
  const tpPrice = (buyPrice * (1 + config.TAKE_PROFIT_PERCENT + feeAdjustment)).toFixed(8);
  const slPrice = (buyPrice * (1 - config.STOP_LOSS_PERCENT - feeAdjustment)).toFixed(8);
  const [tpOrder, slOrder] = await Promise.all([
    client.placeLimitSell(symbol, executedQty, tpPrice),
    client.placeStopLoss(symbol, executedQty, slPrice, slPrice)
  ]);
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
        client.getOrderStatus(trade.symbol, trade.tpOrderId),
        client.getOrderStatus(trade.symbol, trade.slOrderId)
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
  const cancelOrderId = type === 'TP' ? trade.slOrderId : trade.tpOrderId;
  await client.cancelOrder(trade.symbol, cancelOrderId);
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

export default {
  initializeBinanceClient,
  getExchangeInfo,
  getKlines
};