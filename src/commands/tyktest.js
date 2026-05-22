// src/commands/tyktest.js
import { SlashCommandBuilder } from 'discord.js';
import { geminiService } from '../services/GeminiService.js';
import { antiCheatService } from '../services/AntiCheatService.js';
import { GAME_CONFIG, COLORS } from '../config/constants.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('test')
  .setDescription('Kiểm tra tốc độ gõ phím cá nhân qua DM trong 1 phút');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Chỉ chạy được 1 phiên /test per user
  if (activeSessions.has(userId)) {
    return interaction.reply({
      content: '⚠️ Bạn đang có một phiên **/test** đang chạy! Hãy hoàn thành hoặc đợi nó kết thúc.',
      ephemeral: true,
    });
  }

  // Defer ngay để không timeout
  await interaction.deferReply({ ephemeral: true });

  // Thử mở DM
  let dmChannel;
  try {
    dmChannel = await interaction.user.createDM();
    // Gửi thử 1 tin để kiểm tra DM có mở được không
    await dmChannel.send({ content: '🔄 Đang chuẩn bị phiên luyện tập...' });
  } catch {
    return interaction.editReply({
      content:
        '❌ **Không thể gửi DM cho bạn!**\n' +
        'Vui lòng mở **"Allow Direct Messages from server members"** trong cài đặt Discord, rồi thử lại.',
    });
  }

  await interaction.editReply({
    content: '✅ Kiểm tra phiên luyện tập đã bắt đầu qua **DM**! Hãy kiểm tra tin nhắn riêng của bạn.',
  });

  // Sinh câu
  await dmChannel.send({ content: '⏳ Đang tạo 60 câu, vui lòng đợi giây lát...' });

  let sentences;
  try {
    sentences = await geminiService.generateExtraSentences(
      GAME_CONFIG.TEST_SENTENCES,
      GAME_CONFIG.TEST_MIN_WORDS,
      GAME_CONFIG.TEST_MAX_WORDS,
    );
    // Đảm bảo đủ 60 câu
    if (sentences.length < GAME_CONFIG.TEST_SENTENCES) {
      const extra = await geminiService.generateExtraSentences(
        GAME_CONFIG.TEST_SENTENCES - sentences.length,
        GAME_CONFIG.TEST_MIN_WORDS,
        GAME_CONFIG.TEST_MAX_WORDS,
      );
      sentences.push(...extra);
    }
    sentences = sentences.slice(0, GAME_CONFIG.TEST_SENTENCES);
  } catch (err) {
    console.error('[/test] Failed to generate sentences:', err);
    return dmChannel.send({ content: '❌ Không thể tạo câu. Vui lòng thử lại sau.' });
  }

  // Tạo session
  const session = {
    sentences,
    currentIndex: 0,
    correctCount: 0,
    totalChars: 0,
    startTime: null,
    endTime: null,
    collector: null,
    timeoutId: null,
  };
  activeSessions.set(userId, session);

  // Gửi hướng dẫn
  const introEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setAuthor({ name: '⌨️  Type your Keyboard!!!' })
    .setTitle('🏃 Phiên Luyện Tập Tốc Độ Gõ Phím')
    .setDescription(
      '**Luật chơi:**\n' +
      '• Gõ chính xác từng câu và nhấn Enter để chuyển sang câu tiếp theo.\n' +
      '• Nếu gõ sai, câu đó **không được tính** (nhưng bạn vẫn tiếp tục).\n' +
      '• Thời gian: **60 giây** kể từ khi bạn gõ câu đầu tiên.\n' +
      '• Mục tiêu: Gõ được **nhiều câu đúng nhất** trong 1 phút!\n\n' +
      '**Sẵn sàng?** Câu đầu tiên sẽ xuất hiện ngay bên dưới. Bắt đầu gõ khi bạn đã sẵn sàng!'
    )
    .addFields(
      { name: '📝 Tổng số câu', value: `${GAME_CONFIG.TEST_SENTENCES} câu`, inline: true },
      { name: '⏱️ Thời gian', value: '60 giây', inline: true },
      { name: '📏 Độ dài câu', value: `${GAME_CONFIG.TEST_MIN_WORDS}–${GAME_CONFIG.TEST_MAX_WORDS} từ`, inline: true },
    )
    .setFooter({ text: 'Timer bắt đầu khi bạn gửi câu trả lời đầu tiên.' })
    .setTimestamp();

  await dmChannel.send({ embeds: [introEmbed] });

  // Gửi câu đầu tiên
  await _sendTestSentence(dmChannel, session, userId);

  // Collector lắng nghe DM
  const collector = dmChannel.createMessageCollector({
    filter: (msg) => msg.author.id === userId && !msg.author.bot,
    time: GAME_CONFIG.TEST_DURATION_MS + 30000, // +30s buffer, timeout thật do _startTestTimer
  });
  session.collector = collector;

  collector.on('collect', async (msg) => {
    const s = activeSessions.get(userId);
    if (!s) return;

    // Bắt đầu timer ngay khi nhận câu trả lời đầu tiên
    if (!s.startTime) {
      s.startTime = Date.now();
      _startTestTimer(dmChannel, session, userId);
    }

    const target = s.sentences[s.currentIndex];
    const input = msg.content;
    const { isCorrect } = antiCheatService.compareStrings(input, target);

    if (isCorrect) {
      s.correctCount += 1;
      s.totalChars += target.length;
      await msg.react('✅').catch(() => null);
    } else {
      await msg.react('❌').catch(() => null);
    }

    s.currentIndex += 1;

    // Hết câu?
    if (s.currentIndex >= s.sentences.length) {
      s.endTime = Date.now();
      collector.stop('completed');
      return;
    }

    await _sendTestSentence(dmChannel, s, userId);
  });

  collector.on('end', async (_, reason) => {
    const s = activeSessions.get(userId);
    if (!s) return;
    if (!s.endTime) s.endTime = Date.now();
    clearTimeout(s.timeoutId);
    activeSessions.delete(userId);
    await _sendTestResult(dmChannel, s, username, reason);
  });
}

