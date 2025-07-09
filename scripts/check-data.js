// scripts/check-data.js
import * as db from '../src/database.js';
import logger from '../src/logger.js';

async function checkData() {
  try {
    logger.info('🔍 Checking saved historical data...');
    
    // Загальна кількість klines
    const totalKlines = await db.getKlinesCount();
    logger.info(`📊 Total klines saved: ${totalKlines}`);
    
    if (totalKlines === 0) {
      logger.warn('❌ No klines found in database');
      return;
    }
    
    // Список символів з даними
    const symbolsWithData = await db.getSymbolsWithData('1m');
    logger.info(`📈 Symbols with data: ${symbolsWithData.length}`);
    
    // Топ-10 символів за кількістю записів
    const topSymbols = symbolsWithData
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    logger.info('🏆 Top 10 symbols by data count:');
    topSymbols.forEach(item => {
      logger.info(`  ${item.symbol}: ${item.count} klines`);
    });
    
    // Перевірка конкретного символу
    const btcKlines = await db.getKlines('BTCUSDT', '1m', 
      new Date('2024-01-01').getTime(), 
      new Date('2024-01-02').getTime()
    );
    logger.info(`🪙 BTCUSDT sample data for Jan 1, 2024: ${btcKlines.length} klines`);
    
    if (btcKlines.length > 0) {
      const sample = btcKlines[0];
      logger.info(`  Sample kline: Open=${sample.open}, High=${sample.high}, Low=${sample.low}, Close=${sample.close}`);
    }
    
    logger.info('✅ Data check completed!');
    
  } catch (error) {
    logger.error('❌ Error checking data:', error);
  }
}

checkData();