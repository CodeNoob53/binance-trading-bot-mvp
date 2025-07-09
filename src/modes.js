import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Завантажуємо .env файл
const envPath = path.join(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  logger.error('Error loading .env file:', result.error);
  process.exit(1);
}

// Визначаємо режим роботи
const mode = process.env.BOT_MODE || 'simulation';
logger.info(`🎮 Bot mode: ${mode}`);

// Конфігурація для різних режимів
const modeConfigs = {
  simulation: {
    apiKey: process.env.TESTNET_API_KEY,
    apiSecret: process.env.TESTNET_API_SECRET,
    isTestnet: true
  },
  testnet: {
    apiKey: process.env.TESTNET_API_KEY,
    apiSecret: process.env.TESTNET_API_SECRET,
    isTestnet: true
  },
  production: {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    isTestnet: false
  }
};

// Функції для роботи з режимами
export const currentMode = () => mode;

export const isSimulation = () => mode === 'simulation';

export const isTestnet = () => mode === 'testnet';

export const isProduction = () => mode === 'production';

export const getModeConfig = () => {
  const config = modeConfigs[mode];
  if (!config) {
    throw new Error(`Invalid mode: ${mode}. Must be one of: simulation, testnet, production`);
  }
  return config;
};