# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone, timedelta
from collections import Counter
from database import db

class Warzone(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='warzone', description='Live 6-hour battle royale leaderboard')
    async def warzone(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=6)
            query = {'timestamp': {'$gte': cutoff_time}}
            
            wins = []
            async for win in db.db.clanwins.find(query):
                wins.append(win)
            
            if not wins:
                embed = discord.Embed(
                    title="Warzone - No Activity",
                    description="No wins in the last 6 hours. The battlefield is quiet...",
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            clan_counter = Counter(win.get('clan_name', 'Unknown') for win in wins if win.get('clan_name'))
            top_clans = clan_counter.most_common(10)
            
            if not top_clans:
                embed = discord.Embed(
                    title="Warzone - No Activity",
                    description="No valid clan data in the last 6 hours.",
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            champion_clan, champion_wins = top_clans[0]
            
            clan_points = {}
            for clan_name, _ in top_clans:
                clan_wins_list = [w for w in wins if w.get('clan_name') == clan_name]
                clan_points[clan_name] = sum(w.get('player_count', 0) for w in clan_wins_list)
            
            now = datetime.now(timezone.utc)
            hours_since_start = now.hour % 6
            minutes_since_start = now.minute
            hours_until_reset = 5 - hours_since_start
            minutes_until_reset = 60 - minutes_since_start
            
            if minutes_until_reset == 60:
                hours_until_reset += 1
                minutes_until_reset = 0
            
            embed = discord.Embed(
                title="⚔️ WARZONE - Live Battle Royale",
                description=f"6-Hour Leaderboard | Resets in **{hours_until_reset}h {minutes_until_reset}m**",
                color=0xff4500
            )
            
            champion_points = clan_points.get(champion_clan, 0)
            embed.add_field(
                name="👑 KING OF THE HILL",
                value=f"**[{champion_clan}]**\n{champion_wins} wins | {champion_points} points",
                inline=False
            )
            
            rankings = []
            for i, (clan, count) in enumerate(top_clans, 1):
                points = clan_points.get(clan, 0)
                if i == 1:
                    medal = "👑"
                elif i == 2:
                    medal = "🥈"
                elif i == 3:
                    medal = "🥉"
                else:
                    medal = f"#{i}"
                
                rankings.append(f"{medal} [{clan}] - {count} wins | {points}pts")
            
            embed.add_field(
                name="🏆 Live Rankings",
                value="\n".join(rankings),
                inline=False
            )
            
            total_wins = len(wins)
            total_points = sum(w.get('player_count', 0) for w in wins)
            contest_wins = sum(1 for w in wins if w.get('contest', False))
            
            stats_text = f"Total Battles: **{total_wins}**\n"
            stats_text += f"Contest Battles: **{contest_wins}**\n"
            stats_text += f"Total Points: **{total_points}**\n"
            stats_text += f"Active Clans: **{len(top_clans)}**"
            
            embed.add_field(
                name="📊 Warzone Stats",
                value=stats_text,
                inline=False
            )
            
            latest_win = sorted(wins, key=lambda x: x.get('timestamp', datetime.min.replace(tzinfo=timezone.utc)), reverse=True)[0]
            win_time = latest_win.get('timestamp', datetime.now(timezone.utc))
            if win_time.tzinfo is None:
                win_time = win_time.replace(tzinfo=timezone.utc)
            
            time_ago = datetime.now(timezone.utc) - win_time
            mins_ago = int(time_ago.total_seconds() / 60)
            
            if mins_ago < 1:
                time_str = "just now"
            elif mins_ago < 60:
                time_str = f"{mins_ago}m ago"
            else:
                hours_ago = mins_ago // 60
                time_str = f"{hours_ago}h ago"
            
            embed.add_field(
                name="⚡ Latest Battle",
                value=f"[{latest_win.get('clan_name', 'Unknown')}] won on {latest_win.get('map', 'Unknown')} - {time_str}",
                inline=False
            )
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in warzone: {e}")
            await interaction.followup.send(embed=discord.Embed(
                title="Error", description="Failed to load warzone.", color=0xff0000
            ))

async def setup(bot):
    await bot.add_cog(Warzone(bot))
