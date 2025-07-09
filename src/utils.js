/**
 * Утиліти для роботи з ботом
 */

/**
 * Функція для затримки виконання на вказану кількість мілісекунд
 * @param {number} ms - кількість мілісекунд для затримки
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)); 