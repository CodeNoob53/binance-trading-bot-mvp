import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from './logger.js';
import { currentMode } from './modes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Створюємо директорію для бази даних, якщо вона не існує
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  logger.info('Created data directory');
}

const dbPath = path.join(dataDir, `bot_${currentMode()}.db`);
logger.info(`Using database: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Error opening database:', err);
    process.exit(1);
  }
  logger.info('Connected to the SQLite database.');
});

// Promisify методи для async/await
const runAsync = promisify(db.run).bind(db);
const getAsync = promisify(db.get).bind(db);
const allAsync = promisify(db.all).bind(db);

// Розширена схема для ML та аналітики
const initSchema = async () => {
  try {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        mode TEXT NOT NULL,
        buyPrice REAL NOT NULL,
        buyQuantity REAL NOT NULL,
        buyOrderId TEXT NOT NULL,
        tpOrderId TEXT,
        slOrderId TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        entryTime INTEGER NOT NULL,
        exitTime INTEGER,
        sellPrice REAL,
        profitLoss REAL,
        maxPrice REAL,
        minPrice REAL,
        holdTime INTEGER,
        volume24h REAL,
        priceChange24h REAL,
        entryHourOfDay INTEGER,
        entryDayOfWeek INTEGER,
        entryMonth INTEGER,
        isNewListing BOOLEAN DEFAULT FALSE,
        initialPrice REAL,
        maxPriceAfterListing REAL,
        minPriceAfterListing REAL,
        category TEXT,
        buyCommission REAL,
        sellCommission REAL
      );
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS listing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        listingTime INTEGER NOT NULL,
        initialPrice REAL,
        price1h REAL,
        price24h REAL,
        price48h REAL,
        maxPrice48h REAL,
        minPrice48h REAL,
        volume48h REAL,
        category TEXT
      );
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS simulation_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        runId TEXT NOT NULL UNIQUE,
        timestamp INTEGER NOT NULL,
        parameters TEXT,
        totalTrades INTEGER,
        winningTrades INTEGER,
        losingTrades INTEGER,
        totalProfit REAL,
        maxDrawdown REAL,
        sharpeRatio REAL,
        winRate REAL,
        avgProfit REAL,
        avgLoss REAL,
        bestTrade TEXT,
        worstTrade TEXT
      );
    `);
    
    // Нова таблиця для збереження Klines
    await runAsync(`
      CREATE TABLE IF NOT EXISTS klines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        interval TEXT NOT NULL,
        openTime INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        closeTime INTEGER NOT NULL,
        quoteAssetVolume REAL NOT NULL,
        numberOfTrades INTEGER NOT NULL,
        takerBuyBaseAssetVolume REAL NOT NULL,
        takerBuyQuoteAssetVolume REAL NOT NULL,
        UNIQUE(symbol, interval, openTime)
      );
    `);

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Error initializing database schema:', error);
    throw error;
  }
};

// Функції для роботи з Klines
export const saveKline = async (klineData) => {
  const { symbol, interval, openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume } = klineData;
  const sql = `
    INSERT OR IGNORE INTO klines (symbol, interval, openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await runAsync(sql, [symbol, interval, openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume]);
};

export const getKlines = async (symbol, interval, startTime, endTime) => {
  return await allAsync(
    'SELECT * FROM klines WHERE symbol = ? AND interval = ? AND openTime BETWEEN ? AND ? ORDER BY openTime ASC',
    [symbol, interval, startTime, endTime]
  );
};

// Ініціалізація схеми при запуску
initSchema().catch(err => {
  logger.error('Failed to initialize database schema:', err);
  process.exit(1);
});

// Експортуємо всі необхідні методи
export {
  runAsync as run,
  getAsync as get,
  allAsync as all,
  initSchema
};

export default db;