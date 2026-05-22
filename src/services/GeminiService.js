// src/services/GeminiService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GAME_CONFIG, GAME_MODE } from '../config/constants.js';

const SchemaType = {
  ARRAY: 'ARRAY',
  STRING: 'STRING',
};

// ─── Fallback sentences tĩnh ──────────────────────────────────────────────────
// Được nhóm theo độ dài ước lượng (số từ) để dễ filter khi cần
const FALLBACK_POOL = [
  // ~4-6 từ
  'Bầu trời hôm nay trong xanh.',
  'Hãy gõ thật nhanh và chính xác!',
  'The quick brown fox leaps.',
  'Mùa xuân về hoa nở rộ.',
  'Code sạch là nghệ thuật thật sự.',
  'Life is short, type faster.',
  'Học mỗi ngày một điều mới.',
  'Python rất dễ học và mạnh mẽ.',
  // ~7-10 từ
  'Công nghệ thông tin đang thay đổi thế giới mỗi ngày.',
  'Lập trình viên giỏi luôn viết code sạch và dễ đọc.',
  'Việt Nam là đất nước có nền văn hóa phong phú và đa dạng.',
  'The internet has changed the way we live and work forever.',
  'Hãy luôn cố gắng học hỏi và phát triển bản thân mỗi ngày.',
  'Science and technology are the driving forces of modern civilization.',
  'Mùa xuân là mùa đẹp nhất trong năm với hoa nở khắp nơi.',
  'Reading books is one of the best ways to expand your knowledge.',
  'Trẻ em cần được chăm sóc và giáo dục đúng cách từ nhỏ.',
  'Nghệ thuật ẩm thực Việt Nam nổi tiếng trên toàn thế giới.',
  'Biển cả bao la rộng lớn chứa đựng bao điều kỳ diệu.',
  'Teamwork and collaboration are essential skills in the modern workplace.',
  // ~11-15 từ
  'Trí tuệ nhân tạo đang mở ra một kỷ nguyên mới cho nhân loại trong thế kỷ 21.',
  'Mỗi người trong chúng ta đều có khả năng thay đổi thế giới theo cách riêng của mình.',
  'Khám phá vũ trụ rộng lớn luôn là ước mơ của nhân loại từ thuở khai thiên lập địa.',
  'The ability to learn quickly and adapt to change is the most valuable skill today.',
  'Hãy trân trọng những khoảnh khắc bình yên và hạnh phúc trong cuộc sống thường ngày.',
  'Video games have evolved from simple pixelated graphics to breathtaking virtual worlds.',
  // ~16-20 từ
  'Trong thế giới hiện đại, kỹ năng lập trình không còn là đặc quyền của riêng kỹ sư phần mềm nữa.',
  'Những ngọn núi hùng vĩ và những dòng sông thơ mộng tạo nên vẻ đẹp tự nhiên tuyệt vời của đất nước.',
  'The development of artificial intelligence raises important ethical questions about the future of humanity.',
  'Bảo vệ môi trường không chỉ là trách nhiệm của chính phủ mà còn là nghĩa vụ của mỗi công dân trên trái đất.',
  // ~21-24 từ
  'Lịch sử Việt Nam là lịch sử của một dân tộc kiên cường, trải qua hàng nghìn năm dựng nước và giữ nước đầy hy sinh và tự hào.',
  'The rise of social media platforms has fundamentally transformed how people around the world communicate, share information, and form communities.',
];

/**
 * Đếm số từ trong một câu (split theo khoảng trắng)
 * @param {string} sentence
 * @returns {number}
 */
