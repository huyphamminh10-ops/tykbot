// src/utils/EmbedBuilder.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { COLORS, CUSTOM_IDS, ROOM_STATUS } from '../config/constants.js';

// ─── Lobby Embed ─────────────────────────────────────────────────────────────

/**
 * Tạo Embed Lobby chính
 * @param {import('../managers/GlobalRoomManager.js').Room} room
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
export function buildLobbyEmbed(room) {
  const playerList = buildPlayerList(room);
  const activeCount = [...room.players.values()].filter(p => !p.isEliminated).length;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setAuthor({ name: '⌨  Type your Keyboard!!!' })
    .setTitle(`🏠 Phòng: ${room.roomName}`)
    .setDescription(`**Host:** <@${room.hostId}>`)
    .addFields(
      {
        name: '🎮 Chế độ chơi',
        value: `**${room.gameMode}** | Tình trạng: ${room.settings.isHardcore ? '☠️ **Hardcore**' : '🟢 Cơ bản'}`,
        inline: true,
      },
      {
        name: '⚙️ Cấu hình chữ',
        value: `Tối thiểu **${room.settings.minWords}** từ - Tối đa **${room.settings.maxWords}** từ/câu`,
        inline: true,
      },
      {
        name: `👥 Danh sách người chơi (${activeCount}/${room.settings.maxPlayers})`,
        value: playerList || '*Chưa có ai tham gia*',
        inline: false,
      },
    )
    .setFooter({
      text: room.settings.isFastMode
        ? '⚡ Fast Mode: 2s giữa các câu'
        : '⏱️ Normal Mode: 5s giữa các câu',
    })
    .setTimestamp();

  if (room.settings.password) {
    embed.addFields({ name: '🔒 Trạng thái', value: 'Phòng có mật khẩu', inline: true });
  }

  const components = buildLobbyButtons(room.status === ROOM_STATUS.LOADING);
  return { embeds: [embed], components };
}

/**
 * Tạo Embed khi đang trong Queue
 * @param {import('../managers/GlobalRoomManager.js').Room} room
 */
export function buildQueueEmbed(room) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setAuthor({ name: '⌨  Type your Keyboard!!!' })
    .setTitle('⚠️ HỆ THỐNG ĐANG QUÁ TẢI')
    .setDescription(
      'Tất cả 150 slot phòng toàn cầu đã kín.\nPhòng của bạn đã được đưa vào **hàng đợi**.'
    )
    .addFields(
      { name: '🏠 Tên phòng', value: room.roomName, inline: true },
      { name: '🎮 Chế độ', value: room.gameMode, inline: true },
      { name: '📍 Vị trí xếp hàng', value: `**#${room.queuePosition}**`, inline: true },
    )
    .setFooter({ text: 'Phòng sẽ tự động kích hoạt khi có slot trống.' })
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

/**
 * Tạo Embed Loading khi Gemini đang sinh đề
 * @param {import('../managers/GlobalRoomManager.js').Room} room
 */
export function buildLoadingEmbed(room) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.LOADING)
    .setAuthor({ name: '⌨  Type your Keyboard!!!' })
    .setTitle(`🤖 Đang khởi tạo bộ đề...`)
    .setDescription(
      `**Gemini AI** đang tạo **${room.gameMode === 'Timer' ? 100 : 50} câu** ngẫu nhiên...\n\n` +
      '🔄 Vui lòng chờ, quá trình này mất khoảng 10-20 giây.'
    )
    .setFooter({ text: 'Các nút bấm đã bị vô hiệu hóa trong thời gian tải.' })
    .setTimestamp();

  return { embeds: [embed], components: buildLobbyButtons(true) };
}

// ─── Config Menu Embeds ────────────────────────────────────────────────────────

/**
 * Tạo Config Menu theo trang
 * @param {import('../managers/GlobalRoomManager.js').Room} room
 * @param {number} page - 1..4
 */
