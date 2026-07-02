# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
from database import db

class MapStats(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def map_autocomplete(self, interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
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

    @app_commands.command(name='mapstats', description='Show which clans dominate specific maps')
    @app_commands.describe(map='Select a map to view statistics')
    @app_commands.autocomplete(map=map_autocomplete)
    async def mapstats(self, interaction: discord.Interaction, map: str, days: int = None):
        try:
            await interaction.response.defer()
            
            if days is not None and days < 0:
                embed = discord.Embed(title="❌ Invalid Input", description="Days must be 0 or greater (0 = last 24 hours, 1 = last 2 days, etc.)", color=0xff0000)
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            
            map_name = map.strip()
            
            query = {
                'map': {'$regex': f'^{map_name}$', '$options': 'i'}
            }
            
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
                        'points': {'$sum': '$player_count'}
                    }}],
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 5}],
                    'players': [{'$unwind': '$clan_winners'}, {'$group': {'_id': '$clan_winners', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'recent': [{'$sort': {'timestamp': -1}}, {'$limit': 3}, {'$project': {'clan_name': 1}}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result or not result[0].get('stats'):
                embed = discord.Embed(
                    title=f"Map Statistics: {map_name}", 
                    description="No games found for this map.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total_games = stats.get('total', 0)
            contest_games = stats.get('contests', 0)
            total_points = stats.get('points', 0)
            
            top_clans = [(c['_id'], c['count']) for c in data.get('clans', [])]
            top_players = [(p['_id'], p['count']) for p in data.get('players', [])]
            recent_wins = data.get('recent', [])
            
            embed = discord.Embed(
                title=f"{map_name} Statistics",
                description=f"{time_period}",
                color=0x2b2d31
            )
            
            stats_text = f"Games: **{total_games}** | Contest: **{contest_games}** ({contest_games/total_games*100:.0f}%)\n" if total_games > 0 else "Games: **0** | Contest: **0**\n"
            stats_text += f"Points: **{total_points}**"
            embed.add_field(name="Stats", value=stats_text, inline=False)
            
            if top_clans:
                clan_text = "\n".join([f"{i+1}. [{name}] - {count}" for i, (name, count) in enumerate(top_clans)])
                embed.add_field(name="Top Clans", value=clan_text, inline=True)
            
            if top_players:
                player_text = "\n".join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_players)])
                embed.add_field(name="Top Players", value=player_text, inline=True)
            
            recent_wins = data.get('recent', [])
            if recent_wins:
                recent_text = "\n".join([f"[{win.get('clan_name', 'Unknown')}]" for win in recent_wins])
                embed.add_field(name="Recent Winners", value=recent_text, inline=False)
            
            total_db_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_db_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"💥 MAPSTATS ERROR: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch map statistics.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(MapStats(bot))
