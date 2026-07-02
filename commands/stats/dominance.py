# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter
from database import db

class Dominance(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def map_autocomplete(self, interaction: discord.Interaction, current: str):
        try:
            maps = await db.db.clanwins.distinct('map')
            maps = [m for m in maps if m and isinstance(m, str)]
            maps.sort()
            if current:
                filtered_maps = [m for m in maps if current.lower() in m.lower()]
            else:
                filtered_maps = maps
            return [app_commands.Choice(name=map_name, value=map_name) for map_name in filtered_maps[:25]]
        except:
            return []

    @app_commands.command(name='dominance', description='Show clan dominance on specific map by percentage')
    @app_commands.autocomplete(map=map_autocomplete)
    async def dominance(self, interaction: discord.Interaction, map: str):
        try:
            await interaction.response.defer()
            
            query = {'map': {'$regex': f'^{map.strip()}$', '$options': 'i'}}
            
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
                    title=f"{map} Dominance", description="No games found.", color=0xff0000
                ))
                return
            
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total = stats.get('total', 0)
            total_points = stats.get('points', 0)
            top_clans = [(c['_id'], c['count']) for c in data.get('clans', [])]
            
            embed = discord.Embed(title=f"{map} Dominance", description=f"{total} games | {total_points} points", color=0x2b2d31)
            
            rankings = []
            for i, (clan, count) in enumerate(top_clans, 1):
                percentage = (count / total) * 100
                bar_length = int(percentage / 10)
                bar = '█' * bar_length + '░' * (10 - bar_length)
                rankings.append(f"#{i} [{clan}]\n{bar} {percentage:.1f}% ({count})")
            
            embed.add_field(name="Clan Dominance", value='\n\n'.join(rankings), inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in dominance: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to calculate dominance.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Dominance(bot))
