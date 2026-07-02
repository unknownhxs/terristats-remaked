# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone, timedelta
from collections import Counter
import re
from database import db
class Clan24h(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
    @app_commands.command(name='clan_24h', description='Clan statistics in last 24 hours')
    async def clan_24h(self, interaction: discord.Interaction, clan: str):
        try:
            await interaction.response.defer()
            clan_upper = clan.upper().strip()
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
            query = {
                'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'},
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
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'players': [{'$unwind': '$clan_winners'}, {'$group': {'_id': '$clan_winners', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'recent': [{'$sort': {'timestamp': -1}}, {'$limit': 3}, {'$project': {'map': 1}}]
                }}
            ]
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result or not result[0].get('stats'):
                await interaction.followup.send(embed=discord.Embed(
                    title=f"[{clan_upper}] Last 24 Hours", 
                    description="No wins in last 24 hours.", 
                    color=0xff0000
                ))
                return
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total_wins = stats.get('total', 0)
            contest_wins = stats.get('contests', 0)
            total_points = stats.get('points', 0)
            top_maps = [(m['_id'], m['count']) for m in data.get('maps', [])]
            top_players = [(p['_id'], p['count']) for p in data.get('players', [])]
            recent = data.get('recent', [])
            
            embed = discord.Embed(
                title=f"[{clan_upper}] Last 24 Hours",
                description="Activity in the past day",
                color=0x2b2d31
            )
            
            stats_text = f"Wins: **{total_wins}**\n"
            stats_text += f"Contests: **{contest_wins}**\n"
            stats_text += f"Points: **{total_points}**\n"
            stats_text += f"Avg/Hour: **{total_wins/24:.1f}**"
            embed.add_field(name="📊 Stats", value=stats_text, inline=False)
            
            if top_maps:
                map_text = '\n'.join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_maps)])
                embed.add_field(name="🗺️ Top Maps", value=map_text, inline=True)
            
            if top_players:
                player_text = '\n'.join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_players)])
                embed.add_field(name="👥 Top Players", value=player_text, inline=True)
            
            recent_text = '\n'.join([f"{w.get('map', 'Unknown')}" for w in recent])
            embed.add_field(name="🕐 Recent", value=recent_text, inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in clan_24h: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch 24h stats.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Clan24h(bot))
