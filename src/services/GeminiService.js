// src/services/GeminiService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GAME_CONFIG, GAME_MODE } from '../config/constants.js';

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[GeminiService] GEMINI_API_KEY chưa được cấu hình!');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = 'gemini-2.0-flash';
  }

  /**
   * Sinh danh sách câu đề bài từ Gemini
   * @param {string} gameMode - 'Classic' | 'Timer'
   * @param {number} minWords
   * @param {number} maxWords
   * @returns {Promise<string[]>}
   */
  async generateSentences(gameMode, minWords, maxWords) {
    const count = gameMode === GAME_MODE.TIMER
      ? GAME_CONFIG.TIMER_SENTENCES
      : GAME_CONFIG.CLASSIC_SENTENCES;

    const prompt = `Hãy tạo ra danh sách gồm ${count} câu văn bằng tiếng Việt (hoặc xen kẽ tiếng Anh ngẫu nhiên khoảng 30%). Mỗi câu phải có độ dài từ ${minWords} đến ${maxWords} từ. Các câu phải có nội dung phong phú, đa dạng chủ đề (khoa học, đời sống, thể thao, công nghệ, lịch sử, văn học), không lặp lại, chứa cả dấu câu cơ bản (dấu phẩy, dấu chấm, dấu hỏi). Các câu phải rõ ràng, dễ nhìn để gõ phím. Trả về định dạng JSON thuần dạng mảng chuỗi: ["câu 1", "câu 2", ...] không kèm markdown code block, không kèm bất kỳ văn bản giải thích nào khác ngoài mảng JSON.`;

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.client.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 8192,
          },
        });

        const result = await model.generateContent(prompt);
        const raw = result.response.text().trim();

        // Làm sạch: loại bỏ markdown code blocks nếu model vẫn trả về
        const cleaned = raw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const sentences = JSON.parse(cleaned);

        if (!Array.isArray(sentences)) {
          throw new Error('Response is not an array');
        }

        // Lọc và đảm bảo chất lượng
        const filtered = sentences
          .filter(s => typeof s === 'string' && s.trim().length > 0)
          .map(s => s.trim())
          .slice(0, count);

        if (filtered.length < count * 0.8) {
          throw new Error(`Insufficient sentences: got ${filtered.length}, expected ${count}`);
        }

        return filtered;

      } catch (error) {
        console.error(`[GeminiService] Attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt === maxRetries) {
          console.error('[GeminiService] All retries failed, using fallback sentences');
          return this._getFallbackSentences(count);
        }

        // Exponential backoff
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  /**
   * Sinh thêm câu bù khi người chơi bị lỗi (để tổng số câu không bị thiếu)
   * @param {number} needed - Số câu cần sinh thêm
   * @param {number} minWords
   * @param {number} maxWords
   * @returns {Promise<string[]>}
   */
  async generateExtraSentences(needed, minWords, maxWords) {
    const prompt = `Hãy tạo ra danh sách gồm ${needed} câu văn bằng tiếng Việt (hoặc xen kẽ tiếng Anh ngẫu nhiên khoảng 30%). Mỗi câu phải có độ dài từ ${minWords} đến ${maxWords} từ. Đa dạng chủ đề, không lặp lại. Trả về định dạng JSON thuần dạng mảng chuỗi: ["câu 1", "câu 2", ...] không kèm markdown code block, không kèm bất kỳ văn bản giải thích nào.`;

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const sentences = JSON.parse(cleaned);
      if (!Array.isArray(sentences)) throw new Error('Not an array');
      return sentences.filter(s => typeof s === 'string' && s.trim().length > 0).map(s => s.trim());
    } catch {
      return this._getFallbackSentences(needed);
    }
  }

  /**
   * Dự phòng khi API thất bại
   * @param {number} count
   * @returns {string[]}
   */
  _getFallbackSentences(count) {
    const base = [
      'The quick brown fox jumps over the lazy dog.',
      'Công nghệ thông tin đang thay đổi thế giới mỗi ngày.',
      'Bầu trời hôm nay trong xanh và đẹp tuyệt vời.',
      'Lập trình viên giỏi luôn viết code sạch và dễ đọc.',
      'Việt Nam là đất nước có nền văn hóa phong phú và đa dạng.',
      'The sun rises in the east and sets in the west.',
      'Hãy luôn cố gắng học hỏi và phát triển bản thân mỗi ngày.',
      'Science and technology are the driving forces of modern civilization.',
      'Mùa xuân là mùa đẹp nhất trong năm với hoa nở khắp nơi.',
      'Reading books is one of the best ways to expand your knowledge.',
      'Trẻ em cần được chăm sóc và giáo dục đúng cách từ nhỏ.',
      'The internet has revolutionized the way we communicate and share information.',
      'Nghệ thuật ẩm thực Việt Nam nổi tiếng trên toàn thế giới.',
      'Teamwork and collaboration are essential skills in the modern workplace.',
      'Biển cả bao la rộng lớn chứa đựng bao điều kỳ diệu.',
    ];

    const result = [];
    while (result.length < count) {
      result.push(...base.slice(0, Math.min(base.length, count - result.length)));
    }
    return result.slice(0, count);
  }
}

export const geminiService = new GeminiService();
