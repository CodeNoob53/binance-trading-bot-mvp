import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { currentMode } from './modes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Завантажуємо .env файл
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Конфігурація бота
export const config = {
  // Режим роботи
  BOT_MODE: currentMode(),

  // API ключі (завантажуються з .env файлу)
  BINANCE_API_KEY: process.env.BINANCE_API_KEY,
  BINANCE_API_SECRET: process.env.BINANCE_API_SECRET,
  TESTNET_API_KEY: process.env.TESTNET_API_KEY,
  TESTNET_API_SECRET: process.env.TESTNET_API_SECRET,

  // Налаштування тестової мережі
  IS_TESTNET: process.env.IS_TESTNET === 'true',

  // Налаштування симуляції
  SIMULATION_START_DATE: process.env.SIMULATION_START_DATE,
  SIMULATION_END_DATE: process.env.SIMULATION_END_DATE,
  SIMULATION_INITIAL_BALANCE: parseFloat(process.env.SIMULATION_INITIAL_BALANCE || '1000'),

  // Налаштування торгівлі
  BUY_AMOUNT_USDT: parseFloat(process.env.BUY_AMOUNT_USDT || '100'),
  TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT || '0.02'),
  STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || '0.01'),
  SCAN_INTERVAL_MS: parseInt(process.env.SCAN_INTERVAL_MS || '60000'), // 1 хвилина за замовчуванням 1

  // Налаштування логування
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'bot.log'
};

// Валідація тільки для non-simulation режимівif (currentMode() !== 'simulation' && (!config.BINANCE_API_KEY || !config.BINANCE_API_SECRET)) {
  throw new Error(`❌ API credentials not set for ${currentMode()} mode!`);

