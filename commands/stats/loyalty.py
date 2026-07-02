# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter
from database import db

class Loyalty(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='loyalty', description='Show which clans a player plays with most')
    async def loyalty(self, interaction: discord.Interaction, player: str):
        try:
            await interaction.response.defer()
            
            player_name = player.strip()
            query = {'clan_winners': player_name}
            
            pipeline = [
                {'$match': query},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                    }}],
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 10}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            
            if not result:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"{player_name} Loyalty", description="No wins found.", color=0xff0000
                ))
                return
            
            data = result[0]
            stats = data.get('stats', [])
            
            if not stats or stats[0].get('total', 0) == 0:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"{player_name} Loyalty", description="No wins found.", color=0xff0000
                ))
                return
            
            stats_data = stats[0]
            total_wins = stats_data.get('total', 0)
            total_points = stats_data.get('points', 0)
            
            clan_counter = [(c['_id'], c['count']) for c in data.get('clans', [])]
            
            embed = discord.Embed(
                title=f"{player_name} Clan Loyalty",
                description=f"{total_wins} wins | {total_points} points",
                color=0x2b2d31
            )
            
            loyalty_list = []
            for i, (clan, count) in enumerate(clan_counter, 1):
                percentage = (count / total_wins) * 100
                loyalty_list.append(f"#{i} [{clan}] - {count} wins ({percentage:.1f}%)")
            
            embed.add_field(name="Clan Distribution", value='\n'.join(loyalty_list), inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in loyalty: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch loyalty data.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Loyalty(bot))
