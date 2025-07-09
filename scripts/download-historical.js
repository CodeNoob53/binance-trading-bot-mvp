
// scripts/download-historical.js
import * as binance from '../src/binanceClient.js';
import * as db from '../src/database.js';
import logger from '../src/logger.js';
import { config } from '../src/config.js';
import { isSimulation, currentMode } from '../src/modes.js';
import { initializeBinanceClient } from '../src/binanceClient.js';
import { sleep } from '../src/utils.js';

const KLINE_INTERVAL = '1m'; // Таймфрейм свічок (наприклад, 1 хвилина)
const MAX_KLINES_PER_REQUEST = 1000; // Максимальна кількість свічок за один запит до Binance API

// Конфігурація для завантаження історичних даних
const downloadConfig = {
  startDate: new Date('2025-03-01'),
  endDate: new Date('2025-06-16'),
  intervals: ['1m', '5m', '15m', '1h', '4h', '1d'],
  batchSize: 1000, // Кількість запитів в одному батчі
  delayBetweenBatches: 1000, // Затримка між батчами в мс
  delayBetweenRequests: 50, // Затримка між запитами в мс
};

// Перевірки при старті
async function performStartupChecks() {
  logger.info('🚀 Starting historical data download in ' + currentMode() + ' mode...');

  // Перевірка режиму
  if (isSimulation()) {
    logger.warn('⚠️ Running in simulation mode. This script should be run in testnet or production mode to download real data.');
    logger.warn('To download real data, run: yarn download-historical:testnet or yarn download-historical:production');
    process.exit(1);
  }

  logger.info('Checking configuration...');
  
  // Перевірка режиму
  const mode = currentMode();
  if (!mode) {
    throw new Error('Bot mode is not set');
  }
  logger.info(`✅ Bot mode: ${mode}`);

  // Перевірка дат
  logger.info('Checking date configuration...');
  if (downloadConfig.startDate >= downloadConfig.endDate) {
    throw new Error('Start date must be before end date');
  }
  if (downloadConfig.endDate > new Date()) {
    throw new Error('End date cannot be in the future');
  }
  logger.info(`✅ Date range check passed: ${downloadConfig.startDate.toISOString()} to ${downloadConfig.endDate.toISOString()}`);

  // Перевірка підключення до бази даних
  logger.info('Checking database connection...');
  try {
    // Використовуємо правильну назву функції з експорту database.js
    await db.get('SELECT 1');
    logger.info('✅ Database connection check passed');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }

  // Перевірка підключення до Binance
  logger.info('Checking Binance connection...');
  try {
    const client = await initializeBinanceClient();
    // Використовуємо метод ping() для перевірки з'єднання
    const response = await client.ping();
    logger.info('✅ Binance connection check passed');
  } catch (error) {
    logger.error('❌ Binance connection failed:', error);
    throw error;
  }

  logger.info('✅ All startup checks completed successfully!');
}

