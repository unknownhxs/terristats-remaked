# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands

class Help(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='help', description='Show all available commands')
    async def help(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="Territorial.io Statistics Bot", 
            description="Complete command list organized by category",
            color=0x0099ff
        )
        
        embed.add_field(
            name="Clan Statistics",
            value="`/clanwins [clan] (days)` - Clan statistics\n"
                  "`/clanprofile [clan]` - Detailed clan card\n"
                  "`/topclans (days)` - Clan leaderboards\n"
                  "`/clanvs [clan1] [clan2] (days)` - Compare clans\n"
                  "`/mvp [clan] (week/month)` - Top players in clan\n"
                  "`/heatmap [clan]` - Activity patterns\n"
                  "`/contest_streak [clan] (hours)` - Contest win streaks\n"
                  "`/clan_24h [clan]` - Last 24 hours stats\n"
                  "`/clanhistory [clan]` - Complete clan history with HD chart",
            inline=False
        )
        
        embed.add_field(
            name="Player & Search",
            value="`/playerstats [player] (days)` - Player stats\n"
                  "`/loyalty [player]` - Player's clan distribution\n"
                  "`/player_24h [player]` - Last 24 hours stats\n"
                  "`/playertimeline [player]` - Complete player journey with HD chart",
            inline=False
        )
        
        embed.add_field(
            name="Map & Contest Analysis",
            value="`/mapstats [map] (days)` - Map statistics\n"
                  "`/dominance [map]` - Clan dominance on map\n"
                  "`/dailywins` - Today's top clans\n"
                  "`/warzone` - Live 6-hour battle royale\n"
                  "`/underdog` - High contest rate clans\n"
                  "`/recentwins [hours]` - Recent activity",
            inline=False
        )
        
        embed.add_field(
            name="🏆 Leaderboards",
            value="`/wins_lb` - Top 100 by total wins\n"
                  "`/contest_lb` - Top 100 by contest wins\n"
                  "`/leaderboard` - Hall of Fame (weighted)",
            inline=False
        )
        
        embed.add_field(
            name="✨ New Commands",
            value="`/rivalry` - Top clan rivalries\n"
                  "`/milestones [clan]` - Achievements & badges\n"
                  "`/compare [player1] [player2]` - Compare players",
            inline=False
        )
        
        embed.add_field(
            name="Bot Information",
            value="`/info` - Bot details and owner info\n"
                  "`/ping` - Check bot response time",
            inline=False
        )
        
        embed.set_footer(text="📖 Full Guide: https://terristatsguide.vercel.app • Data recording from 18 Nov 2025")
        await interaction.response.send_message(embed=embed)

async def setup(bot):
    await bot.add_cog(Help(bot))
