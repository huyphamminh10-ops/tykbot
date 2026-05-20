// src/deploy-commands.js
// Chạy script này một lần để đăng ký slash commands lên Discord API
// Command: node src/deploy-commands.js

import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as tykCreateData } from './commands/tykcreate.js';

const commands = [
  tykCreateData.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

console.log('🔄 Deploying slash commands...');

try {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands },
  );
  console.log('✅ Successfully deployed slash commands globally!');
  console.log('📝 Commands registered:', commands.map(c => `/${c.name}`).join(', '));
} catch (error) {
  console.error('❌ Failed to deploy commands:', error);
  process.exit(1);
}