export function buildConfigEmbed(room, page = 1) {
  const TOTAL_PAGES = 5;
  const pages = {
    1: buildConfigPageGameMode(room),
    2: buildConfigPage1(room),
    3: buildConfigPage2(room),
    4: buildConfigPage3(room),
    5: buildConfigPage4(room),
  };

  const { embed, components: pageComponents } = pages[page] || pages[1];

  // Navigation: 2 button rõ ràng, label page ở giữa dưới dạng disabled
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_PAGE_PREV)
      .setLabel('◀ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId('tyk_cfg_noop')
      .setLabel(`${page} / ${TOTAL_PAGES}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_PAGE_NEXT)
      .setLabel('Tiếp ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= TOTAL_PAGES),
  );

  return { embeds: [embed], components: [...pageComponents, navRow] };
}

// ─── Mô tả chế độ chơi ────────────────────────────────────────────────────────

function getGameModeDescription(gameMode, isHardcore) {
  if (gameMode === 'Classic') {
    if (isHardcore) {
      return (
        '**Classic - Hardcore**\n' +
        'Ai viết xong **50 câu** đầu tiên sẽ thắng.\n' +
        'KHÔNG CHỪA CHỖ cho bất kì sai lầm nào — sai 1 câu là loại ngay!'
      );
    } else {
      return (
        '**Classic - Cơ bản**\n' +
        'Ai viết xong **50 câu** đầu tiên sẽ thắng.\n' +
        'Có **5 lượt sai** — viết sai sẽ mất 5 giây chuyển sang câu tiếp theo.'
      );
    }
  } else {
    if (isHardcore) {
      return (
        '**Timer - Hardcore**\n' +
        'Ai gõ được **nhiều câu nhất** trong thời gian quy định sẽ thắng.\n' +
        'KHÔNG CHỪA CHỖ cho bất kì sai lầm nào — sai 1 câu là loại ngay!'
      );
    } else {
      return (
        '**Timer - Cơ bản**\n' +
        'Ai gõ được **nhiều câu nhất** trong thời gian quy định sẽ thắng.\n' +
        'Có **5 lượt sai** — viết sai sẽ mất 5 giây chuyển sang câu tiếp theo.'
      );
    }
  }
}

function buildConfigPageGameMode(room) {
  const isClassic = room.gameMode === 'Classic';
  const embed = new EmbedBuilder()
    .setColor(COLORS.SECONDARY)
    .setTitle('⚙️ Cấu Hình Phòng - Trang 1: Chế độ chơi')
    .addFields(
      {
        name: isClassic ? '🎯 Classic (đang chọn)' : '🎯 Classic',
        value: '50 câu — ai xong trước thắng.',
        inline: true,
      },
      {
        name: isClassic ? '⏱️ Timer' : '⏱️ Timer (đang chọn)',
        value: 'Đếm ngược thời gian — ai gõ nhiều nhất thắng.',
        inline: true,
      },
      {
        name: '📖 Mô tả hiện tại',
        value: getGameModeDescription(room.gameMode, room.settings.isHardcore),
        inline: false,
      },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_GAMEMODE)
      .setLabel(isClassic ? '🔄 Chuyển sang Timer' : '🔄 Chuyển sang Classic')
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, components: [row] };
}

function buildConfigPage1(room) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SECONDARY)
    .setTitle('⚙️ Cấu Hình Phòng - Trang 2: Số lượng người chơi')
    .setDescription(`Hiện tại: **${room.settings.maxPlayers} người tối đa**`);

  const options = [];
  for (let i = 3; i <= 15; i++) {
    options.push({
      label: `${i} người chơi`,
      value: `${i}`,
      description: i === 15 ? 'Tối đa' : i === 3 ? 'Tối thiểu' : undefined,
      default: room.settings.maxPlayers === i,
    });
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_IDS.CFG_MAXPLAYERS)
      .setPlaceholder('Chọn số người chơi tối đa...')
      .addOptions(options)
  );

  return { embed, components: [selectRow] };
}

function buildConfigPage2(room) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SECONDARY)
    .setTitle('⚙️ Cấu Hình Phòng - Trang 3: Chế độ đặc biệt')
    .addFields(
      {
        name: '☠️ Hardcore Mode',
        value: room.settings.isHardcore
          ? '✅ **BẬT** - Sai 1 câu bị loại ngay!'
          : '❌ **TẮT** - Cho phép sai tối đa 5 lỗi.',
        inline: true,
      },
      {
        name: '⚡ Fast Mode',
        value: room.settings.isFastMode
          ? '✅ **BẬT** - 2 giây giữa các câu.'
          : '❌ **TẮT** - 5 giây giữa các câu.',
        inline: true,
      },
      {
        name: '📖 Mô tả chế độ hiện tại',
        value: getGameModeDescription(room.gameMode, room.settings.isHardcore),
        inline: false,
      },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_HARDCORE)
      .setLabel(room.settings.isHardcore ? '☠️ Hardcore: BẬT' : '☠️ Hardcore: TẮT')
      .setStyle(room.settings.isHardcore ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_FASTMODE)
      .setLabel(room.settings.isFastMode ? '⚡ Fast Mode: BẬT' : '⚡ Fast Mode: TẮT')
      .setStyle(room.settings.isFastMode ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return { embed, components: [row] };
}

function buildConfigPage3(room) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SECONDARY)
    .setTitle('⚙️ Cấu Hình Phòng - Trang 4: Độ dài câu đố')
    .addFields({
      name: '📏 Cấu hình hiện tại',
      value: `Tối thiểu: **${room.settings.minWords}** từ\nTối đa: **${room.settings.maxWords}** từ`,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_WORDS_INPUT)
      .setLabel('📝 Nhập số lượng từ')
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, components: [row] };
}

function buildConfigPage4(room) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SECONDARY)
    .setTitle('⚙️ Cấu Hình Phòng - Trang 5: Quản trị phòng')
    .setDescription('Các công cụ quản lý dành cho Host.');

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_KICK)
      .setLabel('👢 Kick Người Chơi')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_PASSWORD)
      .setLabel(room.settings.password ? '🔓 Đổi/Xóa Mật Khẩu' : '🔒 Đặt Mật Khẩu')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_RENAME)
      .setLabel('✏️ Đổi Tên Phòng')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CFG_CANCEL)
      .setLabel('🗑️ HỦY PHÒNG')
      .setStyle(ButtonStyle.Danger),
  );

  return { embed, components: [row1, row2] };
}

// ─── Game Over / Win Embeds ──────────────────────────────────────────────────

export function buildGameOverEmbed(winner, room) {
  return new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('🏆 TRẬN ĐẤU KẾT THÚC!')
    .setDescription(
      `🎉 **NHÀ VÔ ĐỊCH CHUNG CUỘC:**\n\n` +
      `# 👑 ${winner.username}\n\n` +
      `*Chiến thắng ${room.currentRound} round liên tiếp!*`
    )
    .addFields(
      { name: '🎮 Phòng', value: room.roomName, inline: true },
      { name: '📊 Chế độ', value: room.gameMode, inline: true },
      { name: '🏅 Tổng wins', value: `${winner.wins + 1}`, inline: true },
    )
    .setTimestamp();
}