// Функція для отримання всіх Klines для символу та інтервалу за період
async function fetchAllKlines(symbol, interval, startTime, endTime) {
  logger.info(`Fetching ${interval} klines for ${symbol} from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
  let allKlines = [];
  let currentStartTime = startTime;

  while (currentStartTime < endTime) {
    try {
      // Binance API повертає Klines за вказаний діапазон, до MAX_KLINES_PER_REQUEST.
      // Ми додаємо 1 до MAX_KLINES_PER_REQUEST, щоб отримати наступну свічку для нового startTime
      const klines = await binance.getKlines(symbol, interval, currentStartTime, endTime, MAX_KLINES_PER_REQUEST);

      if (!klines || klines.length === 0) {
        logger.info(`No more klines found for ${symbol} at ${new Date(currentStartTime).toISOString()}.`);
        break;
      }

      // Додаємо свічки, окрім останньої, якщо вона буде використана як початок наступного запиту
      // Це потрібно, щоб уникнути дублювання, якщо поточний запит повернув повну кількість свічок
      const klinesToProcess = klines.length === MAX_KLINES_PER_REQUEST ? klines.slice(0, -1) : klines;
      allKlines.push(...klinesToProcess);

      // Оновлюємо currentStartTime на OpenTime останньої отриманої свічки + 1 мілісекунда
      // Або на CloseTime останньої свічки + 1 мілісекунда, щоб уникнути дублювання
      // klines[klines.length - 1][6] - це closeTime останньої свічки
      currentStartTime = klines[klines.length - 1][6] + 1;
      logger.info(`Fetched ${klines.length} klines for ${symbol}. Next start: ${new Date(currentStartTime).toISOString()}`);

      // Затримка, щоб уникнути обмежень Rate Limit Binance API
      await sleep(200); // 200мс затримки між запитами
    } catch (error) {
      logger.error(`Error fetching klines for ${symbol} from ${new Date(currentStartTime).toISOString()}: ${error.message}`);
      break; // Припиняємо завантаження для цього символу у випадку помилки
    }
  }
  return allKlines;
}

// Головна функція завантаження історичних даних
async function downloadHistoricalData() {
  try {
    await performStartupChecks();
    
    logger.info('Starting historical data download...');
    
    // Використовуємо дати з конфігурації або значення за замовчуванням
    const startDate = config.SIMULATION_START_DATE ? 
      new Date(config.SIMULATION_START_DATE).getTime() : 
      downloadConfig.startDate.getTime();
    const endDate = config.SIMULATION_END_DATE ? 
      new Date(config.SIMULATION_END_DATE).getTime() : 
      downloadConfig.endDate.getTime();

    logger.info(`Download period: ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`);

    const exchangeInfo = await binance.getExchangeInfo();
    const usdtSymbols = exchangeInfo
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => s.symbol);

    logger.info(`Found ${usdtSymbols.length} USDT trading pairs.`);

    let totalKlinesDownloaded = 0;
    let totalSymbolsProcessed = 0;
    let successfulSymbols = 0;

    for (const symbol of usdtSymbols) {
      try {
        totalSymbolsProcessed++;
        logger.info(`Processing ${symbol} (${totalSymbolsProcessed}/${usdtSymbols.length})...`);

        const klines = await fetchAllKlines(symbol, KLINE_INTERVAL, startDate, endDate);

        if (klines.length > 0) {
          logger.info(`Saving ${klines.length} ${KLINE_INTERVAL} klines for ${symbol} to database...`);
          for (const kline of klines) {
            await db.saveKline({
              symbol: symbol,
              interval: KLINE_INTERVAL,
              openTime: kline[0],
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5]),
              closeTime: kline[6],
              quoteAssetVolume: parseFloat(kline[7]),
              numberOfTrades: kline[8],
              takerBuyBaseAssetVolume: parseFloat(kline[9]),
              takerBuyQuoteAssetVolume: parseFloat(kline[10])
            });
          }
          totalKlinesDownloaded += klines.length;
          successfulSymbols++;
          logger.info(`✅ Finished saving klines for ${symbol}. Total klines: ${klines.length}`);
        } else {
          logger.warn(`⚠️ No ${KLINE_INTERVAL} klines found for ${symbol} in the specified period.`);
        }

        // Додаємо затримку між символами для уникнення rate limit
        if (totalSymbolsProcessed % 10 === 0) {
          logger.info(`Processed ${totalSymbolsProcessed} symbols, taking a break...`);
          await sleep(2000); // 2 секунди перерви кожні 10 символів
        }

      } catch (error) {
        logger.error(`❌ Error processing ${symbol}:`, error.message);
        // Продовжуємо з наступним символом
        continue;
      }
    }

    logger.info('\n📊 Download Summary:');
    logger.info(`Total symbols processed: ${totalSymbolsProcessed}/${usdtSymbols.length}`);
    logger.info(`Successful symbols: ${successfulSymbols}`);
    logger.info(`Total klines downloaded: ${totalKlinesDownloaded}`);
    logger.info('✅ Historical data download process finished successfully!');
  } catch (error) {
    logger.error('❌ Failed to download historical data:', error);
    process.exit(1);
  }
}

// Запускаємо головну функцію
downloadHistoricalData().catch(error => {
  logger.error('Unhandled error in historical data download script:', error);
  process.exit(1);
});