// src/services/GameEngine.js
import {
  ThreadAutoArchiveDuration,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { roomManager } from '../managers/GlobalRoomManager.js';
import { geminiService } from './GeminiService.js';
import { canvasService } from './CanvasService.js';
import { antiCheatService } from './AntiCheatService.js';
import {
  buildGameOverEmbed,
  buildEliminationEmbed,
  buildLobbyEmbed,
} from '../utils/EmbedBuilders.js';
import { GAME_CONFIG, ROOM_STATUS, GAME_MODE } from '../config/constants.js';

/**
 * GameEngine - Điều phối toàn bộ vòng lặp gameplay
 */
class GameEngine {
  constructor() {
    /** Map<guildId, { messageCollectors: Map, threadMessageCollectors: Map }> */
    this._activeCollectors = new Map();
  }

  // ─── Game Start ────────────────────────────────────────────────────────────

  /**
   * Bắt đầu game: Load đề từ Gemini, tạo thread cho từng người chơi
   * @param {import('../managers/GlobalRoomManager.js').Room} room
   * @param {import('discord.js').TextChannel} channel
   * @param {import('discord.js').Client} client
   * @param {string} lobbyMessageId
   */
  async startGame(room, channel, client, lobbyMessageId) {
    room.status = ROOM_STATUS.LOADING;

    try {
      // 1. Fetch lobby message và hiện trạng loading
      const { buildLoadingEmbed } = await import('../utils/EmbedBuilders.js');
      const lobbyMsg = await channel.messages.fetch(lobbyMessageId).catch(() => null);
      if (lobbyMsg) {
        await lobbyMsg.edit(buildLoadingEmbed(room));
      }

      // 2. Gọi Gemini sinh đề
      room.sentences = await geminiService.generateSentences(
        room.gameMode,
        room.settings.minWords,
        room.settings.maxWords
      );

      // 3. Chuyển trạng thái PLAYING
      room.status = ROOM_STATUS.PLAYING;
      room.currentRound = 1;
      room.resetRoundScores();

      // 4. Tạo Private Thread cho từng người chơi
      await this._createPlayerThreads(room, channel, client);

      // 5. Gửi câu đầu tiên cho từng người
      await this._sendSentenceToAllPlayers(room, client);

      // 6. Nếu Timer mode: thiết lập đếm ngược
      if (room.gameMode === GAME_MODE.TIMER) {
        this._startTimerRound(room, channel, client, lobbyMessageId);
      }

      // 7. Cập nhật lobby embed thành đang chơi
      if (lobbyMsg) {
        const playingEmbed = {
          embeds: [{
            color: 0x57F287,
            title: `⌨️ ĐANG THI ĐẤU: ${room.roomName}`,
            description: `**Round ${room.currentRound}** đang diễn ra!\n${room.gameMode === GAME_MODE.TIMER ? `⏱️ Thời gian: ${room.timerRoundDuration / 1000}s` : ''}`,
            fields: [
              { name: '👥 Người chơi', value: `${room.getActivePlayers().length} đang thi đấu`, inline: true },
              { name: '🎮 Chế độ', value: room.gameMode, inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
          components: [],
        };
        await lobbyMsg.edit(playingEmbed).catch(() => null);
      }

    } catch (error) {
      console.error('[GameEngine] startGame error:', error);
      room.status = ROOM_STATUS.LOBBY;

      const lobbyMsg = await channel.messages.fetch(lobbyMessageId).catch(() => null);
      if (lobbyMsg) {
        await lobbyMsg.edit({
          ...buildLobbyEmbed(room),
          content: '❌ Lỗi khởi tạo game. Vui lòng thử lại!',
        });
      }
    }
  }

  // ─── Thread Management ─────────────────────────────────────────────────────

  async _createPlayerThreads(room, channel, client) {
    for (const player of room.players.values()) {
      if (player.isEliminated) continue;

      try {
        const thread = await channel.threads.create({
          name: `🎮 ${player.username} - ${room.roomName}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
          type: ChannelType.PrivateThread,
          invitable: false,
          reason: 'TYK Battle Royale - Private typing thread',
        });

        // Thêm người chơi vào thread
        await thread.members.add(player.userId);

        room.playerThreads.set(player.userId, thread);
        player.lastTextTime = Date.now();

        // Gửi tin nhắn chào mừng
        await thread.send({
          content: `**Chào ${player.username}!** 🎮\n\nTrận đấu **${room.roomName}** đã bắt đầu!\n` +
            `Chế độ: **${room.gameMode}** | ${room.settings.isHardcore ? '☠️ Hardcore' : '🟢 Normal'}\n\n` +
            `Đọc câu trong ảnh và gõ **chính xác** vào đây rồi nhấn Enter.\n` +
            `⚠️ Không copy/paste! Hệ thống phát hiện tốc độ bất thường sẽ kick bạn.\n\n` +
            `_Câu đầu tiên sẽ xuất hiện ngay bây giờ..._`,
        });

      } catch (error) {
        console.error(`[GameEngine] Failed to create thread for ${player.username}:`, error);
      }
    }
  }

  // ─── Send Sentences ────────────────────────────────────────────────────────

  async _sendSentenceToAllPlayers(room, client) {
    for (const player of room.players.values()) {
      if (player.isEliminated) continue;
      await this._sendNextSentence(room, player, client);
    }
  }

  /**
   * Gửi câu tiếp theo cho một người chơi cụ thể
   */
  async _sendNextSentence(room, player, client) {
    const thread = room.playerThreads.get(player.userId);
    if (!thread) return;

    const sentenceIndex = player.currentSentenceIndex;
    const totalSentences = room.sentences.length;

    if (sentenceIndex >= totalSentences) {
      // Người chơi đã hoàn thành tất cả câu (Classic mode win condition)
      if (room.gameMode === GAME_MODE.CLASSIC) {
        await this._handleClassicCompletion(room, player, client, thread);
      }
      return;
    }

    const sentence = room.sentences[sentenceIndex];
    player.lastTextTime = Date.now();

    // Render ảnh chống gian lận
    const attachment = canvasService.renderSentenceImage(
      sentence,
      sentenceIndex + 1,
      totalSentences
    );

    await thread.send({
      content: `📸 **Câu ${sentenceIndex + 1}/${totalSentences}** — Hãy gõ chính xác câu dưới đây:`,
      files: [attachment],
    });

    // Thiết lập collector lắng nghe câu trả lời
    this._setupAnswerCollector(room, player, thread, sentence, client);
  }

  // ─── Answer Collector ──────────────────────────────────────────────────────

  _setupAnswerCollector(room, player, thread, targetSentence, client) {
    // Hủy collector cũ nếu có
    const existingKey = `${room.id}_${player.userId}`;
    const collectorMap = this._activeCollectors.get(room.id);
    if (collectorMap?.has(player.userId)) {
      collectorMap.get(player.userId).stop();
    }

    const filter = (msg) => msg.author.id === player.userId && !msg.author.bot;

    const collector = thread.createMessageCollector({ filter, max: 1 });

    // Lưu collector để có thể hủy sau
    if (!this._activeCollectors.has(room.id)) {
      this._activeCollectors.set(room.id, new Map());
    }
    this._activeCollectors.get(room.id).set(player.userId, collector);

    collector.on('collect', async (msg) => {
      await this._handleAnswer(room, player, thread, targetSentence, msg.content, client);
    });
  }

  async _handleAnswer(room, player, thread, targetSentence, userInput, client) {
    // Kiểm tra trạng thái phòng
    if (room.status !== ROOM_STATUS.PLAYING || player.isEliminated) return;

    const now = Date.now();
    const timeTaken = now - player.lastTextTime;

    // ── Anti-Cheat Check ───────────────────────────────────────────────────
    const { isCheating, wpm, shouldKick } = antiCheatService.checkCheat(player, targetSentence, timeTaken);

    if (shouldKick) {
      await this._kickForCheating(room, player, thread, wpm, client);
      return;
    }

    if (isCheating) {
      await thread.send({
        content: `⚠️ **CẢNH BÁO!** Tốc độ gõ của bạn là **${wpm} WPM** - Bất thường! (Lần ${player.consecutiveCheatCount}/${GAME_CONFIG.CHEAT_CONSECUTIVE_VIOLATIONS})\nLần tiếp theo bạn sẽ bị kick.`,
      });
    }

    // ── String Comparison ──────────────────────────────────────────────────
    const { isCorrect, firstErrorIndex, errorWord } = antiCheatService.compareStrings(
      userInput,
      targetSentence
    );

    if (isCorrect) {
      await this._handleCorrectAnswer(room, player, thread, targetSentence, timeTaken, wpm, client);
    } else {
      await this._handleWrongAnswer(room, player, thread, targetSentence, userInput, errorWord, client);
    }
  }

  async _handleCorrectAnswer(room, player, thread, sentence, timeTaken, wpm, client) {
    player.currentScore += 1;
    player.lastTextTime = Date.now();

    const delay = room.settings.isFastMode
      ? GAME_CONFIG.CORRECT_DELAY_FAST
      : GAME_CONFIG.CORRECT_DELAY_NORMAL;

    await thread.send({
      content: `✅ **Chính xác!** +1 điểm | ⚡ ${wpm} WPM | 📊 Tổng: **${player.currentScore}** câu\n` +
        `_Vui lòng chờ **${delay / 1000} giây** để nhận câu tiếp theo..._`,
    });

    player.currentSentenceIndex += 1;

    // Đặt timer gửi câu tiếp theo
    room.setTimer(async () => {
      if (room.status !== ROOM_STATUS.PLAYING || player.isEliminated) return;

      // Kiểm tra Classic mode: nếu ai đó vừa hoàn thành tất cả câu
      if (player.currentSentenceIndex >= room.sentences.length && room.gameMode === GAME_MODE.CLASSIC) {
        await this._handleClassicCompletion(room, player, client, thread);
        return;
      }

      await this._sendNextSentence(room, player, client);
    }, delay);
  }

  async _handleWrongAnswer(room, player, thread, targetSentence, userInput, errorWord, client) {
    player.errors += 1;

    const errorMsg = antiCheatService.formatErrorMessage(userInput, targetSentence, errorWord);

    if (room.settings.isHardcore) {
      // Hardcore: loại ngay lập tức
      player.isEliminated = true;

      await thread.send({
        content: errorMsg + '\n\n💀 **BẠN ĐÃ BỊ LOẠI!** Chế độ Hardcore không chấp nhận bất kỳ lỗi sai nào.',
      });

      await thread.setLocked(true).catch(() => null);
      await thread.setArchived(true).catch(() => null);

      await this._notifyElimination(room, player, client, '☠️ Sai 1 câu trong chế độ Hardcore');
      await this._checkGameEnd(room, client);

    } else {
      // Normal mode: phạt 5 giây, bỏ qua câu
      const maxErrors = GAME_CONFIG.MAX_ERRORS_NORMAL;

      if (player.errors > maxErrors) {
        // Loại vì quá nhiều lỗi
        player.isEliminated = true;

        await thread.send({
          content: errorMsg + `\n\n💀 **BẠN ĐÃ BỊ LOẠI!** Đã sai quá **${maxErrors}** lần.`,
        });

        await thread.setLocked(true).catch(() => null);
        await thread.setArchived(true).catch(() => null);

        await this._notifyElimination(room, player, client, `Sai quá ${maxErrors} lần`);
        await this._checkGameEnd(room, client);
      } else {
        await thread.send({
          content: errorMsg + `\n\n⏭️ Lỗi **${player.errors}/${maxErrors}**. Câu sai sẽ bị bỏ qua sau **5 giây**...`,
        });

        player.currentSentenceIndex += 1; // Bỏ qua câu sai

        // Tạo câu bù để người chơi không bị thiếu câu do lỗi
        this._appendReplacementSentence(room, player).catch(() => null);

        room.setTimer(async () => {
          if (room.status !== ROOM_STATUS.PLAYING || player.isEliminated) return;
          await this._sendNextSentence(room, player, client);
        }, GAME_CONFIG.PENALTY_DELAY);
      }
    }
  }

  // ─── Classic Mode Completion ───────────────────────────────────────────────

  async _handleClassicCompletion(room, player, client, thread) {
    await thread.send({
      content: `🎉 **TUYỆT VỜI!** Bạn đã hoàn thành tất cả **${room.sentences.length}** câu!\nĐang chờ kết quả round...`,
    });

    // Kết thúc round ngay lập tức
    await this._endRound(room, client);
  }

  // ─── Round End ─────────────────────────────────────────────────────────────

  async _endRound(room, client) {
    // Promise lock — nếu đang chạy thì chờ kết quả cũ, không chạy lại
    if (room._endRoundPromise) return room._endRoundPromise;

    room._endRoundPromise = this._doEndRound(room, client)
      .finally(() => { room._endRoundPromise = null; });

    return room._endRoundPromise;
  }

  async _doEndRound(room, client) {
    // Dừng replenisher trước khi kết thúc round (Timer mode)
    this._stopSentenceReplenisher(room);

    const activePlayers = room.getActivePlayers();
    const loser = room.findLowestScorer();

    if (!loser || activePlayers.length <= 1) {
      // Game over
      await this._endGame(room, client, activePlayers[0]);
      return;
    }

    // Loại người thua round
    loser.isEliminated = true;
    const loserThread = room.playerThreads.get(loser.userId);

    if (loserThread) {
      await loserThread.send({
        content: `💀 **ROUND ${room.currentRound} KẾT THÚC!**\n\nBạn đã bị **LOẠI** khỏi trận vì có số câu ít nhất: **${loser.currentScore} câu**.`,
      });
      await loserThread.setLocked(true).catch(() => null);
      await loserThread.setArchived(true).catch(() => null);
    }

    // Gửi kết quả round cho tất cả thread còn sống
    const leaderboard = [...room.players.values()]
      .sort((a, b) => b.currentScore - a.currentScore)
      .map(p => ({
        username: p.username,
        score: p.currentScore,
        errors: p.errors,
        isEliminated: p.isEliminated,
      }));

    const resultImage = canvasService.renderRoundResult(leaderboard, room.currentRound, loser.username);

    for (const [userId, thread] of room.playerThreads.entries()) {
      const p = room.getPlayer(userId);
      if (p && !p.isEliminated) {
        await thread.send({
          content: `📊 **KẾT QUẢ ROUND ${room.currentRound}** — **${loser.username}** đã bị loại!`,
          files: [resultImage],
        }).catch(() => null);
      }
    }

    // Kiểm tra còn lại bao nhiêu người
    const remainingPlayers = room.getActivePlayers();

    if (remainingPlayers.length === 1) {
      await this._endGame(room, client, remainingPlayers[0]);
    } else {
      // Next round
      room.currentRound += 1;
      room.resetRoundScores();

      // Tăng thời gian Timer mode
      if (room.gameMode === GAME_MODE.TIMER) {
        room.timerRoundDuration += GAME_CONFIG.TIMER_ROUND_INCREMENT;
      }

      // Tải đề mới từ Gemini
      await Promise.all(
        remainingPlayers.map(p =>
          room.playerThreads.get(p.userId)?.send({
            content: `🔄 **ROUND ${room.currentRound} SẮP BẮT ĐẦU!**\nGemini đang tạo bộ đề mới...`,
          }).catch(() => null)
        )
      );

      room.sentences = await geminiService.generateSentences(
        room.gameMode,
        room.settings.minWords,
        room.settings.maxWords
      );

      await this._sendSentenceToAllPlayers(room, client);

      if (room.gameMode === GAME_MODE.TIMER) {
        const channel = await client.channels.fetch(room.lobbyChannelId).catch(() => null);
        if (channel) {
          this._startTimerRound(room, channel, client, room.lobbyMessageId);
        }
      }
    }
  }

  // ─── Timer Mode ────────────────────────────────────────────────────────────

  _startTimerRound(room, channel, client, lobbyMessageId) {
    const duration = room.timerRoundDuration;

    // Countdown update every 30s
    const updateInterval = 30000;
    let elapsed = 0;

    const intervalId = setInterval(async () => {
      elapsed += updateInterval;
      const remaining = duration - elapsed;
      if (remaining <= 0) {
        clearInterval(intervalId);
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);

      for (const [, thread] of room.playerThreads) {
        await thread.send({
          content: `⏱️ **Thời gian còn lại: ${mins}m ${secs}s**`,
        }).catch(() => null);
      }
    }, updateInterval);

    // Sinh câu bù mỗi TIMER_REPLENISH_INTERVAL ms
    this._startSentenceReplenisher(room);

    // Main round timer
    room._roundTimer = setTimeout(async () => {
      clearInterval(intervalId);

      // Dừng replenisher khi round kết thúc
      this._stopSentenceReplenisher(room);

      // Khóa tất cả thread
      for (const [userId, thread] of room.playerThreads.entries()) {
        const p = room.getPlayer(userId);
        if (p && !p.isEliminated) {
          await thread.setLocked(true).catch(() => null);
          await thread.send({ content: '⏰ **HẾT GIỜ! Round kết thúc!**' }).catch(() => null);
          await thread.setLocked(false).catch(() => null);
        }
      }

      await this._endRound(room, client);
    }, duration);
  }

  /**
   * Mỗi TIMER_REPLENISH_INTERVAL ms, sinh thêm TIMER_REPLENISH_COUNT câu bù
   * vào room.sentences để người chơi không bao giờ hết câu trong Timer mode.
   * @param {import('../managers/GlobalRoomManager.js').Room} room
   */
  _startSentenceReplenisher(room) {
    // Dừng replenisher cũ nếu có (phòng bắt đầu round mới)
    this._stopSentenceReplenisher(room);

    room._replenishInterval = setInterval(async () => {
      if (room.status !== ROOM_STATUS.PLAYING) {
        this._stopSentenceReplenisher(room);
        return;
      }

      try {
        const { minWords, maxWords } = room.settings;
        const extras = await geminiService.generateExtraSentences(
          GAME_CONFIG.TIMER_REPLENISH_COUNT,
          minWords,
          maxWords,
        );

        if (extras && extras.length > 0) {
          room.sentences.push(...extras);
          console.log(
            `[GameEngine] Timer replenish: +${extras.length} câu → tổng ${room.sentences.length} câu (phòng ${room.id})`
          );
        }
      } catch (err) {
        console.error('[GameEngine] Sentence replenisher error:', err.message);
      }
    }, GAME_CONFIG.TIMER_REPLENISH_INTERVAL);
  }

  /**
   * Dừng interval sinh câu bù của room.
   * @param {import('../managers/GlobalRoomManager.js').Room} room
   */
  _stopSentenceReplenisher(room) {
    if (room._replenishInterval) {
      clearInterval(room._replenishInterval);
      room._replenishInterval = null;
    }
  }

  // ─── Collector Cleanup ─────────────────────────────────────────────────────

  _stopAllCollectors(guildId) {
    const collectorMap = this._activeCollectors.get(guildId);
    if (!collectorMap) return;
    for (const collector of collectorMap.values()) {
      try { collector.stop('game_ended'); } catch { /* ignore */ }
    }
    this._activeCollectors.delete(guildId);
  }

  // ─── Game End ──────────────────────────────────────────────────────────────

  async _endGame(room, client, winner) {
    if (!winner) return;

    // Dọn toàn bộ collectors trước — tránh memory leak
    this._stopAllCollectors(room.id);

    winner.wins += 1;

    // Gửi thông báo chiến thắng
    const winEmbed = buildGameOverEmbed(winner, room);

    for (const [, thread] of room.playerThreads.entries()) {
      await thread.send({ embeds: [winEmbed] }).catch(() => null);
      // Chờ 3 giây để người chơi đọc kết quả, sau đó xóa thread
      await new Promise(r => setTimeout(r, 3000));
      await thread.delete('Game ended - auto cleanup').catch(() => null);
    }

    // Gửi vào channel chính
    const channel = await client.channels.fetch(room.lobbyChannelId).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [winEmbed] }).catch(() => null);
    }

    // Dọn dẹp và xóa phòng
    room.cleanup();
    const promotedRoom = roomManager.deleteRoom(room.id);

    // Nếu có phòng được promote từ queue, cập nhật tin nhắn của nó
    if (promotedRoom) {
      await this._promoteQueuedRoom(promotedRoom, client);
    }
  }

  // ─── Câu Bù Khi Lỗi ──────────────────────────────────────────────────────────

  /**
   * Thêm câu bù vào danh sách câu của room khi một người chơi bị skip câu do lỗi.
   * Đảm bảo người chơi đó vẫn có đủ số câu cần hoàn thành.
   * @param {object} room
   * @param {object} player
   */
  async _appendReplacementSentence(room, player) {
    try {
      // Số câu còn lại người chơi chưa làm (từ index hiện tại đến cuối)
      const remaining = room.sentences.length - player.currentSentenceIndex;
      // Chỉ sinh bù nếu người chơi sẽ thiếu câu
      if (remaining >= 1) return;

      const { minWords, maxWords } = room.settings;
      const extras = await geminiService.generateExtraSentences(1, minWords, maxWords);
      if (extras && extras.length > 0) {
        room.sentences.push(...extras);
        console.log(`[GameEngine] Đã thêm ${extras.length} câu bù cho phòng ${room.id}`);
      }
    } catch (err) {
      console.error('[GameEngine] _appendReplacementSentence error:', err.message);
    }
  }

    // ─── Anti-Cheat Actions ────────────────────────────────────────────────────

  async _kickForCheating(room, player, thread, wpm, client) {
    player.isEliminated = true;

    await thread.send({
      content:
        `🚨 **PHÁT HIỆN GIAN LẬN!**\n\n` +
        `Tốc độ gõ của bạn là **${wpm} WPM** — vượt giới hạn con người (**${GAME_CONFIG.MAX_WPM} WPM**) **${GAME_CONFIG.CHEAT_CONSECUTIVE_VIOLATIONS} lần liên tiếp**.\n\n` +
        `💀 Bạn đã bị **KICK** với lý do: *Phát hiện hành vi Auto-Clicker / Macro gửi tin nhắn tự động.*`,
    });

    await thread.setLocked(true).catch(() => null);
    await thread.setArchived(true).catch(() => null);

    await this._notifyElimination(room, player, client, '🚨 Bị kick vì gian lận (WPM bất thường)');
    await this._checkGameEnd(room, client);
  }

  async _notifyElimination(room, player, client, reason) {
    const channel = await client.channels.fetch(room.lobbyChannelId).catch(() => null);
    if (channel) {
      await channel.send({
        embeds: [buildEliminationEmbed(player, reason)],
      }).catch(() => null);
    }
  }

  async _checkGameEnd(room, client) {
    const active = room.getActivePlayers();
    if (active.length <= 1) {
      await this._endGame(room, client, active[0]);
    }
  }

  // ─── Queue Promotion ───────────────────────────────────────────────────────

  async _promoteQueuedRoom(room, client) {
    try {
      const channel = await client.channels.fetch(room.lobbyChannelId).catch(() => null);
      if (!channel) return;

      const lobbyMsg = await channel.messages.fetch(room.lobbyMessageId).catch(() => null);
      if (!lobbyMsg) return;

      const { buildLobbyEmbed } = await import('../utils/EmbedBuilders.js');
      await lobbyMsg.edit(buildLobbyEmbed(room));

      await channel.send({
        content: `🎉 <@${room.hostId}> Phòng **${room.roomName}** đã được kích hoạt từ hàng đợi! Slot đã sẵn sàng.`,
      });
    } catch (error) {
      console.error('[GameEngine] Failed to promote queued room:', error);
    }
  }
}

export const gameEngine = new GameEngine();
