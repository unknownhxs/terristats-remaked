# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
import re
from database import db

class ClanProfile(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='clanprofile', description='Detailed clan profile card with all statistics')
    async def clanprofile(self, interaction: discord.Interaction, clan: str):
        try:
            await interaction.response.defer()
            
            clan_upper = clan.upper().strip()
            query = {'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'}}
            
            pipeline = [
                {'$match': query},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}},
                        'total_gain': {'$sum': '$gain'}
                    }}],
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 5}],
                    'players': [{'$unwind': '$clan_winners'}, {'$group': {'_id': '$clan_winners', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 5}],
                    'recent': [{'$sort': {'timestamp': -1}}, {'$limit': 5}, {'$project': {'map': 1, 'time': 1}}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result or not result[0].get('stats'):
                await interaction.followup.send(embed=discord.Embed(
                    title=f"[{clan_upper}] Profile", description="No data found.", color=0xff0000
                ))
                return
            
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total_wins = stats.get('total', 0)
            contest_wins = stats.get('contests', 0)
            total_points = stats.get('points', 0)
            total_gain = stats.get('total_gain', 0)
            avg_gain = total_gain / total_wins if total_wins > 0 else 0
            
            top_maps = [(m['_id'], m['count']) for m in data.get('maps', [])]
            top_map = top_maps[0] if top_maps else ('Unknown', 0)
            
            players_data = data.get('players', [])
            unique_players = len(players_data)
            top_player = (players_data[0]['_id'], players_data[0]['count']) if players_data else ('Unknown', 0)
            
            recent_wins = data.get('recent', [])
            last_win = recent_wins[0].get('time', 'Unknown')[:16] if recent_wins else 'Unknown'
            
            embed = discord.Embed(
                title=f"[{clan_upper}]",
                description="Complete Clan Profile",
                color=0x5865F2
            )
            
            overview = f"**Wins:** {total_wins}\n"
            overview += f"**Contest:** {contest_wins} ({contest_wins/total_wins*100:.1f}%)\n" if total_wins > 0 else "**Contest:** 0\n"
            overview += f"**Non-Contest:** {total_wins - contest_wins}\n"
            overview += f"**Points:** {total_points}\n"
            overview += f"**Gain:** {total_gain:.5f}"
            embed.add_field(name="Overview", value=overview, inline=False)
            
            performance = f"**Favorite Map:** {top_map[0]} ({top_map[1]})\n"
            performance += f"**Avg Gain/Win:** {avg_gain:.5f}\n"
            performance += f"**Contest Rate:** {contest_wins/total_wins*100:.1f}%" if total_wins > 0 else "**Contest Rate:** 0%"
            embed.add_field(name="Performance", value=performance, inline=True)
            
            team = f"**Unique Players:** {unique_players}\n"
            team += f"**MVP:** {top_player[0]} ({top_player[1]} wins)\n"
            team += f"**Last Win:** {last_win}"
            embed.add_field(name="Team", value=team, inline=True)
            
            maps_text = '\n'.join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_maps)])
            embed.add_field(name="Top 5 Maps", value=maps_text, inline=True)
            
            pipeline_players = [
                {'$match': query},
                {'$unwind': '$clan_winners'},
                {'$group': {
                    '_id': '$clan_winners',
                    'count': {'$sum': 1},
                    'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                }},
                {'$sort': {'count': -1}},
                {'$limit': 5}
            ]
            top_players_full = await db.db.clanwins.aggregate(pipeline_players).to_list(5)
            players_text = [f"{i+1}. {p['_id']} - {p['count']} ({p['points']}pts)" for i, p in enumerate(top_players_full)]
            embed.add_field(name="Top 5 Players", value='\n'.join(players_text), inline=True)
            
            recent_text = '\n'.join([f"{win.get('map', 'Unknown')}" for win in recent_wins])
            embed.add_field(name="Recent Wins", value=recent_text, inline=True)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in clanprofile: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to generate profile.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(ClanProfile(bot))
