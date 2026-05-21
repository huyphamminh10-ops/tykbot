// src/components/lobbyButtons.js
import {
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { roomManager } from '../managers/GlobalRoomManager.js';
import { gameEngine } from '../services/GameEngine.js';
import { buildLobbyEmbed, buildConfigEmbed } from '../utils/EmbedBuilders.js';
import { CUSTOM_IDS, ROOM_STATUS } from '../config/constants.js';


// ─── Helper: lấy page hiện tại từ message ────────────────────────────────────

function getCurrentPage(interaction) {
  // Indicator button có label dạng "X / 5" — parse từ đó
  for (const row of interaction.message.components) {
    for (const btn of row.components) {
      const match = btn.label?.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) return parseInt(match[1]);
    }
  }
  return 1;
}

// ─── Join Button ─────────────────────────────────────────────────────────────

export async function handleJoin(interaction) {
  const room = roomManager.getRoom(interaction.guildId);

  if (!room || room.status !== ROOM_STATUS.LOBBY) {
    return interaction.reply({ content: '❌ Phòng không tồn tại hoặc đang trong trạng thái không thể tham gia.', ephemeral: true });
  }

  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (room.players.has(userId)) {
    return interaction.reply({ content: '⚠️ Bạn đã ở trong phòng này rồi!', ephemeral: true });
  }

  // Kiểm tra mật khẩu
  if (room.settings.password) {
    const modal = new ModalBuilder()
      .setCustomId(CUSTOM_IDS.JOIN_PASSWORD_MODAL)
      .setTitle('🔒 Phòng có mật khẩu')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('password_input')
            .setLabel('Nhập mật khẩu phòng')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Mật khẩu...')
        )
      );
    return interaction.showModal(modal);
  }

  const success = room.addPlayer(userId, username);

  if (!success) {
    return interaction.reply({ content: '❌ Phòng đã đầy!', ephemeral: true });
  }

  // Cập nhật embed lobby
  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.reply({ content: `✅ **${username}** đã tham gia phòng **${room.roomName}**!`, ephemeral: true });
}

// ─── Leave Button ─────────────────────────────────────────────────────────────

export async function handleLeave(interaction) {
  const room = roomManager.getRoom(interaction.guildId);

  if (!room) {
    return interaction.reply({ content: '❌ Không tìm thấy phòng.', ephemeral: true });
  }

  const userId = interaction.user.id;

  if (!room.players.has(userId)) {
    return interaction.reply({ content: '⚠️ Bạn không ở trong phòng này.', ephemeral: true });
  }

  // Nếu host rời -> hủy phòng
  if (userId === room.hostId) {
    return interaction.reply({ content: '⚠️ Bạn là Host! Hãy dùng **⚙️ Cấu Hình Phòng → HỦY PHÒNG** để hủy phòng.', ephemeral: true });
  }

  room.removePlayer(userId);

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.reply({ content: `👋 Bạn đã rời phòng **${room.roomName}**.`, ephemeral: true });
}

// ─── Start Button ─────────────────────────────────────────────────────────────

export async function handleStart(interaction) {
  const room = roomManager.getRoom(interaction.guildId);

  if (!room || room.status !== ROOM_STATUS.LOBBY) {
    return interaction.reply({ content: '❌ Phòng không ở trạng thái LOBBY.', ephemeral: true });
  }

  // Chỉ host mới được bắt đầu
  if (interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '🚫 **Chỉ có Host mới có quyền bắt đầu!**', ephemeral: true });
  }

  const activePlayers = room.getActivePlayers();

  if (activePlayers.length < 2) {
    return interaction.reply({ content: '❌ Cần ít nhất **2 người chơi** để bắt đầu!', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  // Khởi động game engine
  gameEngine.startGame(room, interaction.channel, interaction.client, room.lobbyMessageId)
    .catch(err => console.error('[handleStart] GameEngine error:', err));

  await interaction.editReply({ content: '🚀 Trận đấu đang được khởi tạo...' });
}

// ─── Config Button ────────────────────────────────────────────────────────────

export async function handleConfig(interaction) {
  const room = roomManager.getRoom(interaction.guildId);

  if (!room) {
    return interaction.reply({ content: '❌ Không tìm thấy phòng.', ephemeral: true });
  }

  if (interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '🚫 **Chỉ Host mới có quyền cấu hình phòng!**', ephemeral: true });
  }

  // Lưu page vào interaction customId context
  const configUI = buildConfigEmbed(room, 1);
  await interaction.reply({ ...configUI, ephemeral: true });
}

// ─── Config: Max Players Select ───────────────────────────────────────────────

export async function handleMaxPlayersSelect(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const selected = parseInt(interaction.values[0]);
  room.settings.maxPlayers = selected;

  // Cập nhật lobby embed chính
  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  // Cập nhật lại config embed
  await interaction.update(buildConfigEmbed(room, getCurrentPage(interaction)));
}

// ─── Config: Game Mode Toggle ─────────────────────────────────────────────────

export async function handleGameModeToggle(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  room.gameMode = room.gameMode === 'Classic' ? 'Timer' : 'Classic';

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.update(buildConfigEmbed(room, getCurrentPage(interaction)));
}

// ─── Config: Hardcore Toggle ─────────────────────────────────────────────────

export async function handleHardcoreToggle(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  room.settings.isHardcore = !room.settings.isHardcore;

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.update(buildConfigEmbed(room, getCurrentPage(interaction)));
}

// ─── Config: Fast Mode Toggle ─────────────────────────────────────────────────

export async function handleFastModeToggle(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  room.settings.isFastMode = !room.settings.isFastMode;

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.update(buildConfigEmbed(room, getCurrentPage(interaction)));
}

