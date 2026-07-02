# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone, timedelta
from collections import Counter
from database import db

class DailyWins(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='dailywins', description='Top clans for today only')
    async def dailywins(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            
            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query = {'timestamp': {'$gte': today_start}}
            
            pipeline = [
                {'$match': query},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'points': {'$sum': '$player_count'}
                    }}],
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 10}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result or not result[0].get('stats'):
                await interaction.followup.send(embed=discord.Embed(
                    title="Daily Wins", description="No wins today yet.", color=0xff0000
                ))
                return
            
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total_wins = stats.get('total', 0)
            total_points = stats.get('points', 0)
            top_clans = [(c['_id'], c['count']) for c in data.get('clans', [])]
            
            embed = discord.Embed(
                title="Daily Wins Leaderboard",
                description=f"Today's top clans - {total_wins} wins | {total_points} points",
                color=0x2b2d31
            )
            
            rankings = []
            for i, (clan, count) in enumerate(top_clans, 1):
                rankings.append(f"#{i} [{clan}] - {count} wins")
            
            embed.add_field(name="Rankings", value='\n'.join(rankings), inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in dailywins: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch daily wins.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(DailyWins(bot))
