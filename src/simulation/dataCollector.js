import axios from 'axios';
import * as db from '../database.js';
import logger from '../logger.js';

export class DataCollector {
  constructor() {
    this.binanceAPI = 'https://api.binance.com/api/v3';
  }

  async collectNewListings(days = 180) {
    logger.info(`Collecting new listings for the last ${days} days`);
    
    // Це приклад - в реальності потрібно парсити анонси Binance
    // або використовувати сторонні API з історичними даними
    const mockListings = [
      { symbol: 'PIXELUSDT', date: '2024-02-19', category: 'Gaming' },
      { symbol: 'PORTALUSDT', date: '2024-02-29', category: 'Gaming' },
      { symbol: 'ACEUSDT', date: '2024-01-18', category: 'Gaming' },
      { symbol: 'NFPUSDT', date: '2024-01-10', category: 'AI' },
      { symbol: 'AIUSDT', date: '2024-01-19', category: 'AI' },
      { symbol: 'XAIUSDT', date: '2024-01-09', category: 'Gaming/AI' },
      // Додайте більше реальних лістингів
    ];
    
    for (const listing of mockListings) {
      try {
        await this.collectListingData(listing);
      } catch (error) {
        logger.error(`Failed to collect data for ${listing.symbol}:`, error.message);
      }
    }
  }

  async collectListingData(listing) {
    const { symbol, date, category } = listing;
    const listingTime = new Date(date).getTime();
    
    // Отримання історичних даних через klines
    const klines = await this.getKlines(symbol, '1h', listingTime, listingTime + 172800000);
    
    if (klines.length === 0) {
      logger.warn(`No data found for ${symbol}`);
      return;
    }
    
    // Аналіз даних
    const initialPrice = parseFloat(klines[0][1]); // Open price першої свічки
    const price1h = klines[0] ? parseFloat(klines[0][4]) : initialPrice;
    const price24h = klines[23] ? parseFloat(klines[23][4]) : null;
    const price48h = klines[47] ? parseFloat(klines[47][4]) : null;
    
    const prices = klines.map(k => parseFloat(k[2])); // High prices
    const maxPrice48h = Math.max(...prices);
    const minPrice48h = Math.min(...klines.map(k => parseFloat(k[3]))); // Low prices
    
    const volumes = klines.map(k => parseFloat(k[5]));
    const volume48h = volumes.reduce((sum, v) => sum + v, 0);
    
    const listingData = {
      symbol,
      listingTime,
      initialPrice,
      price1h,
      price24h,
      price48h,
      maxPrice48h,
      minPrice48h,
      volume48h,
      category
    };
    
    await db.saveListingHistory(listingData);
    logger.info(`Collected data for ${symbol}: +${((maxPrice48h/initialPrice - 1) * 100).toFixed(0)}% max gain`);
  }

  async getKlines(symbol, interval, startTime, endTime) {
    try {
      const response = await axios.get(`${this.binanceAPI}/klines`, {
        params: {
          symbol,
          interval,
          startTime,
          endTime,
          limit: 1000
        }
      });
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }
}