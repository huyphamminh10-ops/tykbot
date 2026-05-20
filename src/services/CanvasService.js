// src/services/CanvasService.js
import { createCanvas, registerFont } from 'canvas';
import { AttachmentBuilder } from 'discord.js';

/**
 * CanvasService - Render câu đề thành ảnh chống OCR/Copy-Paste
 */
class CanvasService {
  constructor() {
    this.WIDTH = 800;
    this.HEIGHT = 160;
    this.FONT_SIZE = 22;
    this.PADDING = 30;
  }

  /**
   * Tạo ảnh chống gian lận từ chuỗi câu đề
   * @param {string} sentence - Câu đề cần render
   * @param {number} sentenceIndex - Số thứ tự câu (hiển thị góc)
   * @param {number} totalSentences - Tổng số câu
   * @returns {AttachmentBuilder}
   */
  renderSentenceImage(sentence, sentenceIndex, totalSentences) {
    const canvas = createCanvas(this.WIDTH, this.HEIGHT);
    const ctx = canvas.getContext('2d');

    // ── Background gradient ──────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, this.WIDTH, this.HEIGHT);
    bgGrad.addColorStop(0, '#0d1117');
    bgGrad.addColorStop(0.5, '#161b22');
    bgGrad.addColorStop(1, '#0d1117');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    // ── Border glow effect ───────────────────────────────────────────────────
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#58a6ff';
    ctx.shadowBlur = 8;
    ctx.strokeRect(2, 2, this.WIDTH - 4, this.HEIGHT - 4);
    ctx.shadowBlur = 0;

    // ── Anti-OCR: Noise pixels ───────────────────────────────────────────────
    this._addNoise(ctx);

    // ── Anti-OCR: Diagonal interference lines ───────────────────────────────
    this._addInterferenceLines(ctx);

    // ── Sentence counter (top-right) ─────────────────────────────────────────
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#6e7681';
    ctx.textAlign = 'right';
    ctx.fillText(`Câu ${sentenceIndex}/${totalSentences}`, this.WIDTH - this.PADDING, 22);

    // ── Label "TYPE YOUR KEYBOARD!!!" (top-left) ─────────────────────────────
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#58a6ff';
    ctx.textAlign = 'left';
    ctx.fillText('⌨  TYPE YOUR KEYBOARD!!!', this.PADDING, 22);

    // ── Main sentence text ────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    const lines = this._wrapText(ctx, sentence, this.WIDTH - this.PADDING * 2);
    const lineHeight = this.FONT_SIZE + 8;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (this.HEIGHT - totalTextHeight) / 2 + this.FONT_SIZE / 2 + 10;

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;

      // Text shadow/glow for readability over noise
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.font = `bold ${this.FONT_SIZE}px 'Courier New', monospace`;
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(line, this.WIDTH / 2, y);
      ctx.shadowBlur = 0;
    });

    // ── Bottom separator line ─────────────────────────────────────────────────
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(this.PADDING, this.HEIGHT - 28);
    ctx.lineTo(this.WIDTH - this.PADDING, this.HEIGHT - 28);
    ctx.stroke();

    // ── Instruction text ──────────────────────────────────────────────────────
    ctx.font = '12px monospace';
    ctx.fillStyle = '#484f58';
    ctx.textAlign = 'center';
    ctx.fillText('Gõ chính xác câu trên và nhấn Enter để gửi', this.WIDTH / 2, this.HEIGHT - 10);

    // ── Convert to Buffer ─────────────────────────────────────────────────────
    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'sentence.png' });
  }

  /**
   * Render ảnh kết quả round
   * @param {Array} leaderboard - Danh sách {username, score, errors, isEliminated}
   * @param {number} round
   * @param {string} eliminatedName
   * @returns {AttachmentBuilder}
   */
  renderRoundResult(leaderboard, round, eliminatedName) {
    const rowHeight = 36;
    const headerH = 70;
    const canvasH = headerH + leaderboard.length * rowHeight + 30;
    const canvas = createCanvas(this.WIDTH, canvasH);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, this.WIDTH, canvasH);

    // Header
    const hGrad = ctx.createLinearGradient(0, 0, this.WIDTH, 0);
    hGrad.addColorStop(0, '#1f2937');
    hGrad.addColorStop(1, '#111827');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, this.WIDTH, headerH);

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(`🏆 KẾT QUẢ ROUND ${round}`, this.WIDTH / 2, 32);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#ed4245';
    ctx.fillText(`💀 Bị loại: ${eliminatedName}`, this.WIDTH / 2, 58);

    // Rows
    leaderboard.forEach((player, i) => {
      const y = headerH + i * rowHeight;
      const isElim = player.isEliminated;

      ctx.fillStyle = i % 2 === 0 ? '#161b22' : '#0d1117';
      ctx.fillRect(0, y, this.WIDTH, rowHeight);

      const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#8b949e';
      ctx.font = `bold 15px monospace`;
      ctx.fillStyle = isElim ? '#484f58' : rankColor;
      ctx.textAlign = 'left';
      ctx.fillText(`#${i + 1}`, 20, y + 23);

      ctx.fillStyle = isElim ? '#484f58' : '#e6edf3';
      ctx.font = isElim ? '14px monospace' : 'bold 14px monospace';
      ctx.fillText(isElim ? `~~${player.username}~~` : player.username, 60, y + 23);

      ctx.textAlign = 'right';
      ctx.fillStyle = isElim ? '#484f58' : '#57f287';
      ctx.font = '13px monospace';
      ctx.fillText(`${player.score} câu | ${player.errors} lỗi`, this.WIDTH - 20, y + 23);
    });

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'round_result.png' });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  /**
   * Thêm noise ngẫu nhiên (các pixel màu nhiễu) lên canvas để chống OCR
   */
  _addNoise(ctx) {
    const imageData = ctx.getImageData(0, 0, this.WIDTH, this.HEIGHT);
    const data = imageData.data;
    const noiseCount = 3000; // Số lượng pixel nhiễu

    for (let i = 0; i < noiseCount; i++) {
      const x = Math.floor(Math.random() * this.WIDTH);
      const y = Math.floor(Math.random() * this.HEIGHT);
      const pixelIndex = (y * this.WIDTH + x) * 4;

      // Nhiễu xám nhẹ, không đủ cản mắt người nhưng gây khó cho OCR
      const noiseVal = Math.floor(Math.random() * 60) + 20;
      data[pixelIndex] = noiseVal;     // R
      data[pixelIndex + 1] = noiseVal; // G
      data[pixelIndex + 2] = noiseVal; // B
      data[pixelIndex + 3] = 180;      // Alpha (không hoàn toàn đục)
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Vẽ các đường kẻ mảnh ngẫu nhiên cắt ngang chữ - chống OCR nhưng mắt người vẫn đọc được
   */
  _addInterferenceLines(ctx) {
    const lineCount = 12;

    for (let i = 0; i < lineCount; i++) {
      const y = Math.random() * this.HEIGHT;
      const opacity = (Math.random() * 0.15 + 0.05).toFixed(2);

      ctx.beginPath();
      ctx.strokeStyle = `rgba(88, 166, 255, ${opacity})`;
      ctx.lineWidth = Math.random() < 0.5 ? 0.5 : 1;

      // Đường cong nhẹ thay vì đường thẳng
      ctx.moveTo(0, y + (Math.random() - 0.5) * 10);
      ctx.bezierCurveTo(
        this.WIDTH * 0.33, y + (Math.random() - 0.5) * 15,
        this.WIDTH * 0.66, y + (Math.random() - 0.5) * 15,
        this.WIDTH, y + (Math.random() - 0.5) * 10
      );
      ctx.stroke();
    }
  }

  /**
   * Wrap text theo độ rộng canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} maxWidth
   * @returns {string[]}
   */
  _wrapText(ctx, text, maxWidth) {
    ctx.font = `bold ${this.FONT_SIZE}px 'Courier New', monospace`;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const { width } = ctx.measureText(testLine);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }
}

export const canvasService = new CanvasService();
