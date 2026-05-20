// src/components/modals.js
import { roomManager } from '../managers/GlobalRoomManager.js';
import { buildLobbyEmbed } from '../utils/EmbedBuilders.js';
import { GAME_CONFIG } from '../config/constants.js';

// ─── Words Config Modal ────────────────────────────────────────────────────────

export async function handleWordsModal(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const minWords = parseInt(interaction.fields.getTextInputValue('min_words'));
  const maxWords = parseInt(interaction.fields.getTextInputValue('max_words'));

  // Validation
  if (isNaN(minWords) || isNaN(maxWords)) {
    return interaction.reply({ content: '❌ Vui lòng nhập số hợp lệ!', ephemeral: true });
  }

  if (minWords < GAME_CONFIG.MIN_WORDS_FLOOR) {
    return interaction.reply({
      content: `❌ Số từ tối thiểu không được nhỏ hơn **${GAME_CONFIG.MIN_WORDS_FLOOR}**!`,
      ephemeral: true,
    });
  }

  if (maxWords > GAME_CONFIG.MAX_WORDS_CEILING) {
    return interaction.reply({
      content: `❌ Số từ tối đa không được lớn hơn **${GAME_CONFIG.MAX_WORDS_CEILING}**!`,
      ephemeral: true,
    });
  }

  if (minWords > maxWords) {
    return interaction.reply({
      content: '❌ **Số từ tối thiểu không được lớn hơn số từ tối đa!**',
      ephemeral: true,
    });
  }

  room.settings.minWords = minWords;
  room.settings.maxWords = maxWords;

  // Cập nhật lobby embed
  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.reply({
    content: `✅ Đã cập nhật: Tối thiểu **${minWords}** từ - Tối đa **${maxWords}** từ/câu.`,
    ephemeral: true,
  });
}

// ─── Password Modal ────────────────────────────────────────────────────────────

export async function handlePasswordModal(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const password = interaction.fields.getTextInputValue('password_input').trim();

  if (password === '') {
    room.settings.password = null;
    const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
    if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));
    return interaction.reply({ content: '🔓 Mật khẩu đã được **xóa**. Phòng giờ là công khai.', ephemeral: true });
  }

  room.settings.password = password;

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.reply({ content: `🔒 Đã đặt mật khẩu phòng thành công!`, ephemeral: true });
}

// ─── Rename Modal ──────────────────────────────────────────────────────────────

export async function handleRenameModal(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room || interaction.user.id !== room.hostId) {
    return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
  }

  const newName = interaction.fields.getTextInputValue('new_name').trim();

  if (!newName) {
    return interaction.reply({ content: '❌ Tên phòng không được để trống!', ephemeral: true });
  }

  const oldName = room.roomName;
  room.roomName = newName;

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.reply({
    content: `✅ Đã đổi tên phòng: **${oldName}** → **${newName}**`,
    ephemeral: true,
  });
}

// ─── Join Password Modal ───────────────────────────────────────────────────────

export async function handleJoinPasswordModal(interaction) {
  const room = roomManager.getRoom(interaction.guildId);
  if (!room) {
    return interaction.reply({ content: '❌ Phòng không tồn tại.', ephemeral: true });
  }

  const inputPassword = interaction.fields.getTextInputValue('password_input');

  if (inputPassword !== room.settings.password) {
    return interaction.reply({ content: '❌ **Mật khẩu sai!** Vui lòng thử lại.', ephemeral: true });
  }

  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (room.players.has(userId)) {
    return interaction.reply({ content: '⚠️ Bạn đã ở trong phòng này rồi!', ephemeral: true });
  }

  const success = room.addPlayer(userId, username);

  if (!success) {
    return interaction.reply({ content: '❌ Phòng đã đầy!', ephemeral: true });
  }

  const lobbyMsg = await interaction.channel.messages.fetch(room.lobbyMessageId).catch(() => null);
  if (lobbyMsg) await lobbyMsg.edit(buildLobbyEmbed(room));

  await interaction.reply({ content: `✅ Đã tham gia phòng **${room.roomName}**!`, ephemeral: true });
}
