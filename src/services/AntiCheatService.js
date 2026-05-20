// src/services/AntiCheatService.js
import { GAME_CONFIG } from '../config/constants.js';

/**
 * AntiCheatService - Phát hiện gian lận dựa trên chỉ số WPM
 */
class AntiCheatService {
  /**
   * Tính toán WPM từ dữ liệu gõ phím
   * @param {string} sentence - Câu vừa gõ
   * @param {number} startTime - Timestamp bắt đầu gõ (ms)
   * @param {number} endTime - Timestamp kết thúc gõ (ms)
   * @returns {number} WPM
   */
  calculateWPM(sentence, startTime, endTime) {
    const durationMinutes = (endTime - startTime) / 60000;
    if (durationMinutes <= 0) return Infinity;

    // Standard: 1 word = 5 characters
    const words = sentence.length / 5;
    return Math.round(words / durationMinutes);
  }

  /**
   * Kiểm tra xem người chơi có gian lận không
   * @param {import('../managers/GlobalRoomManager.js').PlayerData} player
   * @param {string} sentence
   * @param {number} completionTime - ms để hoàn thành câu
   * @returns {{ isCheating: boolean, wpm: number, shouldKick: boolean }}
   */
  checkCheat(player, sentence, completionTime) {
    const startTime = player.lastTextTime;
    const endTime = startTime + completionTime;
    const wpm = this.calculateWPM(sentence, startTime, endTime);

    if (wpm > GAME_CONFIG.MAX_WPM) {
      player.consecutiveCheatCount = (player.consecutiveCheatCount || 0) + 1;
    } else {
      // Reset nếu câu tiếp theo bình thường
      player.consecutiveCheatCount = 0;
    }

    const shouldKick = player.consecutiveCheatCount >= GAME_CONFIG.CHEAT_CONSECUTIVE_VIOLATIONS;

    return {
      isCheating: wpm > GAME_CONFIG.MAX_WPM,
      wpm,
      shouldKick,
    };
  }

  /**
   * So sánh 2 chuỗi để tìm vị trí sai đầu tiên
   * @param {string} input - Chuỗi người dùng nhập
   * @param {string} target - Chuỗi đúng
   * @returns {{ isCorrect: boolean, firstErrorIndex: number, errorWord: string }}
   */
  compareStrings(input, target) {
    const trimmedInput = input.trim();
    const trimmedTarget = target.trim();

    if (trimmedInput === trimmedTarget) {
      return { isCorrect: true, firstErrorIndex: -1, errorWord: '' };
    }

    // Tìm ký tự sai đầu tiên
    let firstErrorIndex = -1;
    const minLen = Math.min(trimmedInput.length, trimmedTarget.length);

    for (let i = 0; i < minLen; i++) {
      if (trimmedInput[i] !== trimmedTarget[i]) {
        firstErrorIndex = i;
        break;
      }
    }

    if (firstErrorIndex === -1 && trimmedInput.length !== trimmedTarget.length) {
      firstErrorIndex = minLen;
    }

    // Tìm từ bị sai
    const inputWords = trimmedInput.split(' ');
    const targetWords = trimmedTarget.split(' ');
    let charCount = 0;
    let errorWord = '';

    for (let i = 0; i < targetWords.length; i++) {
      const wordEnd = charCount + targetWords[i].length;
      if (firstErrorIndex >= charCount && firstErrorIndex <= wordEnd) {
        errorWord = inputWords[i] || '(thiếu)';
        break;
      }
      charCount += targetWords[i].length + 1; // +1 for space
    }

    return { isCorrect: false, firstErrorIndex, errorWord };
  }

  /**
   * Format thông báo lỗi với ANSI color code để tô đỏ phần sai
   * @param {string} input
   * @param {string} target
   * @param {string} errorWord
   * @returns {string}
   */
  formatErrorMessage(input, target, errorWord) {
    const ANSI_RESET = '\u001b[0m';
    const ANSI_RED = '\u001b[31m';
    const ANSI_GREEN = '\u001b[32m';
    const ANSI_YELLOW = '\u001b[33m';

    // Phân tích từng từ
    const inputWords = input.trim().split(' ');
    const targetWords = target.trim().split(' ');

    let coloredInput = '';
    for (let i = 0; i < Math.max(inputWords.length, targetWords.length); i++) {
      const inputWord = inputWords[i] || '';
      const targetWord = targetWords[i] || '';

      if (inputWord === targetWord) {
        coloredInput += `${ANSI_GREEN}${inputWord}${ANSI_RESET} `;
      } else if (!inputWord) {
        coloredInput += `${ANSI_YELLOW}[thiếu: ${targetWord}]${ANSI_RESET} `;
      } else {
        coloredInput += `${ANSI_RED}${inputWord}${ANSI_RESET} `;
      }
    }

    return [
      '```ansi',
      `${ANSI_RED}❌ SAI!${ANSI_RESET} Từ sai: ${ANSI_RED}${errorWord}${ANSI_RESET}`,
      '',
      `Bạn gõ:   ${coloredInput.trim()}`,
      `Đáp đúng: ${ANSI_GREEN}${target.trim()}${ANSI_RESET}`,
      '```',
    ].join('\n');
  }
}

export const antiCheatService = new AntiCheatService();
