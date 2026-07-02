# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
from database import db

class Compare(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='compare', description='Compare two players head-to-head')
    async def compare(self, interaction: discord.Interaction, player1: str, player2: str):
        try:
            await interaction.response.defer()
            
            player1_name = player1.strip()
            player2_name = player2.strip()
            
            if player1_name == player2_name:
                await interaction.followup.send(embed=discord.Embed(
                    title="❌ Same Player", description="Please enter two different players.", color=0xff0000
                ))
                return
            
            query1 = {'clan_winners': player1_name}
            query2 = {'clan_winners': player2_name}
            
            pipeline1 = [
                {'$match': query1},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                    }}],
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 1}]
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
                    'clans': [{'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 1}]
                }}
            ]
            
            result1 = await db.db.clanwins.aggregate(pipeline1).to_list(1)
            result2 = await db.db.clanwins.aggregate(pipeline2).to_list(1)
            
            data1 = result1[0] if result1 else {'stats': [], 'clans': []}
            data2 = result2[0] if result2 else {'stats': [], 'clans': []}
            
            stats1 = data1.get('stats', [])
            stats2 = data2.get('stats', [])
            
            stats1_data = stats1[0] if stats1 else {'total': 0, 'contests': 0, 'points': 0}
            stats2_data = stats2[0] if stats2 else {'total': 0, 'contests': 0, 'points': 0}
            
            p1_total = stats1_data.get('total', 0)
            p1_contests = stats1_data.get('contests', 0)
            p1_points = stats1_data.get('points', 0)
            
            p2_total = stats2_data.get('total', 0)
            p2_contests = stats2_data.get('contests', 0)
            p2_points = stats2_data.get('points', 0)
            
            if p1_total == 0 and p2_total == 0:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"⚔️ {player1_name} vs {player2_name}", 
                    description="No wins found for either player.", 
                    color=0xff0000
                ))
                return
            
            clans_pipeline1 = [
                {'$match': query1},
                {'$group': {'_id': '$clan_name'}},
                {'$limit': 100}
            ]
            clans_pipeline2 = [
                {'$match': query2},
                {'$group': {'_id': '$clan_name'}},
                {'$limit': 100}
            ]
            
            clans_result1 = await db.db.clanwins.aggregate(clans_pipeline1).to_list(100)
            clans_result2 = await db.db.clanwins.aggregate(clans_pipeline2).to_list(100)
            
            all_clans1 = set(c['_id'] for c in clans_result1 if c.get('_id'))
            all_clans2 = set(c['_id'] for c in clans_result2 if c.get('_id'))
            common_clans = all_clans1 & all_clans2
            
            maps_pipeline1 = [
                {'$match': query1},
                {'$group': {'_id': '$map'}},
                {'$limit': 100}
            ]
            maps_pipeline2 = [
                {'$match': query2},
                {'$group': {'_id': '$map'}},
                {'$limit': 100}
            ]
            
            maps_result1 = await db.db.clanwins.aggregate(maps_pipeline1).to_list(100)
            maps_result2 = await db.db.clanwins.aggregate(maps_pipeline2).to_list(100)
            
            all_maps1 = set(m['_id'] for m in maps_result1 if m.get('_id'))
            all_maps2 = set(m['_id'] for m in maps_result2 if m.get('_id'))
            common_maps = all_maps1 & all_maps2
            
            p1_top_clan = (data1['clans'][0]['_id'], data1['clans'][0]['count']) if data1.get('clans') and len(data1['clans']) > 0 else ('None', 0)
            p2_top_clan = (data2['clans'][0]['_id'], data2['clans'][0]['count']) if data2.get('clans') and len(data2['clans']) > 0 else ('None', 0)
            
            co_wins_pipeline = [
                {'$match': {'$and': [
                    {'clan_winners': player1_name},
                    {'clan_winners': player2_name}
                ]}},
                {'$count': 'total'}
            ]
            co_wins_result = await db.db.clanwins.aggregate(co_wins_pipeline).to_list(1)
            co_wins_count = co_wins_result[0]['total'] if co_wins_result else 0
            
            if p1_total > p2_total:
                winner_text = f"{player1_name} leads!"
                color = 0x00ff00
            elif p2_total > p1_total:
                winner_text = f"{player2_name} leads!"
                color = 0x00ff00
            else:
                winner_text = "It's a tie!"
                color = 0xffff00
            
            embed = discord.Embed(
                title=f"⚔️ {player1_name} vs {player2_name}",
                description=winner_text,
                color=0x2b2d31
            )
            
            embed.add_field(
                name=f"{player1_name}",
                value=f"Wins: **{p1_total}**\nContests: **{p1_contests}**\nPoints: **{p1_points}**\nTop Clan: [{p1_top_clan[0]}]",
                inline=True
            )
            
            embed.add_field(
                name="Score",
                value=f"**{p1_total}** - **{p2_total}**",
                inline=True
            )
            
            embed.add_field(
                name=f"{player2_name}",
                value=f"Wins: **{p2_total}**\nContests: **{p2_contests}**\nPoints: **{p2_points}**\nTop Clan: [{p2_top_clan[0]}]",
                inline=True
            )
            
            if common_clans:
                common_text = ", ".join([f"[{c}]" for c in list(common_clans)[:5]])
                if len(common_clans) > 5:
                    common_text += f" +{len(common_clans)-5}"
                embed.add_field(name="🤝 Common Clans", value=common_text, inline=False)
            
            if common_maps:
                common_map_text = ", ".join(list(common_maps)[:5])
                if len(common_maps) > 5:
                    common_map_text += f" +{len(common_maps)-5}"
                embed.add_field(name="🗺️ Common Maps", value=common_map_text, inline=False)

            
            if co_wins_count > 0:
                embed.add_field(
                    name="👥 Played Together",
                    value=f"{co_wins_count} games as teammates",
                    inline=False
                )
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in compare: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to compare players.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Compare(bot))
