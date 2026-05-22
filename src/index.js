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

// Dynamic import tất cả commands
const commandModules = [
  await import('./commands/tykcreate.js'),
  await import('./commands/tyktest.js'),
];

for (const module of commandModules) {
  if (module.data && module.execute) {
    commands.set(module.data.name, module);
    console.log(`✅ Loaded command: /${module.data.name}`);
  }
}

// ── Register Events ────────────────────────────────────────────────────────────
registerEvents(client, commands);

// ── Connect to Discord ─────────────────────────────────────────────────────────
await client.login(process.env.DISCORD_TOKEN);
