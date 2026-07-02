# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
import re
from database import db

class Milestones(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='milestones', description='Show clan milestones and achievements')
    async def milestones(self, interaction: discord.Interaction, clan: str):
        try:
            await interaction.response.defer()
            
            clan_upper = clan.upper().strip()
            query = {'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'}}
            
            pipeline = [
                {'$match': query},
                {'$group': {
                    '_id': None,
                    'total': {'$sum': 1},
                    'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                    'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result:
                await interaction.followup.send(embed=discord.Embed(
                    title=f"[{clan_upper}] Milestones", description="No data found.", color=0xff0000
                ))
                return
            
            stats = result[0]
            total_wins = stats.get('total', 0)
            contest_wins = stats.get('contests', 0)
            total_points = stats.get('points', 0)
            
            win_milestones = [10, 25, 50, 100, 250, 500, 1000]
            contest_milestones = [5, 10, 25, 50, 100, 250]
            point_milestones = [100, 500, 1000, 2500, 5000, 10000]
            
            highest_win = max([m for m in win_milestones if total_wins >= m], default=0)
            highest_contest = max([m for m in contest_milestones if contest_wins >= m], default=0)
            highest_point = max([m for m in point_milestones if total_points >= m], default=0)
            
            next_win = next((m for m in win_milestones if total_wins < m), None)
            next_contest = next((m for m in contest_milestones if contest_wins < m), None)
            next_point = next((m for m in point_milestones if total_points < m), None)
            
            embed = discord.Embed(
                title=f"[{clan_upper}] Milestones",
                description=f"{total_wins} wins | {contest_wins} contests | {total_points} points",
                color=0xffd700
            )
            
            achievements = []
            if highest_win > 0:
                achievements.append(f"🏆 {highest_win} Wins")
            if highest_contest > 0:
                achievements.append(f"🎯 {highest_contest} Contests")
            if highest_point > 0:
                achievements.append(f"💰 {highest_point} Points")
            
            if achievements:
                embed.add_field(name="🏅 Current Badges", value="\n".join(achievements), inline=False)
            
            next_goals = []
            if next_win:
                next_goals.append(f"🏆 {next_win} Wins ({next_win - total_wins} to go)")
            if next_contest:
                next_goals.append(f"🎯 {next_contest} Contests ({next_contest - contest_wins} to go)")
            if next_point:
                next_goals.append(f"💰 {next_point} Points ({next_point - total_points} to go)")
            
            if next_goals:
                embed.add_field(name="🎯 Next Goals", value="\n".join(next_goals), inline=False)
            else:
                embed.add_field(name="🎯 Next Goals", value="All milestones unlocked!", inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in milestones: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch milestones.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Milestones(bot))
