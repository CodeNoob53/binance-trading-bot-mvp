import { config } from './config.js';
import { currentMode, isSimulation } from './modes.js';
import * as bot from './tradingBot.js';
import { HistoricalSimulator } from './simulation/historicalSimulator.js';
import logger from './logger.js';
import * as binance from './binanceClient.js';
import * as db from './database.js';
import { startBot } from './bot.js';

// Глобальна обробка помилок
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

async function performStartupChecks() {
  logger.info('🚀 Starting bot in ' + currentMode() + ' mode...');
  
  // Перевірка конфігурації
  logger.info('Checking configuration...');
  if (!config.BINANCE_API_KEY || !config.BINANCE_API_SECRET) {
    if (!isSimulation()) {
      logger.error('❌ API keys are missing! Please check your .env file.');
      process.exit(1);
    } else {
      logger.warn('⚠️ API keys are missing, but running in simulation mode - this is OK.');
    }
  } else {
    logger.info('✅ Configuration check passed.');
  }

  // Перевірка підключення до бази даних
  logger.info('Checking database connection...');
  try {
    await db.initSchema();
    logger.info('✅ Database connection and schema initialization successful.');
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    process.exit(1);
  }

  // Перевірка підключення до Binance API
  if (!isSimulation()) {
    logger.info('Checking Binance API connection...');
    try {
      const exchangeInfo = await binance.getExchangeInfo();
      logger.info(`✅ Successfully connected to Binance API. Found ${exchangeInfo.symbols.length} trading pairs.`);
      
      // Перевірка балансу
      logger.info('Checking account balance...');
      const balance = await binance.getBalance();
      logger.info(`✅ Account balance retrieved. USDT available: ${balance.available}`);
    } catch (error) {
      logger.error('❌ Failed to connect to Binance API:', error);
      process.exit(1);
    }
  } else {
    logger.info('⚠️ Running in simulation mode - skipping Binance API checks.');
  }

  // Перевірка наявності історичних даних для симуляції
  if (isSimulation()) {
    logger.info('Checking historical data for simulation...');
    try {
      const startDate = new Date(config.SIMULATION_START_DATE).getTime();
      const endDate = new Date(config.SIMULATION_END_DATE).getTime();
      
      if (isNaN(startDate) || isNaN(endDate)) {
        throw new Error('Invalid SIMULATION_START_DATE or SIMULATION_END_DATE in config');
      }

      // Перевіряємо наявність даних для кількох основних пар
      const testSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
      for (const symbol of testSymbols) {
        const klines = await db.getKlines(symbol, '1m', startDate, endDate);
        if (klines.length === 0) {
          logger.warn(`⚠️ No historical data found for ${symbol}. You may need to run 'yarn download-historical' first.`);
        } else {
          logger.info(`✅ Found ${klines.length} historical klines for ${symbol}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error checking historical data:', error);
      process.exit(1);
    }
  }

  logger.info('✅ All startup checks completed successfully!');
}

// Головна функція
async function main() {
  try {
    await performStartupChecks();
    logger.info('Starting trading bot...');
    await startBot();
  } catch (error) {
    logger.error('Fatal error during bot startup:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down...');
  process.exit(0);
});

// Запуск
main().catch(error => {
  logger.error('Unhandled error in main process:', error);
  process.exit(1);
});