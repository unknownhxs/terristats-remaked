# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
import os
import sys
from dotenv import load_dotenv
from database import db
from web_server import start_web_server
load_dotenv()

intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = commands.Bot(command_prefix='/', intents=intents)

@bot.event
async def on_ready():
    print(f'{bot.user} has connected to Discord!')
    print(f'Bot is in {len(bot.guilds)} guilds')
    await bot.change_presence(activity=discord.CustomActivity(name='Made by v1ktor'))
    try:
        await db.init_db()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Database initialization error: {e}")
        sys.exit(1)
    print("Cogs loaded!")
    try:
        synced = await bot.tree.sync()
        print(f"Synced {len(synced)} slash commands!")
    except Exception as e:
        print(f"Command sync error: {e}")

async def load_cogs():
    for folder in ['general', 'stats', 'viktor']:
        folder_path = f'commands/{folder}'
        if os.path.exists(folder_path):
            for filename in os.listdir(folder_path):
                if filename.endswith('.py') and not filename.startswith('_'):
                    try:
                        await bot.load_extension(f'commands.{folder}.{filename[:-3]}')
                        print(f"Loaded: {folder}/{filename}")
                    except Exception as e:
                        print(f"Failed to load {folder}/{filename}: {e}")

async def main():
    async with bot:
        await load_cogs()
        port = int(os.getenv('PORT', 8000))
        asyncio.create_task(start_web_server(port))
        token = os.getenv('DISCORD_TOKEN')
        if not token:
            print("ERROR: DISCORD_TOKEN not found in environment variables!")
            sys.exit(1)
        await bot.start(token)

if __name__ == '__main__':
    import asyncio
    print("Starting TerriStats Bot...")
    print(f"Python version: {sys.version}")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Bot stopped by user")
    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)
