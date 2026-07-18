// https://github.com/viktorexe/terristats-discord-bot
// Entry point: boots the Discord client, loads every slash command, connects
// to MongoDB, registers the commands with Discord, starts the background
// scraper and the health-check web server.
const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
} = require('discord.js');
require('dotenv').config();

const db = require('./database');
const { startWebServer } = require('./webServer');
const { startScraper } = require('./scraper');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Each loaded command module is stored here, keyed by its slash command name.
client.commands = new Collection();

/**
 * Recursively load every command module under commands/<folder>.
 * A command module must export `data` (a SlashCommandBuilder) and `execute`.
 */
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const folders = ['general', 'stats', 'viktor'];

  for (const folder of folders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs
      .readdirSync(folderPath)
      .filter((f) => f.endsWith('.js') && !f.startsWith('_'));

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          console.log(`Loaded: ${folder}/${file}`);
        } else {
          console.log(`Failed to load ${folder}/${file}: missing data/execute`);
        }
      } catch (err) {
        console.log(`Failed to load ${folder}/${file}: ${err.message}`);
      }
    }
  }
}

/** Push the loaded slash commands to Discord via the REST API. */
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const body = client.commands.map((cmd) => cmd.data.toJSON());

  // GUILD_ID is optional. When set it gives instant, guild-scoped registration
  // (handy for development). When it is absent — the default — commands are
  // registered globally, which is the intended production behaviour and can
  // take up to ~1 hour to propagate across Discord.
  if (process.env.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body },
    );
    console.log(`Registered ${body.length} commands to guild ${process.env.GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(client.user.id), { body });
    console.log(`Registered ${body.length} commands globally (may take up to 1 hour to appear)`);
  }
  return body.length;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`${readyClient.user.tag} has connected to Discord!`);
  console.log(`Bot is in ${readyClient.guilds.cache.size} guilds`);

  await readyClient.user.setActivity('Made by v1ktor');

  try {
    await db.initDb();
    console.log('Database initialized successfully!');
  } catch (err) {
    console.log(`Database initialization error: ${err.message}`);
    process.exit(1);
  }

  console.log('Cogs loaded!');

  try {
    const synced = await registerCommands();
    console.log(`Synced ${synced} slash commands!`);
  } catch (err) {
    console.log(`Command sync error: ${err.message}`);
  }

  // Start scraping only once the bot is ready (matches the original before_loop).
  startScraper();
});

// Route both slash command executions and autocomplete requests.
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.log(`Command error (${interaction.commandName}): ${err.message}`);
    }
  } else if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      // Autocomplete failures should never crash the bot.
    }
  }
});

async function main() {
  console.log('Starting TerriStats Bot...');
  console.log(`Node version: ${process.version}`);

  loadCommands();

  const port = parseInt(process.env.PORT || '8000', 10);
  await startWebServer(port);

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.log('ERROR: DISCORD_TOKEN not found in environment variables!');
    process.exit(1);
  }

  await client.login(token);
}

main().catch((err) => {
  console.log(`Fatal error: ${err.message}`);
  process.exit(1);
});
