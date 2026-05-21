// src/handlers/InteractionHandler.js
import { CUSTOM_IDS } from '../config/constants.js';
import {
  handleJoin,
  handleLeave,
  handleStart,
  handleConfig,
  handleMaxPlayersSelect,
  handleGameModeToggle,
  handleHardcoreToggle,
  handleFastModeToggle,
  handleWordsInput,
  handleKickButton,
  handleKickSelect,
  handlePasswordButton,
  handleRenameButton,
  handleCancelRoom,
  handleConfigPageNav,
} from '../components/lobbyButtons.js';
import {
  handleWordsModal,
  handlePasswordModal,
  handleRenameModal,
  handleJoinPasswordModal,
} from '../components/modals.js';

/**
 * Main interaction router - điều phối tất cả interactions
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Collection} commands
 */
export async function handleInteraction(interaction, commands) {
  try {
    // ── Slash Commands ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // ── Button Interactions ─────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId } = interaction;

      switch (customId) {
        case CUSTOM_IDS.JOIN:        return handleJoin(interaction);
        case CUSTOM_IDS.LEAVE:       return handleLeave(interaction);
        case CUSTOM_IDS.START:       return handleStart(interaction);
        case CUSTOM_IDS.CONFIG:      return handleConfig(interaction);
        case CUSTOM_IDS.CFG_HARDCORE:  return handleHardcoreToggle(interaction);
        case CUSTOM_IDS.CFG_GAMEMODE:  return handleGameModeToggle(interaction);
        case CUSTOM_IDS.CFG_FASTMODE:  return handleFastModeToggle(interaction);
        case CUSTOM_IDS.CFG_WORDS_INPUT: return handleWordsInput(interaction);
        case CUSTOM_IDS.CFG_KICK:    return handleKickButton(interaction);
        case CUSTOM_IDS.CFG_PASSWORD: return handlePasswordButton(interaction);
        case CUSTOM_IDS.CFG_RENAME:  return handleRenameButton(interaction);
        case CUSTOM_IDS.CFG_CANCEL:  return handleCancelRoom(interaction);
        case CUSTOM_IDS.CFG_PAGE_PREV: return handleConfigPageNav(interaction, 'prev');
        case CUSTOM_IDS.CFG_PAGE_NEXT: return handleConfigPageNav(interaction, 'next');
      }
      return;
    }

    // ── Select Menu Interactions ────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const { customId } = interaction;

      switch (customId) {
        case CUSTOM_IDS.CFG_MAXPLAYERS: return handleMaxPlayersSelect(interaction);
      }
      return;
    }

    if (interaction.isUserSelectMenu()) {
      const { customId } = interaction;

      switch (customId) {
        case CUSTOM_IDS.CFG_KICK_SELECT: return handleKickSelect(interaction);
      }
      return;
    }

    // ── Modal Submissions ───────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      switch (customId) {
        case CUSTOM_IDS.WORDS_MODAL:        return handleWordsModal(interaction);
        case CUSTOM_IDS.PASSWORD_MODAL:     return handlePasswordModal(interaction);
        case CUSTOM_IDS.RENAME_MODAL:       return handleRenameModal(interaction);
        case CUSTOM_IDS.JOIN_PASSWORD_MODAL: return handleJoinPasswordModal(interaction);
      }
      return;
    }

  } catch (error) {
    console.error('[InteractionHandler] Unhandled error:', error);

    const errorMsg = { content: '❌ Đã xảy ra lỗi. Vui lòng thử lại!', ephemeral: true };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMsg);
      } else {
        await interaction.reply(errorMsg);
      }
    } catch {
      // Bỏ qua nếu không thể reply
    }
  }
}
