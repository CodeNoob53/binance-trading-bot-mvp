import * as db from '../database.js';
import logger from '../logger.js';

export class PerformanceAnalyzer {
  async analyzeAllModes() {
    const modes = ['simulation', 'testnet', 'production'];
    const analysis = {};
    
    for (const mode of modes) {
      const trades = await db.allAsync(
        'SELECT * FROM trades WHERE mode = ? ORDER BY entryTime',
        [mode]
      );
      
      if (trades.length === 0) continue;
      
      analysis[mode] = this.analyzeTrades(trades);
    }
    
    return analysis;
  }
  
  analyzeTrades(trades) {
    const completed = trades.filter(t => t.status !== 'ACTIVE');
    const winners = completed.filter(t => t.profitLoss > 0);
    const losers = completed.filter(t => t.profitLoss <= 0);
    
    // Аналіз по символах
    const symbolStats = {};
    for (const trade of completed) {
      if (!symbolStats[trade.symbol]) {
        symbolStats[trade.symbol] = {
          trades: 0,
          wins: 0,
          totalProfit: 0,
          avgHoldTime: 0
        };
      }
      
      const stats = symbolStats[trade.symbol];
      stats.trades++;
      if (trade.profitLoss > 0) stats.wins++;
      stats.totalProfit += trade.profitLoss || 0;
      stats.avgHoldTime += trade.holdTime || 0;
    }
    
    // Фіналізація статистики по символах
    Object.keys(symbolStats).forEach(symbol => {
      const stats = symbolStats[symbol];
      stats.winRate = (stats.wins / stats.trades * 100);
      stats.avgHoldTime = stats.avgHoldTime / stats.trades / 1000 / 60; // хвилини
    });
    
    // Пошук патернів
    const patterns = this.findPatterns(completed);
    
    return {
      totalTrades: trades.length,
      completedTrades: completed.length,
      activeTrades: trades.length - completed.length,
      winRate: (winners.length / completed.length * 100) || 0,
      avgProfit: winners.length > 0 ?
        winners.reduce((sum, t) => sum + t.profitLoss, 0) / winners.length : 0,
      avgLoss: losers.length > 0 ?
        losers.reduce((sum, t) => sum + Math.abs(t.profitLoss), 0) / losers.length : 0,
      profitFactor: this.calculateProfitFactor(winners, losers),
      symbolStats,
      patterns,
      recommendations: this.generateRecommendations(symbolStats, patterns)
    };
  }
  
  calculateProfitFactor(winners, losers) {
    const totalProfit = winners.reduce((sum, t) => sum + t.profitLoss, 0);
const totalLoss = losers.reduce((sum, t) => sum + Math.abs(t.profitLoss), 0);
   return totalLoss > 0 ? (totalProfit / totalLoss) : totalProfit;
 }
 
