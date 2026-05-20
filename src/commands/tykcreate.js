// src/commands/tykcreate.js
import { SlashCommandBuilder } from 'discord.js';
import { roomManager } from '../managers/GlobalRoomManager.js';
import { buildLobbyEmbed, buildQueueEmbed } from '../utils/EmbedBuilders.js';
import { GAME_MODE } from '../config/constants.js';

export const data = new SlashCommandBuilder()
  .setName('tykcreate')
  .setDescription('Tạo phòng chơi Battle Royale "Type Your Keyboard!!!"')
  .addStringOption(opt =>
    opt.setName('tenphong')
      .setDescription('Tên phòng chơi của bạn')
      .setRequired(true)
      .setMaxLength(50)
  )
  .addStringOption(opt =>
    opt.setName('cheodo')
      .setDescription('Chế độ chơi')
      .setRequired(true)
      .addChoices(
        { name: 'Classic - Chạy đua số câu', value: GAME_MODE.CLASSIC },
        { name: 'Timer - Đếm ngược thời gian', value: GAME_MODE.TIMER },
      )
  );

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const roomName = interaction.options.getString('tenphong');
  const gameMode = interaction.options.getString('cheodo');
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Kiểm tra server đã có phòng chưa
  if (roomManager.hasRoom(guildId)) {
    return interaction.reply({
      content: '❌ **Mỗi server chỉ được tạo tối đa 1 phòng chơi!**\nPhòng hiện tại phải kết thúc hoặc bị hủy trước khi tạo phòng mới.',
      ephemeral: true,
    });
  }

  // Tạo phòng
  const { room, isQueued } = roomManager.createRoom(guildId, roomName, userId, username, gameMode);

  // Thêm host vào phòng
  room.addPlayer(userId, username);

  if (isQueued) {
    // Hệ thống đang đầy -> gửi embed Queue
    const response = buildQueueEmbed(room);
    const msg = await interaction.reply({ ...response, fetchReply: true });

    // Lưu message ID để cập nhật sau
    room.lobbyMessageId = msg.id;
    room.lobbyChannelId = interaction.channelId;
  } else {
    // Slot trống -> gửi embed Lobby
    const response = buildLobbyEmbed(room);
    const msg = await interaction.reply({ ...response, fetchReply: true });

    room.lobbyMessageId = msg.id;
    room.lobbyChannelId = interaction.channelId;
  }
}