// ─── Active sessions tracker ────────────────────────────────────────────────
// Map<userId, session>
const activeSessions = new Map();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Gửi câu tiếp theo trong phiên test
 */
async function _sendTestSentence(dmChannel, session, userId) {
  const idx = session.currentIndex;
  const total = session.sentences.length;
  const sentence = session.sentences[idx];

  await dmChannel.send({
    content:
      `📝 **Câu ${idx + 1}/${total}**\n` +
      `\`\`\`\n${sentence}\n\`\`\``,
  });
}

/**
 * Bắt đầu đếm ngược 60 giây, tự động kết thúc khi hết giờ
 */
function _startTestTimer(dmChannel, session, userId) {
  // Thông báo sau 30s
  const warn30 = setTimeout(async () => {
    if (!activeSessions.has(userId)) return;
    await dmChannel.send({ content: '⏱️ **Còn 30 giây!** Cố lên!' }).catch(() => null);
  }, 30000);

  // Thông báo sau 50s
  const warn10 = setTimeout(async () => {
    if (!activeSessions.has(userId)) return;
    await dmChannel.send({ content: '⏰ **Còn 10 giây!**' }).catch(() => null);
  }, 50000);

  // Kết thúc sau 60s
  session.timeoutId = setTimeout(async () => {
    clearTimeout(warn30);
    clearTimeout(warn10);
    const s = activeSessions.get(userId);
    if (!s || s.collector?.ended) return;
    s.endTime = Date.now();
    s.collector?.stop('timeout');
  }, GAME_CONFIG.TEST_DURATION_MS);
}

/**
 * Tính toán và gửi kết quả cuối phiên test
 */
async function _sendTestResult(dmChannel, session, username, reason) {
  const durationMs = session.endTime - (session.startTime ?? session.endTime);
  const durationSec = Math.round(durationMs / 1000);

  const correct = session.correctCount;
  const attempted = session.currentIndex;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  // WPM: (tổng ký tự đúng / 5) / phút
  const durationMin = durationMs / 60000;
  const wpm = durationMin > 0 ? Math.round((session.totalChars / 5) / durationMin) : 0;

  // Xếp hạng theo WPM
  const { grade, advice } = _getGrade(wpm, accuracy);

  const embed = new EmbedBuilder()
    .setColor(grade.color)
    .setAuthor({ name: '⌨️  Type your Keyboard!!!' })
    .setTitle(`${grade.emoji} Kết Quả Luyện Tập — ${username}`)
    .addFields(
      { name: '✅ Câu đúng', value: `**${correct}** / ${session.sentences.length}`, inline: true },
      { name: '📊 Đã thử', value: `**${attempted}** câu`, inline: true },
      { name: '🎯 Độ chính xác', value: `**${accuracy}%**`, inline: true },
      { name: '⚡ Tốc độ', value: `**${wpm} WPM**`, inline: true },
      { name: '⏱️ Thời gian dùng', value: `**${durationSec}s**`, inline: true },
      { name: '🏅 Xếp hạng', value: `**${grade.label}**`, inline: true },
      { name: '💡 Nhận xét', value: advice, inline: false },
    )
    .setFooter({ text: reason === 'completed' ? '🎉 Bạn đã gõ hết tất cả 60 câu!' : '⏰ Hết thời gian 60 giây.' })
    .setTimestamp();

  await dmChannel.send({ embeds: [embed] });
}

/**
 * Xếp hạng dựa trên WPM và accuracy
 */
function _getGrade(wpm, accuracy) {
  if (wpm >= 120 && accuracy >= 95) {
    return {
      grade: { emoji: '👑', label: 'Grand Master', color: COLORS.GOLD },
      advice: 'Xuất sắc! Bạn đang ở đỉnh cao. Hãy thử chế độ Hardcore trong phòng thi đấu!',
    };
  }
  if (wpm >= 90 && accuracy >= 90) {
    return {
      grade: { emoji: '💎', label: 'Master', color: 0x00BFFF },
      advice: 'Rất ấn tượng! Tập trung vào độ chính xác để leo lên Grand Master.',
    };
  }
  if (wpm >= 60 && accuracy >= 85) {
    return {
      grade: { emoji: '🥇', label: 'Expert', color: COLORS.SUCCESS },
      advice: 'Kỹ năng tốt! Luyện tập thêm câu dài hơn để tăng WPM.',
    };
  }
  if (wpm >= 40 && accuracy >= 75) {
    return {
      grade: { emoji: '🥈', label: 'Intermediate', color: COLORS.PRIMARY },
      advice: 'Đang tiến bộ! Tập trung gõ chính xác trước, tốc độ sẽ tự tăng theo.',
    };
  }
  if (wpm >= 20) {
    return {
      grade: { emoji: '🥉', label: 'Beginner', color: COLORS.WARNING },
      advice: 'Hãy luyện tập thường xuyên hơn. Bắt đầu bằng cách nhìn bàn phím ít hơn!',
    };
  }
  return {
    grade: { emoji: '🌱', label: 'Newbie', color: COLORS.SECONDARY },
    advice: 'Đừng nản! Gõ 10 phút mỗi ngày và bạn sẽ thấy sự khác biệt rõ rệt sau 1 tuần.',
  };
}
