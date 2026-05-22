// src/index.js — Entry point chính của TykBot
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { data as tykCreateData, execute as tykCreateExecute } from './commands/tykcreate.js';
import { data as tykTestData, execute as tykTestExecute } from './commands/tyktest.js';
import { registerEvents } from './events/index.js';

// ── Khởi tạo Discord Client ───────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ── Load commands vào Collection ─────────────────────────────────────────────
const commands = new Collection();
commands.set(tykCreateData.name, { data: tykCreateData, execute: tykCreateExecute });
commands.set(tykTestData.name,   { data: tykTestData,   execute: tykTestExecute   });

// ── Đăng ký event handlers ────────────────────────────────────────────────────
registerEvents(client, commands);

// ── Kiểm tra DISCORD_TOKEN ────────────────────────────────────────────────────
if (!process.env.DISCORD_TOKEN) {
  console.error('[index.js] ❌ DISCORD_TOKEN chưa được cấu hình! Kiểm tra file .env');
  process.exit(1);
}

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[index.js] ❌ Không thể login Discord:', err.message);
  process.exit(1);
});
