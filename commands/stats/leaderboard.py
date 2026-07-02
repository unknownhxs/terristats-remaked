# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter, defaultdict
from database import db

class LeaderboardView(discord.ui.View):
    def __init__(self, rankings, page=0):
        super().__init__(timeout=300)
        self.rankings = rankings
        self.page = page
        self.per_page = 10
        self.max_pages = (len(rankings) - 1) // self.per_page + 1 if rankings else 1
        
        if self.page <= 0:
            self.previous_button.disabled = True
        if self.page >= self.max_pages - 1:
            self.next_button.disabled = True

    @discord.ui.button(label='◀ Previous', style=discord.ButtonStyle.secondary)
    async def previous_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page > 0:
            self.page -= 1
            await interaction.response.edit_message(embed=self.create_embed(), view=LeaderboardView(self.rankings, self.page))

    @discord.ui.button(label='Next ▶', style=discord.ButtonStyle.secondary)
    async def next_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page < self.max_pages - 1:
            self.page += 1
            await interaction.response.edit_message(embed=self.create_embed(), view=LeaderboardView(self.rankings, self.page))

    def create_embed(self):
        start = self.page * self.per_page
        end = start + self.per_page
        page_data = self.rankings[start:end]
        
        embed = discord.Embed(
            title="🏆 Hall of Fame - Combined Leaderboard",
            description="Weighted scoring: Wins × 1.0 + Contests × 2.0 + Points × 0.01",
            color=0xffd700
        )
        
        clan_list = []
        for i, (clan_name, score, wins, contests, points) in enumerate(page_data, start + 1):
            if i == 1:
                medal = "👑"
            elif i == 2:
                medal = "🥈"
            elif i == 3:
                medal = "🥉"
            else:
                medal = f"#{i}"
            
            clan_list.append(f"{medal} **[{clan_name}]** - {score:.1f} pts\nWins: {wins} | Contests: {contests} | Points: {points}")
        
        embed.add_field(name="Rankings", value="\n\n".join(clan_list) if clan_list else "No data", inline=False)
        embed.set_footer(text=f"Page {self.page + 1}/{self.max_pages}")
        
        return embed

class Leaderboard(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='leaderboard', description='Combined leaderboard with weighted scoring system')
    async def leaderboard(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            
            pipeline = [
                {
                    '$group': {
                        '_id': '$clan_name',
                        'wins': {'$sum': 1},
                        'contests': {
                            '$sum': {'$cond': [{'$eq': ['$contest', True]}, 1, 0]}
                        },
                        'points': {'$sum': '$player_count'}
                    }
                },
                {
                    '$project': {
                        'clan_name': '$_id',
                        'wins': 1,
                        'contests': 1,
                        'points': 1,
                        'score': {
                            '$add': [
                                {'$multiply': ['$wins', 1.0]},
                                {'$multiply': ['$contests', 2.0]},
                                {'$multiply': ['$points', 0.01]}
                            ]
                        }
                    }
                },
                {'$sort': {'score': -1}},
                {'$limit': 100}
            ]
            
            results = await db.db.clanwins.aggregate(pipeline).to_list(100)
            
            if not results:
                await interaction.followup.send(embed=discord.Embed(
                    title="🏆 Hall of Fame", description="No data found.", color=0xff0000
                ))
                return
            
            rankings = [
                (r['clan_name'], r['score'], r['wins'], r['contests'], r['points'])
                for r in results if r.get('clan_name')
            ]
            
            if not rankings:
                await interaction.followup.send(embed=discord.Embed(
                    title="🏆 Hall of Fame", description="No valid data found.", color=0xff0000
                ))
                return
            
            view = LeaderboardView(rankings)
            embed = view.create_embed()
            await interaction.followup.send(embed=embed, view=view)
            
        except Exception as e:
            print(f"Error in leaderboard: {e}")
            await interaction.followup.send(embed=discord.Embed(
                title="Error", description="Failed to generate leaderboard.", color=0xff0000
            ))

async def setup(bot):
    await bot.add_cog(Leaderboard(bot))