 findPatterns(trades) {
   const patterns = {
     bestTimeToTrade: null,
     bestCategory: null,
     optimalHoldTime: null,
     highVolumeBetter: false
   };
   
   // Аналіз по годинах
   const hourStats = {};
   trades.forEach(trade => {
     const hour = new Date(trade.entryTime).getHours();
     if (!hourStats[hour]) {
       hourStats[hour] = { trades: 0, profit: 0 };
     }
     hourStats[hour].trades++;
     hourStats[hour].profit += trade.profitLoss || 0;
   });
   
   // Знайти найкращу годину
   let bestHour = null;
   let bestHourProfit = -Infinity;
   Object.entries(hourStats).forEach(([hour, stats]) => {
     const avgProfit = stats.profit / stats.trades;
     if (avgProfit > bestHourProfit) {
       bestHourProfit = avgProfit;
       bestHour = parseInt(hour);
     }
   });
   patterns.bestTimeToTrade = bestHour;
   
   // Аналіз по категоріях (якщо є дані)
   const categoryStats = {};
   trades.forEach(trade => {
     if (trade.notes) {
       try {
         const notes = JSON.parse(trade.notes);
         if (notes.category) {
           if (!categoryStats[notes.category]) {
             categoryStats[notes.category] = { trades: 0, profit: 0 };
           }
           categoryStats[notes.category].trades++;
           categoryStats[notes.category].profit += trade.profitLoss || 0;
         }
       } catch (e) {}
     }
   });
   
   if (Object.keys(categoryStats).length > 0) {
     patterns.bestCategory = Object.entries(categoryStats)
       .sort((a, b) => (b[1].profit / b[1].trades) - (a[1].profit / a[1].trades))[0]?.[0];
   }
   
   // Оптимальний час утримання
   const profitableTradesWithTime = trades.filter(t => t.profitLoss > 0 && t.holdTime);
   if (profitableTradesWithTime.length > 0) {
     patterns.optimalHoldTime = profitableTradesWithTime
       .reduce((sum, t) => sum + t.holdTime, 0) / profitableTradesWithTime.length / 1000 / 60;
   }
   
   // Кореляція з об'ємом
   const highVolumeTrades = trades.filter(t => t.volume24h > 100000000);
   const lowVolumeTrades = trades.filter(t => t.volume24h <= 100000000);
   if (highVolumeTrades.length > 0 && lowVolumeTrades.length > 0) {
     const highVolumeWinRate = highVolumeTrades.filter(t => t.profitLoss > 0).length / highVolumeTrades.length;
     const lowVolumeWinRate = lowVolumeTrades.filter(t => t.profitLoss > 0).length / lowVolumeTrades.length;
     patterns.highVolumeBetter = highVolumeWinRate > lowVolumeWinRate;
   }
   
   return patterns;
 }
 
 generateRecommendations(symbolStats, patterns) {
   const recommendations = [];
   
   // Рекомендації по часу торгівлі
   if (patterns.bestTimeToTrade !== null) {
     recommendations.push(`Найкращий час для торгівлі: ${patterns.bestTimeToTrade}:00 - ${patterns.bestTimeToTrade + 1}:00`);
   }
   
   // Рекомендації по категоріях
   if (patterns.bestCategory) {
     recommendations.push(`Фокусуйтесь на категорії: ${patterns.bestCategory}`);
   }
   
   // Рекомендації по часу утримання
   if (patterns.optimalHoldTime) {
     recommendations.push(`Оптимальний час утримання: ${patterns.optimalHoldTime.toFixed(0)} хвилин`);
   }
   
   // Рекомендації по об'єму
   if (patterns.highVolumeBetter) {
     recommendations.push("Торгуйте монетами з високим об'ємом (>$100M за 24г)");
   }
   
   // Рекомендації по символах
   const topSymbols = Object.entries(symbolStats)
     .filter(([_, stats]) => stats.trades >= 3)
     .sort((a, b) => b[1].winRate - a[1].winRate)
     .slice(0, 3);
   
   if (topSymbols.length > 0) {
     recommendations.push(`Топ символи: ${topSymbols.map(([s, stats]) => 
       `${s} (${stats.winRate.toFixed(0)}% win rate)`).join(', ')}`);
   }
   
   return recommendations;
 }
 
 async generateReport() {
   const analysis = await this.analyzeAllModes();
   
   console.log('\n📊 PERFORMANCE ANALYSIS REPORT');
   console.log('=' .repeat(50));
   
   for (const [mode, stats] of Object.entries(analysis)) {
     console.log(`\n📈 ${mode.toUpperCase()} MODE:`);
     console.log(`Total Trades: ${stats.totalTrades}`);
     console.log(`Win Rate: ${stats.winRate.toFixed(2)}%`);
     console.log(`Average Profit: ${stats.avgProfit.toFixed(2)}%`);
     console.log(`Average Loss: ${stats.avgLoss.toFixed(2)}%`);
     console.log(`Profit Factor: ${stats.profitFactor.toFixed(2)}`);
     
     if (stats.patterns.bestTimeToTrade !== null) {
       console.log(`Best Trading Hour: ${stats.patterns.bestTimeToTrade}:00`);
     }
     
     console.log('\n💡 Recommendations:');
     stats.recommendations.forEach(rec => console.log(`  • ${rec}`));
   }
   
   return analysis;
 }
}

// Запуск аналізу якщо файл виконується напряму
if (import.meta.url === `file://${process.argv[1]}`) {
 const analyzer = new PerformanceAnalyzer();
 analyzer.generateReport().catch(console.error);
}