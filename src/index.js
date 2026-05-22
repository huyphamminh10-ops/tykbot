// src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { registerEvents } from './events/index.js';

// ── Validate Environment ──────────────────────────────────────────────────────
const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'GEMINI_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ── Initialize Discord Client ─────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Channel,   // Cần để nhận DM
    Partials.Message,
  ],
});

// ── Load Commands ──────────────────────────────────────────────────────────────
const commands = new Collection();

// Danh sách commands: [path, tên hiển thị]
const commandFiles = [
  ['./commands/tykcreate.js', 'tykcreate'],
  ['./commands/tyktest.js',   'tyktest'],
];

for (const [path, name] of commandFiles) {
  try {
    const module = await import(path);
    if (module.data && module.execute) {
      commands.set(module.data.name, module);
      console.log(`✅ Loaded command: /${module.data.name}`);
    }
  } catch (err) {
    // File chưa có hoặc lỗi cú pháp — bỏ qua, không crash bot
    console.warn(`⚠️  Bỏ qua command "${name}": ${err.message}`);
  }
}

// ── Register Events ────────────────────────────────────────────────────────────
registerEvents(client, commands);

// ── Connect to Discord ─────────────────────────────────────────────────────────
await client.login(process.env.DISCORD_TOKEN);
