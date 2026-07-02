# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands
from discord import app_commands
from datetime import datetime, timezone
from collections import Counter
from database import db

class TopClansView(discord.ui.View):
    def __init__(self, all_wins, contest_wins, page=0, contest_mode=False):
        super().__init__(timeout=300)
        self.all_wins = all_wins
        self.contest_wins = contest_wins
        self.page = page
        self.contest_mode = contest_mode
        self.per_page = 10
        
        current_data = contest_wins if contest_mode else all_wins
        self.max_pages = (len(current_data) - 1) // self.per_page + 1 if current_data else 1
        
        if self.page <= 0:
            self.previous_button.disabled = True
        if self.page >= self.max_pages - 1:
            self.next_button.disabled = True
            
        self.contest_button.style = discord.ButtonStyle.primary if contest_mode else discord.ButtonStyle.secondary
        self.all_button.style = discord.ButtonStyle.secondary if contest_mode else discord.ButtonStyle.primary

    @discord.ui.button(label='All Wins', style=discord.ButtonStyle.primary, row=0)
    async def all_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.contest_mode:
            self.contest_mode = False
            if self.page >= (len(self.all_wins) - 1) // self.per_page + 1:
                self.page = max(0, (len(self.all_wins) - 1) // self.per_page)
            await interaction.response.edit_message(embed=self.create_embed(), view=TopClansView(self.all_wins, self.contest_wins, self.page, False))

    @discord.ui.button(label='Contest Only', style=discord.ButtonStyle.secondary, row=0)
    async def contest_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not self.contest_mode:
            self.contest_mode = True
            if self.page >= (len(self.contest_wins) - 1) // self.per_page + 1:
                self.page = max(0, (len(self.contest_wins) - 1) // self.per_page)
            await interaction.response.edit_message(embed=self.create_embed(), view=TopClansView(self.all_wins, self.contest_wins, self.page, True))

    @discord.ui.button(label='◀ Previous', style=discord.ButtonStyle.secondary, row=1)
    async def previous_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page > 0:
            self.page -= 1
            await interaction.response.edit_message(embed=self.create_embed(), view=TopClansView(self.all_wins, self.contest_wins, self.page, self.contest_mode))

    @discord.ui.button(label='Next ▶', style=discord.ButtonStyle.secondary, row=1)
    async def next_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page < self.max_pages - 1:
            self.page += 1
            await interaction.response.edit_message(embed=self.create_embed(), view=TopClansView(self.all_wins, self.contest_wins, self.page, self.contest_mode))

    def create_embed(self):
        current_data = self.contest_wins if self.contest_mode else self.all_wins
        start = self.page * self.per_page
        end = start + self.per_page
        page_data = current_data[start:end]
        
        title = "Top Clans - Contest" if self.contest_mode else "Top Clans - Total"
        description = "Ranked by contest wins" if self.contest_mode else "Ranked by total wins"
        
        embed = discord.Embed(title=title, description=description, color=0x2b2d31)
        
        clan_list = []
        for i, (clan_name, wins) in enumerate(page_data, start + 1):
            medal = "#1" if i == 1 else "#2" if i == 2 else "#3" if i == 3 else f"#{i}"
            clan_list.append(f"{medal} [{clan_name}] - {wins}")
        
        embed.add_field(name="Rankings", value="\n".join(clan_list) if clan_list else "No data", inline=False)
        embed.set_footer(text=f"Data from 18 Nov 2025 | Page {self.page + 1}/{self.max_pages}")
        
        return embed

class TopClans(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name='topclans', description='Show top clans by total wins')
    async def topclans(self, interaction: discord.Interaction, days: int = None):
        try:
            await interaction.response.defer()
            
            if days is not None and days < 0:
                embed = discord.Embed(title="❌ Invalid Input", description="Days must be 0 or greater (0 = last 24 hours, 1 = last 2 days, etc.)", color=0xff0000)
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            
            match_stage = {}
            if days is not None:
                from datetime import timedelta
                now = datetime.now(timezone.utc)
                hours_back = (days + 1) * 24
                cutoff_date = now - timedelta(hours=hours_back)
                match_stage = {'timestamp': {'$gte': cutoff_date}}
            
            pipeline_all = [
                {'$match': match_stage} if match_stage else {'$match': {}},
                {'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}}
            ]
            
            match_contest = match_stage.copy() if match_stage else {}
            match_contest['contest'] = True
            pipeline_contest = [
                {'$match': match_contest},
                {'$group': {'_id': '$clan_name', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}}
            ]
            
            all_results = await db.db.clanwins.aggregate(pipeline_all).to_list(None)
            contest_results = await db.db.clanwins.aggregate(pipeline_contest).to_list(None)
            
            all_clans = [(r['_id'], r['count']) for r in all_results if r.get('_id')]
            contest_clans = [(r['_id'], r['count']) for r in contest_results if r.get('_id')]
            
            if not all_clans:
                embed = discord.Embed(
                    title="🏆 Top Clans by Wins",
                    description="No valid clan data found.",
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            view = TopClansView(all_clans, contest_clans)
            embed = view.create_embed()
            await interaction.followup.send(embed=embed, view=view)
            
        except Exception as e:
            print(f"Error in topclans command: {e}")
            try:
                await interaction.followup.send(embed=discord.Embed(
                    title="Error", description="Failed to fetch clan rankings.", color=0xff0000
                ))
            except:
                pass

async def setup(bot):
    await bot.add_cog(TopClans(bot))
