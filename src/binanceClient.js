import { Spot } from '@binance/connector';
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

// Binance API helper methods
export const checkLiquidity = async (symbol) => {
  const client = await initializeBinanceClient();
  return client.checkLiquidity(symbol);
};

export const getPrice = async (symbol) => {
  const client = await initializeBinanceClient();
  const data = await client.getPrice(symbol);
  return parseFloat(data.price ?? data?.data?.price);
};

export const marketBuy = async (symbol, quantity) => {
  const client = await initializeBinanceClient();
  return client.marketBuy(symbol, quantity);
};

export const placeLimitSell = async (symbol, quantity, price) => {
  const client = await initializeBinanceClient();
  return client.placeLimitSell(symbol, quantity, price);
};

export const placeStopLoss = async (symbol, quantity, stopPrice, limitPrice) => {
  const client = await initializeBinanceClient();
  return client.placeStopLoss(symbol, quantity, stopPrice, limitPrice);
};

export const getOrderStatus = async (symbol, orderId) => {
  const client = await initializeBinanceClient();
  return client.getOrderStatus(symbol, orderId);
};

export const cancelOrder = async (symbol, orderId) => {
  const client = await initializeBinanceClient();
  return client.cancelOrder(symbol, orderId);
};

export default {
  initializeBinanceClient,
  getExchangeInfo,
  getBalance,
  getKlines,
  checkLiquidity,
  getPrice,
  marketBuy,
  placeLimitSell,
  placeStopLoss,
  getOrderStatus,
  cancelOrder};