// ─── Config: Word Count Button (Open Modal) ───────────────────────────────────

export async function handleWordsInput(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.WORDS_MODAL)
    .setTitle('📏 Cấu hình độ dài câu')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('min_words')
          .setLabel('Số từ tối thiểu (4 - 24)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(room.settings.minWords))
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('max_words')
          .setLabel('Số từ tối đa (4 - 24)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(room.settings.maxWords))
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2)
      ),
    );

  await interaction.showModal(modal);
}

// ─── Config: Kick Button (Open User Select) ───────────────────────────────────

export async function handleKickButton(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(CUSTOM_IDS.CFG_KICK_SELECT)
      .setPlaceholder('Chọn người chơi cần kick...')
      .setMinValues(1)
      .setMaxValues(1)
  );

  await interaction.reply({
    content: '👢 Chọn người chơi bạn muốn kick khỏi phòng:',
    components: [row],
    ephemeral: true,
  });
}

// ─── Config: Kick Select ──────────────────────────────────────────────────────

export async function handleKickSelect(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const targetId = interaction.values[0];

  if (targetId === room.hostId) {
    return interaction.reply({ content: '❌ Bạn không thể kick chính mình!', ephemeral: true });
  }

  const target = room.getPlayer(targetId);
  if (!target) {
    return interaction.reply({ content: '❌ Người này không ở trong phòng!', ephemeral: true });
  }

  room.removePlayer(targetId);

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.update({
    content: `✅ Đã kick **${target.username}** khỏi phòng.`,
    components: [],
  });
}

// ─── Config: Password Button ──────────────────────────────────────────────────

export async function handlePasswordButton(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.PASSWORD_MODAL)
    .setTitle('🔒 Đặt mật khẩu phòng')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('password_input')
          .setLabel('Mật khẩu (để trống = xóa mật khẩu)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(20)
          .setPlaceholder(room.settings.password ? 'Mật khẩu hiện tại: ****' : 'Nhập mật khẩu mới...')
      )
    );

  await interaction.showModal(modal);
}

// ─── Config: Rename Button ────────────────────────────────────────────────────

export async function handleRenameButton(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.RENAME_MODAL)
    .setTitle('✏️ Đổi tên phòng')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_name')
          .setLabel('Tên phòng mới')
          .setStyle(TextInputStyle.Short)
          .setValue(room.roomName)
          .setRequired(true)
          .setMaxLength(50)
      )
    );

  await interaction.showModal(modal);
}

// ─── Config: Cancel Room ──────────────────────────────────────────────────────

export async function handleCancelRoom(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  // Gửi DM yêu cầu xác nhận
  try {
    const dmChannel = await interaction.user.createDM();

    await dmChannel.send({
      content:
        `⚠️ **XÁC NHẬN HỦY PHÒNG**\n\n` +
        `Để xác nhận xóa phòng **${room.roomName}**, hãy gõ lại chính xác tên phòng trong vòng **30 giây**:\n\n` +
        `\`\`\`\n${room.roomName}\n\`\`\``,
    });

    await interaction.reply({ content: '📩 Kiểm tra DM của bạn để xác nhận hủy phòng!', ephemeral: true });

    // Collector lắng nghe DM
    const filter = (msg) => !msg.author.bot;
    const collector = dmChannel.createMessageCollector({
      filter,
      time: 30000,
      max: 5,
    });

    collector.on('collect', async (msg) => {
      if (msg.content.trim() === room.roomName) {
        collector.stop('confirmed');

        // Xóa phòng
        room.cleanup();
        const promoted = roomManager.deleteRoom(room.id);

        // Cập nhật lobby message
        const channel = interaction.channel;
        const lobbyMsg = await channel.messages.fetch(room.lobbyMessageId).catch(() => null);

        if (lobbyMsg) {
          await lobbyMsg.edit({
            content: '🗑️ **Phòng đã bị hủy bởi Host.**',
            embeds: [],
            components: [],
          });
        }

        await dmChannel.send('✅ Phòng đã được hủy thành công!');

        // Promote queue nếu có
        if (promoted) {
          const ch = await interaction.client.channels.fetch(promoted.lobbyChannelId).catch(() => null);
          const lMsg = await ch?.messages.fetch(promoted.lobbyMessageId).catch(() => null);
          if (lMsg) {
            const { buildLobbyEmbed } = await import('../utils/EmbedBuilders.js');
            await lMsg.edit(buildLobbyEmbed(promoted));
            await ch.send(`🎉 <@${promoted.hostId}> Phòng **${promoted.roomName}** đã được kích hoạt từ hàng đợi!`);
          }
        }
      } else {
        await dmChannel.send('❌ Tên phòng không khớp. Hãy thử lại hoặc đợi hết thời gian.');
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'confirmed') {
        dmChannel.send('⏰ Hết thời gian xác nhận. Phòng không bị hủy.');
      }
    });

  } catch (error) {
    await interaction.reply({
      content: '❌ Không thể gửi DM cho bạn. Hãy mở DM từ server này và thử lại.',
      ephemeral: true,
    });
  }
}

// ─── Config: Page Navigation ──────────────────────────────────────────────────

export async function handleConfigPageNav(interaction, direction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  // Extract current page từ indicator button label dạng "X / 5"
  let currentPage = 1;
  for (const row of interaction.message.components) {
    for (const btn of row.components) {
      const match = btn.label?.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) { currentPage = parseInt(match[1]); break; }
    }
  }

  const newPage = direction === 'next'
    ? Math.min(currentPage + 1, 5)
    : Math.max(currentPage - 1, 1);

  await interaction.update(buildConfigEmbed(room, newPage));
}
