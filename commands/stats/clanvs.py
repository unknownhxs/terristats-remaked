# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
from database import db
import re

class ClanVS(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='clanvs', description='Head-to-head comparison between two clans')
    async def clanvs(self, interaction: discord.Interaction, clan1: str, clan2: str, days: int = None):
        try:
            await interaction.response.defer()
            
            if days is not None and days < 0:
                embed = discord.Embed(title="❌ Invalid Input", description="Days must be 0 or greater (0 = last 24 hours, 1 = last 2 days, etc.)", color=0xff0000)
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            
            clan1_name = clan1.upper().strip()
            clan2_name = clan2.upper().strip()
            
            if clan1_name == clan2_name:
                embed = discord.Embed(
                    title="❌ Same Clan", 
                    description="Please enter two different clans to compare.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return            
            query1 = {'clan_name': {'$regex': f'^{re.escape(clan1_name)}$', '$options': 'i'}}
            query2 = {'clan_name': {'$regex': f'^{re.escape(clan2_name)}$', '$options': 'i'}}
            
            if days is not None:
                from datetime import timedelta
                now = datetime.now(timezone.utc)
                hours_back = (days + 1) * 24
                cutoff_date = now - timedelta(hours=hours_back)
                query1['timestamp'] = {'$gte': cutoff_date}
                query2['timestamp'] = {'$gte': cutoff_date}
                time_period = "Last 24 Hours" if days == 0 else f"Last {days + 1} Days"
            else:
                time_period = "All Time"            
            pipeline1 = [
                {'$match': query1},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                    }}],
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}]
                }}
            ]
            
            pipeline2 = [
                {'$match': query2},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                    }}],
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}]
                }}
            ]
            
            result1 = await db.db.clanwins.aggregate(pipeline1).to_list(1)
            result2 = await db.db.clanwins.aggregate(pipeline2).to_list(1)
            
            data1 = result1[0] if result1 else {'stats': [], 'maps': []}
            data2 = result2[0] if result2 else {'stats': [], 'maps': []}
            
            stats1 = data1['stats'][0] if data1['stats'] else {'total': 0, 'contests': 0, 'points': 0}
            stats2 = data2['stats'][0] if data2['stats'] else {'total': 0, 'contests': 0, 'points': 0}
            
            clan1_total = stats1['total']
            clan1_contests = stats1['contests']
            clan1_points = stats1['points']
            
            clan2_total = stats2['total']
            clan2_contests = stats2['contests']
            clan2_points = stats2['points']
            
            if clan1_total == 0 and clan2_total == 0:
                embed = discord.Embed(
                    title=f"⚔️ [{clan1_name}] vs [{clan2_name}]", 
                    description="No wins found for either clan.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            clan1_maps = [(m['_id'], m['count']) for m in data1.get('maps', [])]
            clan2_maps = [(m['_id'], m['count']) for m in data2.get('maps', [])]
            
            if clan1_total > clan2_total:
                winner_emoji = "🏆"
                winner_text = f"[{clan1_name}] leads!"
                color = 0x00ff00
            elif clan2_total > clan1_total:
                winner_emoji = "🏆"
                winner_text = f"[{clan2_name}] leads!"
                color = 0x00ff00
            else:
                winner_emoji = "🤝"
                winner_text = "It's a tie!"
                color = 0xffff00
            
            embed = discord.Embed(
                title=f"[{clan1_name}] vs [{clan2_name}]",
                description=f"{time_period} - {winner_text}",
                color=0x2b2d31
            )
            
            embed.add_field(
                name=f"[{clan1_name}]",
                value=f"Wins: **{clan1_total}**\nContest: **{clan1_contests}**\nPoints: **{clan1_points}**",
                inline=True
            )
            
            embed.add_field(
                name="Score",
                value=f"**{clan1_total}** - **{clan2_total}**",
                inline=True
            )
            
            embed.add_field(
                name=f"[{clan2_name}]",
                value=f"Wins: **{clan2_total}**\nContest: **{clan2_contests}**\nPoints: **{clan2_points}**",
                inline=True
            )
            
            if clan1_maps or clan2_maps:
                clan1_map_text = "\n".join([f"{name} - {count}" for name, count in clan1_maps]) if clan1_maps else "No data"
                clan2_map_text = "\n".join([f"{name} - {count}" for name, count in clan2_maps]) if clan2_maps else "No data"
                
                embed.add_field(name=f"[{clan1_name}] Maps", value=clan1_map_text, inline=True)
                embed.add_field(name="", value="", inline=True)
                embed.add_field(name=f"[{clan2_name}] Maps", value=clan2_map_text, inline=True)
            
            recent_pipeline = [
                {'$match': {'$or': [query1, query2]}},
                {'$sort': {'timestamp': -1}},
                {'$limit': 5},
                {'$project': {'clan_name': 1, 'map': 1}}
            ]
            recent_wins = await db.db.clanwins.aggregate(recent_pipeline).to_list(5)
            
            if recent_wins:
                recent_text = []
                for win in recent_wins:
                    clan_name = win.get('clan_name', 'Unknown')
                    map_name = win.get('map', 'Unknown')
                    recent_text.append(f"[{clan_name}] {map_name}")
                
                embed.add_field(name="Recent Activity", value="\n".join(recent_text), inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"💥 CLANVS ERROR: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to compare clans.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(ClanVS(bot))