export function buildEliminationEmbed(eliminatedPlayer, reason) {
  return new EmbedBuilder()
    .setColor(COLORS.DANGER)
    .setTitle('💀 THÔNG BÁO LOẠI NGƯỜI CHƠI')
    .setDescription(
      `**${eliminatedPlayer.username}** đã bị loại khỏi trận!\n\n` +
      `> ${reason}`
    )
    .setTimestamp();
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function buildPlayerList(room) {
  if (room.players.size === 0) return null;

  const lines = [];
  let index = 1;

  for (const player of room.players.values()) {
    const isHost = player.userId === room.hostId;
    const hostBadge = isHost ? ' 👑' : '';
    const elimBadge = player.isEliminated ? '~~' : '';

    lines.push(
      `${index}. ${elimBadge}<@${player.userId}>${elimBadge}${hostBadge} — 🏆 ${player.wins} Trận thắng`
    );
    index++;
  }

  return lines.join('\n');
}

function buildLobbyButtons(disabled = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.JOIN)
      .setLabel('✅ Tham Gia')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.LEAVE)
      .setLabel('🚪 Thoát')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.START)
      .setLabel('▶️ BẮT ĐẦU TRẬN ĐẤU')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.CONFIG)
      .setLabel('⚙️ Cấu Hình Phòng')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  return [row1, row2, row3];
}
