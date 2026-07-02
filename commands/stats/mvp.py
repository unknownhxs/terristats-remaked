# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter
from datetime import datetime, timezone, timedelta
import re
from database import db

class MVP(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='mvp', description='Most valuable players in a clan')
    @app_commands.describe(
        clan='Clan name',
        week='Select a week (cannot use with month)',
        month='Select a month (cannot use with week)'
    )
    @app_commands.choices(week=[
        app_commands.Choice(name='This Week', value=0),
        app_commands.Choice(name='Last Week', value=1),
        app_commands.Choice(name='2 Weeks Ago', value=2),
        app_commands.Choice(name='3 Weeks Ago', value=3),
        app_commands.Choice(name='4 Weeks Ago', value=4)
    ])
    @app_commands.choices(month=[
        app_commands.Choice(name='November 2025 (from 18th)', value='2025-11'),
        app_commands.Choice(name='December 2025', value='2025-12')
    ])
    async def mvp(self, interaction: discord.Interaction, clan: str, week: int = None, month: str = None):
        try:
            await interaction.response.defer()
            
            if week is not None and month is not None:
                await interaction.followup.send(embed=discord.Embed(
                    title="❌ Invalid Input",
                    description="Cannot use both week and month filters together.",
                    color=0xff0000
                ), ephemeral=True)
                return
            
            clan_upper = clan.upper().strip()
            query = {'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'}}
            
            time_period = "All Time"
            if week is not None:
                now = datetime.now(timezone.utc)
                weeks_back = week
                start_of_week = now - timedelta(days=now.weekday() + (weeks_back * 7))
                start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
                query['timestamp'] = {'$gte': start_of_week}
                if week == 0:
                    time_period = "This Week"
                else:
                    time_period = f"{week} Week{'s' if week > 1 else ''} Ago to Date"
            elif month is not None:
                year, mon = month.split('-')
                year, mon = int(year), int(mon)
                if year == 2025 and mon == 11:
                    start_date = datetime(2025, 11, 18, 0, 0, 0, tzinfo=timezone.utc)
                    time_period = "November 2025 (from 18th)"
                else:
                    start_date = datetime(year, mon, 1, 0, 0, 0, tzinfo=timezone.utc)
                    time_period = f"{datetime(year, mon, 1).strftime('%B %Y')}"
                query['timestamp'] = {'$gte': start_date}
            
            wins = []
            async for win in db.db.clanwins.find(query):
                wins.append(win)
            
            if not wins:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"[{clan_upper}] MVP", description="No wins found.", color=0xff0000
                ))
                return
            
            all_winners = []
            for win in wins:
                winners = win.get('clan_winners', [])
                if isinstance(winners, list):
                    all_winners.extend(winners)
            
            if not all_winners:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"[{clan_upper}] MVP", description="No player data found.", color=0xff0000
                ))
                return
            
            player_counter = Counter(all_winners)
            total_wins = len(wins)
            total_points = sum(win.get('player_count', 0) * 2 if win.get('contest', False) else win.get('player_count', 0) for win in wins)
            
            embed = discord.Embed(
                title=f"[{clan_upper}] MVP Rankings",
                description=f"{time_period}\n{total_wins} wins | {total_points} points",
                color=0x2b2d31
            )
            
            mvp_list = []
            for i, (player, count) in enumerate(player_counter.most_common(10), 1):
                participation = (count / total_wins) * 100
                player_wins = [w for w in wins if player in w.get('clan_winners', [])]
                player_contests = sum(1 for w in player_wins if w.get('contest', False))
                player_points = sum(w.get('player_count', 0) * 2 if w.get('contest', False) else w.get('player_count', 0) for w in player_wins)
                mvp_list.append(f"#{i} {player}\nWins: {count} | Contest: {player_contests} | Points: {player_points} ({participation:.1f}%)")
            
            embed.add_field(name="Top Players", value='\n\n'.join(mvp_list) if mvp_list else "No data", inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in mvp: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch MVP data.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(MVP(bot))
