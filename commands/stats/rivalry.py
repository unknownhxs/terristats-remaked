# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter, defaultdict
from database import db

class Rivalry(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='rivalry', description='Show top clan rivalries and competitive matchups')
    async def rivalry(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            
            pipeline = [
                {
                    '$group': {
                        '_id': {'map': '$map', 'clan': '$clan_name'},
                        'count': {'$sum': 1}
                    }
                },
                {'$sort': {'count': -1}},
                {'$limit': 1000}
            ]
            
            results = await db.db.clanwins.aggregate(pipeline).to_list(1000)
            
            if not results:
                await interaction.followup.send(embed=discord.Embed(
                    title="🥊 Clan Rivalries", description="No data found.", color=0xff0000
                ))
                return
            
            map_clans = defaultdict(list)
            for r in results:
                if r.get('_id') and r['_id'].get('map') and r['_id'].get('clan'):
                    map_name = r['_id']['map']
                    clan_name = r['_id']['clan']
                    count = r.get('count', 0)
                    map_clans[map_name].append((clan_name, count))
            
            rivalry_scores = defaultdict(int)
            clan_pairs = defaultdict(lambda: {'maps': set(), 'clan1_wins': 0, 'clan2_wins': 0})
            
            for map_name, clans in map_clans.items():
                top_clans = sorted(clans, key=lambda x: x[1], reverse=True)[:10]
                
                for i, (clan1, count1) in enumerate(top_clans):
                    for clan2, count2 in top_clans[i+1:]:
                        pair = tuple(sorted([clan1, clan2]))
                        rivalry_scores[pair] += min(count1, count2)
                        clan_pairs[pair]['maps'].add(map_name)
                        clan_pairs[pair]['clan1_wins'] += count1 if pair[0] == clan1 else count2
                        clan_pairs[pair]['clan2_wins'] += count2 if pair[0] == clan1 else count1
            
            top_rivalries = sorted(rivalry_scores.items(), key=lambda x: x[1], reverse=True)[:10]
            
            if not top_rivalries:
                await interaction.followup.send(embed=discord.Embed(
                    title="🥊 Clan Rivalries", description="No rivalries found.", color=0xff0000
                ))
                return
            
            embed = discord.Embed(
                title="🥊 Top Clan Rivalries",
                description="Most competitive clan matchups",
                color=0xff4500
            )
            
            for i, (pair, score) in enumerate(top_rivalries, 1):
                clan1, clan2 = pair
                data = clan_pairs[pair]
                total_wins = data['clan1_wins'] + data['clan2_wins']
                intensity = min(100, int((score / 10) * 100))
                
                rivalry_text = f"**Intensity:** {intensity}/100\n"
                rivalry_text += f"**Record:** [{clan1}] {data['clan1_wins']} - {data['clan2_wins']} [{clan2}]\n"
                rivalry_text += f"**Battlegrounds:** {len(data['maps'])} maps\n"
                rivalry_text += f"**Total Clashes:** {total_wins}"
                
                embed.add_field(
                    name=f"#{i} [{clan1}] vs [{clan2}]",
                    value=rivalry_text,
                    inline=False
                )
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in rivalry: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to calculate rivalries.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Rivalry(bot))
