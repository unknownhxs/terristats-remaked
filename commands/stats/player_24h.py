# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone, timedelta
from collections import Counter
from database import db

class Player24h(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='player_24h', description='Player statistics in last 24 hours')
    async def player_24h(self, interaction: discord.Interaction, player: str):
        try:
            await interaction.response.defer()
            
            player_name = player.strip()
            
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
            query = {
                'clan_winners': player_name,
                'timestamp': {'$gte': cutoff_time}
            }
            
            pipeline = [
                {'$match': query},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                    }}],
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'recent': [{'$sort': {'timestamp': -1}}, {'$limit': 3}, {'$project': {'clan_name': 1, 'map': 1}}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            
            if not result:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"{player_name} - Last 24 Hours", 
                    description="No wins in last 24 hours.", 
                    color=0xff0000
                ))
                return
            
            data = result[0]
            stats = data.get('stats', [])
            
            if not stats or stats[0].get('total', 0) == 0:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"{player_name} - Last 24 Hours", 
                    description="No wins in last 24 hours.", 
                    color=0xff0000
                ))
                return
            
            stats_data = stats[0]
            total_wins = stats_data.get('total', 0)
            contest_wins = stats_data.get('contests', 0)
            total_points = stats_data.get('points', 0)
            
            top_clans = [(c['_id'], c['count']) for c in data.get('clans', [])]
            top_maps = [(m['_id'], m['count']) for m in data.get('maps', [])]
            recent = data.get('recent', [])
            
            embed = discord.Embed(
                title=f"{player_name} - Last 24 Hours",
                description="Activity in the past day",
                color=0x2b2d31
            )
            
            stats_text = f"Wins: **{total_wins}**\n"
            stats_text += f"Contests: **{contest_wins}**\n"
            stats_text += f"Points: **{total_points}**\n"
            stats_text += f"Avg/Hour: **{total_wins/24:.1f}**"
            embed.add_field(name="📊 Stats", value=stats_text, inline=False)
            
            if top_clans:
                clan_text = '\n'.join([f"{i+1}. [{name}] - {count}" for i, (name, count) in enumerate(top_clans)])
                embed.add_field(name="🏷️ Top Clans", value=clan_text, inline=True)
            
            if top_maps:
                map_text = '\n'.join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_maps)])
                embed.add_field(name="🗺️ Top Maps", value=map_text, inline=True)
            
            recent_text = '\n'.join([f"[{w.get('clan_name', 'Unknown')}] {w.get('map', 'Unknown')}" for w in recent])
            embed.add_field(name="🕐 Recent", value=recent_text, inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in player_24h: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch 24h stats.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Player24h(bot))
