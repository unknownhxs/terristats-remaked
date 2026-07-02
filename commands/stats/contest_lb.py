# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from collections import Counter
from database import db

class ContestLBView(discord.ui.View):
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
            await interaction.response.edit_message(embed=self.create_embed(), view=ContestLBView(self.rankings, self.page))

    @discord.ui.button(label='Next ▶', style=discord.ButtonStyle.secondary)
    async def next_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page < self.max_pages - 1:
            self.page += 1
            await interaction.response.edit_message(embed=self.create_embed(), view=ContestLBView(self.rankings, self.page))

    def create_embed(self):
        start = self.page * self.per_page
        end = start + self.per_page
        page_data = self.rankings[start:end]
        
        embed = discord.Embed(
            title="🎯 Contest Wins Leaderboard",
            description="Top 100 clans by contest wins",
            color=0x2b2d31
        )
        
        clan_list = []
        for i, (clan_name, wins) in enumerate(page_data, start + 1):
            clan_list.append(f"#{i} [{clan_name}] - {wins}")
        
        embed.add_field(name="Rankings", value="\n".join(clan_list) if clan_list else "No data", inline=False)
        embed.set_footer(text=f"Page {self.page + 1}/{self.max_pages}")
        
        return embed

class ContestLB(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='contest_lb', description='Top 100 clans by contest wins')
    async def contest_lb(self, interaction: discord.Interaction):
        try:
            await interaction.response.defer()
            
            pipeline = [
                {'$match': {'contest': True}},
                {'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}},
                {'$limit': 100}
            ]
            
            results = await db.db.clanwins.aggregate(pipeline).to_list(100)
            
            if not results:
                await interaction.followup.send(embed=discord.Embed(
                    title="🎯 Contest Leaderboard", description="No contest wins found.", color=0xff0000
                ))
                return
            
            rankings = [(r['_id'], r['count']) for r in results if r.get('_id')]
            
            if not rankings:
                await interaction.followup.send(embed=discord.Embed(
                    title="🎯 Contest Leaderboard", description="No valid data found.", color=0xff0000
                ))
                return
            
            view = ContestLBView(rankings)
            embed = view.create_embed()
            await interaction.followup.send(embed=embed, view=view)
            
        except Exception as e:
            print(f"Error in contest_lb: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch contest leaderboard.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(ContestLB(bot))
