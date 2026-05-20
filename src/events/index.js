// src/events/index.js
import { Events } from 'discord.js';
import { handleInteraction } from '../handlers/InteractionHandler.js';

/**
 * Đăng ký tất cả event handlers lên Discord Client
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Collection} commands
 */
export function registerEvents(client, commands) {

  // ── Ready Event ───────────────────────────────────────────────────────────
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  ⌨  TYPE YOUR KEYBOARD!!!  BOT READY    ║`);
    console.log(`╠══════════════════════════════════════════╣`);
    console.log(`║  Logged in as: ${readyClient.user.tag.padEnd(26)}║`);
    console.log(`║  Guilds: ${String(readyClient.guilds.cache.size).padEnd(32)}║`);
    console.log(`╚══════════════════════════════════════════╝\n`);

    // Set bot presence
    readyClient.user.setPresence({
      activities: [{ name: '⌨  Type your Keyboard!!!', type: 0 }],
      status: 'online',
    });
  });

  // ── Interaction Create ────────────────────────────────────────────────────
  client.on(Events.InteractionCreate, (interaction) => {
    // Chạy async handler và bắt lỗi để không crash bot
    handleInteraction(interaction, commands).catch((err) => {
      console.error('[Events.InteractionCreate] Fatal error:', err);
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────────
  client.on(Events.Error, (error) => {
    console.error('[Discord Client Error]:', error);
  });

  client.on(Events.Warn, (warning) => {
    console.warn('[Discord Client Warning]:', warning);
  });

  // Xử lý unhandled promise rejections để tránh crash
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UnhandledRejection] at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[UncaughtException]:', error);
  });
}
