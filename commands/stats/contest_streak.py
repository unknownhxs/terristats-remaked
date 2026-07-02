# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
import re
from database import db

class ContestStreak(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='contest_streak', description='Show clan contest win streaks')
    async def contest_streak(self, interaction: discord.Interaction, clan: str, hours: int = None):
        try:
            await interaction.response.defer()
            
            if hours is not None and (hours <= 0 or hours > 720):
                await interaction.followup.send(embed=discord.Embed(
                    title="❌ Invalid Hours", 
                    description="Hours must be between 1 and 720 (30 days).", 
                    color=0xff0000
                ), ephemeral=True)
                return
            
            clan_upper = clan.upper().strip()
            query = {'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'}}
            
            if hours is not None:
                from datetime import timedelta
                cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
                query['timestamp'] = {'$gte': cutoff_time}
                time_period = f"Last {hours} Hours"
            else:
                time_period = "All Time"
            
            pipeline = [
                {'$match': query},
                {'$match': {'contest': True}},
                {'$sort': {'timestamp': 1}},
                {'$project': {'timestamp': 1}}
            ]
            
            contest_only_wins = await db.db.clanwins.aggregate(pipeline).to_list(None)
            
            if not contest_only_wins:
                total_contests = 0
            else:
                total_contests = len(contest_only_wins)
                
                temp_streak = 1
                best_streak = 1
                current_streak = 1
                best_streak_start = contest_only_wins[0].get('timestamp')
                
                for i in range(1, len(contest_only_wins)):
                    prev_time = contest_only_wins[i-1].get('timestamp', datetime.min.replace(tzinfo=timezone.utc))
                    curr_time = contest_only_wins[i].get('timestamp', datetime.min.replace(tzinfo=timezone.utc))
                    
                    if prev_time.tzinfo is None:
                        prev_time = prev_time.replace(tzinfo=timezone.utc)
                    if curr_time.tzinfo is None:
                        curr_time = curr_time.replace(tzinfo=timezone.utc)
                    
                    time_diff = (curr_time - prev_time).total_seconds() / 60  # Convert to minutes
                    
                    if time_diff <= 20:
                        temp_streak += 1
                        if temp_streak > best_streak:
                            best_streak = temp_streak
                            best_streak_start = contest_only_wins[i - temp_streak + 1].get('timestamp')
                    else:
                        temp_streak = 1
                
                current_streak = temp_streak
            
            embed = discord.Embed(
                title=f"[{clan_upper}] Contest Streaks",
                description=f"{time_period}\nTotal contest wins: {total_contests}",
                color=0x2b2d31
            )
            
            if current_streak > 0:
                embed.add_field(
                    name="🔥 Current Streak",
                    value=f"**{current_streak}** consecutive contest wins",
                    inline=False
                )
            else:
                embed.add_field(
                    name="🔥 Current Streak",
                    value="No contest wins in time period",
                    inline=False
                )
            
            if best_streak > 0:
                date_str = best_streak_start.strftime('%b %d, %Y') if best_streak_start else 'Unknown'
                embed.add_field(
                    name="🏆 Best Streak",
                    value=f"**{best_streak}** consecutive contest wins\nStarted: {date_str}",
                    inline=False
                )
            else:
                embed.add_field(
                    name="🏆 Best Streak",
                    value="No contest wins recorded",
                    inline=False
                )
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in contest_streak: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to calculate contest streak.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(ContestStreak(bot))
