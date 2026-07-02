# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
import re
from database import db

class Heatmap(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='heatmap', description='Show clan activity patterns by hour')
    async def heatmap(self, interaction: discord.Interaction, clan: str):
        try:
            await interaction.response.defer()
            
            clan_upper = clan.upper().strip()
            
            query = {
                'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'}
            }
            
            pipeline = [
                {'$match': query},
                {'$group': {
                    '_id': None,
                    'times': {'$push': '$time'},
                    'total_points': {'$sum': '$player_count'}
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result:
                embed = discord.Embed(
                    title=f"[{clan_upper}] Activity Heatmap",
                    description="No wins found for this clan.",
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            data = result[0]
            times = data.get('times', [])
            total_points = data.get('total_points', 0)
            
            hour_counter = Counter()
            for time_str in times:
                if time_str:
                    try:
                        dt = datetime.strptime(time_str, '%a, %d %b %Y %H:%M:%S %Z')
                        hour_counter[dt.hour] += 1
                    except:
                        pass
            
            if not hour_counter:
                embed = discord.Embed(
                    title=f"[{clan_upper}] Activity Heatmap",
                    description="Unable to parse activity times.",
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            max_wins = max(hour_counter.values())
            heatmap_lines = []
            
            for hour in range(24):
                wins_count = hour_counter.get(hour, 0)
                bar_length = int((wins_count / max_wins) * 10) if max_wins > 0 else 0
                bar = '█' * bar_length + '░' * (10 - bar_length)
                heatmap_lines.append(f"{hour:02d}:00 {bar} {wins_count}")
            
            col1 = '\n'.join(heatmap_lines[0:8])
            col2 = '\n'.join(heatmap_lines[8:16])
            col3 = '\n'.join(heatmap_lines[16:24])
            
            embed = discord.Embed(
                title=f"[{clan_upper}] Activity Heatmap",
                description=f"Peak activity patterns (UTC)",
                color=0x2b2d31
            )
            
            embed.add_field(name="00:00 - 07:00", value=f"```{col1}```", inline=True)
            embed.add_field(name="08:00 - 15:00", value=f"```{col2}```", inline=True)
            embed.add_field(name="16:00 - 23:00", value=f"```{col3}```", inline=True)
            
            top_hours = hour_counter.most_common(3)
            peak_text = '\n'.join([f"{hour:02d}:00 - {count} wins" for hour, count in top_hours])
            peak_text += f"\n\nTotal Points: **{total_points}**"
            embed.add_field(name="Peak Hours", value=peak_text, inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in heatmap: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to generate heatmap.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Heatmap(bot))