function countWords(sentence) {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Lấy fallback sentences phù hợp với khoảng [minWords, maxWords].
 * Nếu không đủ, lặp lại pool cho đến khi đủ `count`.
 * @param {number} count
 * @param {number} minWords
 * @param {number} maxWords
 * @returns {string[]}
 */
function buildFallback(count, minWords, maxWords) {
  // Ưu tiên câu khớp đúng khoảng, nếu không đủ thì lấy tất cả
  let pool = FALLBACK_POOL.filter(s => {
    const w = countWords(s);
    return w >= minWords && w <= maxWords;
  });
  if (pool.length === 0) pool = [...FALLBACK_POOL];

  const result = [];
  while (result.length < count) {
    result.push(...pool.slice(0, count - result.length));
  }
  return result;
}

// ─── GeminiService ────────────────────────────────────────────────────────────

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[GeminiService] GEMINI_API_KEY chưa được cấu hình!');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = 'gemini-2.0-flash';

    // Cache: tránh gọi API liên tục khi nhiều phòng start gần nhau
    // key: `${gameMode}_${minWords}_${maxWords}`, value: { sentences, expiresAt }
    this._cache = new Map();
    this._CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Sinh danh sách câu cho một round mới.
   * @param {string} gameMode - 'Classic' | 'Timer'
   * @param {number} minWords
   * @param {number} maxWords
   * @returns {Promise<string[]>}
   */
  async generateSentences(gameMode, minWords, maxWords) {
    const count = gameMode === GAME_MODE.TIMER
      ? GAME_CONFIG.TIMER_SENTENCES
      : GAME_CONFIG.CLASSIC_SENTENCES;

    // Thử lấy từ cache trước
    const cached = this._getCache(gameMode, minWords, maxWords);
    if (cached) {
      console.log(`[GeminiService] Cache hit cho ${gameMode} (${minWords}-${maxWords}w)`);
      return cached;
    }

    const prompt = this._buildMainPrompt(count, minWords, maxWords);
    const sentences = await this._callWithRetry(prompt, count, minWords, maxWords, 3);

    // Lưu vào cache
    this._setCache(gameMode, minWords, maxWords, sentences);

    return sentences;
  }

  /**
   * Sinh câu bù khi người chơi bị skip câu do lỗi.
   * @param {number} needed - Số câu cần sinh thêm
   * @param {number} minWords
   * @param {number} maxWords
   * @returns {Promise<string[]>}
   */
  async generateExtraSentences(needed, minWords, maxWords) {
    const prompt = this._buildExtraPrompt(needed, minWords, maxWords);
    // Extra sentences: 2 lần retry, không cache
    return await this._callWithRetry(prompt, needed, minWords, maxWords, 2);
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Gọi Gemini với exponential backoff retry.
   * Nếu tất cả retry thất bại → trả về fallback tĩnh.
   * @param {string} prompt
   * @param {number} count - Số câu mong đợi
   * @param {number} minWords
   * @param {number} maxWords
   * @param {number} maxRetries
   * @returns {Promise<string[]>}
   */
  async _callWithRetry(prompt, count, minWords, maxWords, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.client.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: 0.92,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
        });

        const result = await model.generateContent(prompt);
        const raw = result.response.text().trim();

        // Parse — responseMimeType đảm bảo không có ```json wrapper
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Phòng trường hợp Gemini vẫn bọc markdown dù đã set MIME
          const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
          parsed = JSON.parse(clean);
        }

        if (!Array.isArray(parsed)) {
          throw new Error('Response không phải mảng JSON');
        }

        // Filter & validate từng câu
        const validated = this._validateSentences(parsed, count, minWords, maxWords);

        // Cần ít nhất 80% số câu yêu cầu, nếu không retry
        if (validated.length < Math.ceil(count * 0.8)) {
          throw new Error(
            `Không đủ câu hợp lệ: nhận được ${validated.length}/${count} ` +
            `(minWords=${minWords}, maxWords=${maxWords})`
          );
        }

        // Nếu thiếu nhẹ (80-99%), bổ sung bằng fallback thay vì retry
        if (validated.length < count) {
          const missing = count - validated.length;
          console.warn(
            `[GeminiService] Thiếu ${missing} câu, bổ sung từ fallback pool`
          );
          validated.push(...buildFallback(missing, minWords, maxWords));
        }

        console.log(
          `[GeminiService] Attempt ${attempt}/${maxRetries} thành công: ` +
          `${validated.length} câu (${minWords}-${maxWords}w)`
        );
        return validated.slice(0, count);

      } catch (error) {
        console.error(`[GeminiService] Attempt ${attempt}/${maxRetries} thất bại:`, error.message);

        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
          console.log(`[GeminiService] Thử lại sau ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // Tất cả retry thất bại → fallback tĩnh
    console.error(
      `[GeminiService] Tất cả ${maxRetries} lần retry thất bại. ` +
      `Dùng fallback tĩnh (${count} câu).`
    );
    return buildFallback(count, minWords, maxWords);
  }

  /**
   * Lọc, chuẩn hoá và kiểm tra chất lượng từng câu.
   * @param {any[]} raw
   * @param {number} count
   * @param {number} minWords
   * @param {number} maxWords
   * @returns {string[]}
   */
  _validateSentences(raw, count, minWords, maxWords) {
    const seen = new Set();
    const result = [];

    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const s = item.trim();
      if (!s) continue;

      // Bỏ qua câu trùng lặp (case-insensitive)
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // Kiểm tra giới hạn số từ
      const wc = countWords(s);
      if (wc < minWords || wc > maxWords) {
        console.warn(`[GeminiService] Bỏ câu ngoài khoảng [${minWords}-${maxWords}w]: "${s}" (${wc}w)`);
        continue;
      }

      result.push(s);
      if (result.length >= count) break;
    }

    return result;
  }

  /**
   * Xây prompt chính cho generateSentences.
   */
  _buildMainPrompt(count, minWords, maxWords) {
    return (
      `Hãy tạo ra danh sách gồm ĐÚNG ${count} câu văn. ` +
      `Mỗi câu PHẢI có số từ từ ${minWords} đến ${maxWords} từ (đếm theo khoảng trắng). ` +
      `Tỉ lệ ngôn ngữ: 70-80% tiếng Việt, 20-30% tiếng Anh trộn ngẫu nhiên. ` +
      `Chủ đề đa dạng: Khoa học, Công nghệ, Đời sống, Anime, Lịch sử, Văn học, Gaming, Thể thao, Ẩm thực. ` +
      `Không lặp lại ý tưởng hoặc cấu trúc câu. ` +
      `Câu phải có dấu câu tự nhiên (dấu phẩy, dấu chấm, dấu hỏi, dấu chấm than). ` +
      `Câu rõ ràng, mạch lạc, phù hợp để gõ tốc độ cao trong thi đấu. ` +
      `Trả về ĐÚNG ${count} phần tử trong mảng JSON. Không giải thích, không bình luận.`
    );
  }

  /**
   * Xây prompt cho generateExtraSentences.
   */
  _buildExtraPrompt(needed, minWords, maxWords) {
    return (
      `Hãy tạo ra danh sách gồm ĐÚNG ${needed} câu văn ngắn. ` +
      `Mỗi câu PHẢI có số từ từ ${minWords} đến ${maxWords} từ. ` +
      `70% tiếng Việt, 30% tiếng Anh. Chủ đề bất kỳ, đa dạng. ` +
      `Có dấu câu tự nhiên. Trả về ĐÚNG ${needed} phần tử trong mảng JSON.`
    );
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────────

  _cacheKey(gameMode, minWords, maxWords) {
    return `${gameMode}_${minWords}_${maxWords}`;
  }

  _getCache(gameMode, minWords, maxWords) {
    const entry = this._cache.get(this._cacheKey(gameMode, minWords, maxWords));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(this._cacheKey(gameMode, minWords, maxWords));
      return null;
    }
    // Trả về bản copy để tránh mutation ngoài ý muốn
    return [...entry.sentences];
  }

  _setCache(gameMode, minWords, maxWords, sentences) {
    this._cache.set(this._cacheKey(gameMode, minWords, maxWords), {
      sentences: [...sentences],
      expiresAt: Date.now() + this._CACHE_TTL_MS,
    });
  }
}

export const geminiService = new GeminiService();
