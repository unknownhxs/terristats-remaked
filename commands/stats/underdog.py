# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter
from database import db

class Underdog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='underdog', description='Clans with high contest win rate but low total wins')
    async def underdog(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            
            pipeline = [
                {
                    '$group': {
                        '_id': '$clan_name',
                        'total': {'$sum': 1},
                        'contest': {'$sum': {'$cond': [{'$eq': ['$contest', True]}, 1, 0]}},
                        'points': {'$sum': '$player_count'}
                    }
                },
                {
                    '$match': {
                        'total': {'$gte': 5, '$lte': 50}
                    }
                },
                {
                    '$project': {
                        'clan': '$_id',
                        'total': 1,
                        'contest': 1,
                        'points': 1,
                        'rate': {
                            '$multiply': [
                                {'$divide': ['$contest', '$total']},
                                100
                            ]
                        }
                    }
                },
                {
                    '$match': {
                        'rate': {'$gte': 40}
                    }
                },
                {'$sort': {'rate': -1}},
                {'$limit': 10}
            ]
            
            results = await db.db.clanwins.aggregate(pipeline).to_list(10)
            
            if not results:
                await interaction.followup.send(embed=discord.Embed(
                    title="Underdog Clans", description="No underdogs found.", color=0xff0000
                ))
                return
            
            embed = discord.Embed(
                title="Underdog Clans",
                description="High contest rate, low total wins (5-50 wins, >40% contest)",
                color=0x2b2d31
            )
            
            rankings = []
            for i, r in enumerate(results, 1):
                clan = r.get('clan', 'Unknown')
                total = r.get('total', 0)
                contest = r.get('contest', 0)
                rate = r.get('rate', 0)
                points = r.get('points', 0)
                rankings.append(f"#{i} [{clan}]\nWins: {total} | Contest: {contest} ({rate:.1f}%) | Points: {points}")
            
            embed.add_field(name="Rankings", value='\n\n'.join(rankings), inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"Error in underdog: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to find underdogs.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(Underdog(bot))
