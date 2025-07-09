import { HistoricalSimulator } from '../src/simulation/historicalSimulator.js';
import { config } from '../src/config.js';
import logger from '../src/logger.js';

async function runSimulations() {
  logger.info('🚀 Starting simulation runs...');
  
  // Різні комбінації параметрів для тестування
  const parameterSets = [
    // Консервативна
    { ...config, TAKE_PROFIT_PERCENT: 0.20, STOP_LOSS_PERCENT: 0.15, BUY_AMOUNT_USDT: 20 },
    
    // Збалансована
    { ...config, TAKE_PROFIT_PERCENT: 0.30, STOP_LOSS_PERCENT: 0.12, BUY_AMOUNT_USDT: 30 },
    
    // Агресивна
    { ...config, TAKE_PROFIT_PERCENT: 0.40, STOP_LOSS_PERCENT: 0.10, BUY_AMOUNT_USDT: 50 },
    
    // Дуже агресивна
    { ...config, TAKE_PROFIT_PERCENT: 0.50, STOP_LOSS_PERCENT: 0.08, BUY_AMOUNT_USDT: 50 },
  ];
  
  const results = [];
  
  for (const params of parameterSets) {
    const simulator = new HistoricalSimulator(1000);
    await simulator.loadHistoricalData('2024-01-01', '2024-06-30');
    
    const result = await simulator.runSimulation(params);
    results.push(result);
    
    logger.info(`\n📊 Simulation Result:`);
    logger.info(`TP: ${(params.TAKE_PROFIT_PERCENT * 100)}% | SL: ${(params.STOP_LOSS_PERCENT * 100)}%`);
    logger.info(`Total Profit: ${result.totalProfit.toFixed(2)}%`);
    logger.info(`Win Rate: ${result.winRate.toFixed(2)}%`);
    logger.info(`Total Trades: ${result.totalTrades}`);
    logger.info(`Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`);
  }
  
  // Вибір найкращих параметрів
  const bestResult = results.reduce((best, current) => 
    current.totalProfit > best.totalProfit ? current : best
  );
  
  logger.info(`\n🏆 Best parameters:`);
  logger.info(`TP: ${(bestResult.parameters.TAKE_PROFIT_PERCENT * 100)}%`);
  logger.info(`SL: ${(bestResult.parameters.STOP_LOSS_PERCENT * 100)}%`);
  logger.info(`Expected profit: ${bestResult.totalProfit.toFixed(2)}%`);
}

runSimulations().catch(console.error);