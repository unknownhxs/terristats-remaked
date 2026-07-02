# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone, timedelta
from collections import Counter
from database import db

class RecentWins(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='recentwins', description='Show recent wins in last X hours')
    async def recentwins(self, interaction: discord.Interaction, hours: int):
        try:
            await interaction.response.defer()
            
            if hours <= 0 or hours > 168:  # Max 1 week
                embed = discord.Embed(
                    title="❌ Invalid Hours", 
                    description="Please enter hours between 1 and 168 (1 week).", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
            query = {'timestamp': {'$gte': cutoff_time}}
            
            pipeline = [
                {'$match': query},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': '$player_count'}
                    }}],
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 5}],
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'latest': [{'$sort': {'timestamp': -1}}, {'$limit': 5}, {'$project': {'clan_name': 1, 'map': 1, 'timestamp': 1}}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result or not result[0].get('stats'):
                embed = discord.Embed(
                    title=f"📅 Recent Wins ({hours}h)", 
                    description=f"No wins found in the last {hours} hours.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total_wins = stats.get('total', 0)
            contest_wins = stats.get('contests', 0)
            total_points = stats.get('points', 0)
            
            top_clans = [(c['_id'], c['count']) for c in data.get('clans', [])]
            top_maps = [(m['_id'], m['count']) for m in data.get('maps', [])]
            latest_wins = data.get('latest', [])
            
            embed = discord.Embed(
                title=f"Recent Wins ({hours}h)",
                description=f"Activity in the last {hours} hours",
                color=0x2b2d31
            )
            
            stats_text = f"Games: **{total_wins}** | Contest: **{contest_wins}**\n"
            stats_text += f"Points: **{total_points}** | Avg: **{total_wins/hours:.1f}**/hr"
            embed.add_field(name="Stats", value=stats_text, inline=False)
            
            if top_clans:
                clan_text = "\n".join([f"{i+1}. [{name}] - {count}" for i, (name, count) in enumerate(top_clans)])
                embed.add_field(name="Most Active Clans", value=clan_text, inline=True)
            
            if top_maps:
                map_text = "\n".join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_maps)])
                embed.add_field(name="Popular Maps", value=map_text, inline=True)
            
            if latest_wins:
                latest_text = []
                for win in latest_wins:
                    win_time = win.get('timestamp', datetime.now(timezone.utc))
                    if win_time.tzinfo is None:
                        win_time = win_time.replace(tzinfo=timezone.utc)
                    time_ago = datetime.now(timezone.utc) - win_time
                    hours_ago = int(time_ago.total_seconds() / 3600)
                    mins_ago = int((time_ago.total_seconds() % 3600) / 60)
                    
                    if hours_ago > 0:
                        time_str = f"{hours_ago}h"
                    else:
                        time_str = f"{mins_ago}m"
                    
                    latest_text.append(f"[{win.get('clan_name', 'Unknown')}] {win.get('map', 'Unknown')} - {time_str}")
                
                embed.add_field(name="Latest", value="\n".join(latest_text), inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"💥 RECENTWINS ERROR: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch recent wins.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(RecentWins(bot))
