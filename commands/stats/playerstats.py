# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
from database import db

class PlayerStats(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='playerstats', description='Get individual player win statistics')
    async def playerstats(self, interaction: discord.Interaction, player: str, days: int = None):
        try:
            await interaction.response.defer()
            
            if days is not None and days < 0:
                embed = discord.Embed(title="❌ Invalid Input", description="Days must be 0 or greater (0 = last 24 hours, 1 = last 2 days, etc.)", color=0xff0000)
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            
            player_name = player.strip()
            
            query = {'clan_winners': player_name}
            
            if days is not None:
                from datetime import timedelta
                now = datetime.now(timezone.utc)
                hours_back = (days + 1) * 24
                cutoff_date = now - timedelta(hours=hours_back)
                query['timestamp'] = {'$gte': cutoff_date}
                time_period = "Last 24 Hours" if days == 0 else f"Last {days + 1} Days"
            else:
                time_period = "All Time"
            
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
                    'recent': [{'$sort': {'timestamp': -1}}, {'$limit': 5}, {'$project': {'clan_name': 1, 'map': 1}}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            
            if not result:
                embed = discord.Embed(
                    title=f"Player Statistics: {player_name}", 
                    description="No wins found for this player.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            data = result[0]
            stats = data.get('stats', [])
            
            if not stats or stats[0].get('total', 0) == 0:
                embed = discord.Embed(
                    title=f"Player Statistics: {player_name}", 
                    description="No wins found for this player.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            stats_data = stats[0]
            total_wins = stats_data.get('total', 0)
            contest_wins = stats_data.get('contests', 0)
            total_points = stats_data.get('points', 0)
            
            top_clans = [(c['_id'], c['count']) for c in data.get('clans', [])]
            top_maps = [(m['_id'], m['count']) for m in data.get('maps', [])]
            recent_wins = data.get('recent', [])
            
            embed = discord.Embed(
                title=f"{player_name} Statistics",
                description=f"{time_period}",
                color=0x2b2d31
            )
            
            stats_text = f"Wins: **{total_wins}** | Contest: **{contest_wins}** ({contest_wins/total_wins*100:.0f}%)\n" if total_wins > 0 else "Wins: **0** | Contest: **0**\n"
            stats_text += f"Points: **{total_points}**"
            embed.add_field(name="Stats", value=stats_text, inline=False)
            
            if top_clans:
                clan_text = "\n".join([f"{i+1}. [{name}] - {count}" for i, (name, count) in enumerate(top_clans)])
                embed.add_field(name="Top Clans", value=clan_text, inline=True)
            
            if top_maps:
                map_text = "\n".join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_maps)])
                embed.add_field(name="Top Maps", value=map_text, inline=True)
            
            recent_wins = data.get('recent', [])
            if recent_wins:
                recent_text = "\n".join([f"[{win.get('clan_name', 'Unknown')}] {win.get('map', 'Unknown')}" for win in recent_wins])
                embed.add_field(name="Recent", value=recent_text, inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"💥 COMMAND ERROR: {e}")
            await interaction.followup.send(embed=discord.Embed(
                title="Error", description="Failed to fetch player statistics.", color=0xff0000
            ))

async def setup(bot):
    await bot.add_cog(PlayerStats(bot))
