# https://github.com/viktorexe/terristats-discord-bot
import discord
from discord.ext import commands, tasks
from discord import app_commands
import aiohttp
import asyncio
from datetime import datetime, timezone
from collections import Counter
import re
from database import db
from utils import calculate_total_points

class ClanWins(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.scraper_task.start()

    def cog_unload(self):
        self.scraper_task.cancel()

    @tasks.loop(seconds=60)
    async def scraper_task(self):
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.get('https://territorial.io/clan-results', headers=headers) as response:
                    if response.status == 200:
                        text = await response.text()
                        await self.process_all_new_logs(text)
                    elif response.status == 503:
                        print("⚠️  Server unavailable (503) - will retry in 1 min")
                    else:
                        print(f"❌ HTTP Error: {response.status}")
        except (asyncio.TimeoutError, aiohttp.ClientError) as e:
            print(f"🔌 Connection error: {e}")
        except Exception as e:
            print(f"💥 Scraper error: {e}")

    @scraper_task.before_loop
    async def before_scraper(self):
        await self.bot.wait_until_ready()

    async def process_all_new_logs(self, text):
        try:
            if not text:
                return
            
            clean_text = text.replace('<meta charset="UTF-8">', '').replace('<pre>', '').replace('</pre>', '').strip()
            
            logs = clean_text.split('\n\n')
            if not logs:
                return
            
            last_saved = await db.db.clanwins.find_one({}, sort=[('timestamp', -1)])
            last_saved_time = last_saved['time'] if last_saved else None
            
            new_logs = []
            found_last_saved = False
            
            for log in logs:
                log = log.strip()
                if not log:
                    continue
                    
                log_time = None
                for line in log.split('\n'):
                    if 'Time:' in line:
                        log_time = line.split('Time:')[1].strip()
                        break
                
                if not log_time:
                    continue
                    
                if not found_last_saved:
                    if log_time == last_saved_time:
                        found_last_saved = True
                        break
                    new_logs.append(log)
            
            if not last_saved_time and logs:
                new_logs = [logs[0]]
            
            new_logs.reverse()
            saved_count = 0
            
            for log in new_logs:
                log_data = self.parse_log(log)
                if log_data and log_data.get('winning_clan'):
                    try:
                        existing = await db.db.clanwins.find_one({'time': log_data['time']})
                        if not existing:
                            await db.db.clanwins.insert_one(log_data)
                            saved_count += 1
                    except Exception as db_error:
                        print(f"💾 DB ERROR: {db_error}")
            
            if saved_count > 0:
                print(f"✅ BATCH SAVED: {saved_count} new logs")
            
        except Exception as e:
            print(f"💥 PROCESS ERROR: {e}")

    def parse_log(self, log_text):
        try:
            data = {'timestamp': datetime.now(timezone.utc)}
            lines = log_text.split('\n')
            
            for line in lines:
                line = line.strip()
                if ':' not in line:
                    continue
                    
                key, value = line.split(':', 1)
                value = value.strip()
                
                if key == 'Time':
                    data['time'] = value
                elif key == 'Contest':
                    data['contest'] = value.lower() == 'yes'
                elif key == 'Map':
                    data['map'] = value
                elif key == 'Player Count':
                    data['player_count'] = int(value) if value.isdigit() else 0
                elif key == 'Winning Clan':
                    data['winning_clan'] = value
                    clan_match = re.search(r'\[([^\]]+)\]', value)
                    data['clan_name'] = clan_match.group(1) if clan_match else value
                elif key == 'Prev. Points':
                    data['prev_points'] = float(value) if value.replace('.', '').replace('-', '').isdigit() else 0.0
                elif key == 'Gain':
                    data['gain'] = float(value) if value.replace('.', '').replace('-', '').isdigit() else 0.0
                elif key == 'Curr. Points':
                    data['curr_points'] = float(value) if value.replace('.', '').replace('-', '').isdigit() else 0.0
                elif key == 'Payout':
                    data['payout'] = value
                elif key == 'Clan Winners':
                    data['clan_winners'] = [w.strip() for w in value.split(',') if w.strip()]
            
            return data if data.get('winning_clan') else None
        except Exception as e:
            print(f"🔧 PARSE ERROR: {e}")
            return None

    @app_commands.command(name='clanwins', description='Get clan win statistics')
    async def clanwins(self, interaction: discord.Interaction, clan: str, days: int = None):
        try:
            await interaction.response.defer()
            
            if days is not None and days < 0:
                embed = discord.Embed(title="❌ Invalid Input", description="Days must be 0 or greater (0 = last 24 hours, 1 = last 2 days, etc.)", color=0xff0000)
                await interaction.followup.send(embed=embed, ephemeral=True)
                return
            
            clan_upper = clan.upper().strip()
            
            query = {
                'clan_name': {'$regex': f'^{re.escape(clan_upper)}$', '$options': 'i'}
            }
            
            if days is not None:
                from datetime import timedelta
                now = datetime.now(timezone.utc)
                hours_back = (days + 1) * 24
                cutoff_date = now - timedelta(hours=hours_back)
                query['timestamp'] = {'$gte': cutoff_date}
                time_period = "Last 24 Hours" if days == 0 else f"Last {days + 1} Days"
            else:
                time_period = "All Time"
            
            pipeline = [
                {'$match': query},
                {'$facet': {
                    'stats': [{'$group': {
                        '_id': None,
                        'total': {'$sum': 1},
                        'contests': {'$sum': {'$cond': ['$contest', 1, 0]}},
                        'points': {'$sum': {'$cond': ['$contest', {'$multiply': ['$player_count', 2]}, '$player_count']}}
                    }}],
                    'maps': [{'$group': {'_id': '$map', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'players': [{'$unwind': '$clan_winners'}, {'$group': {'_id': '$clan_winners', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 3}],
                    'recent': [{'$sort': {'timestamp': -1}}, {'$limit': 5}, {'$project': {'map': 1}}]
                }}
            ]
            
            result = await db.db.clanwins.aggregate(pipeline).to_list(1)
            if not result or not result[0].get('stats'):
                embed = discord.Embed(
                    title=f"Clan Statistics: [{clan_upper}]", 
                    description="No wins found for this clan.", 
                    color=0xff0000
                )
                await interaction.followup.send(embed=embed)
                return
            
            data = result[0]
            stats = data['stats'][0] if data['stats'] else {}
            total_wins = stats.get('total', 0)
            contest_wins = stats.get('contests', 0)
            total_points = stats.get('points', 0)
            
            top_maps = [(m['_id'], m['count']) for m in data.get('maps', [])]
            top_players = [(p['_id'], p['count']) for p in data.get('players', [])]
            
            embed = discord.Embed(
                title=f"[{clan_upper}] Statistics",
                description=f"{time_period}",
                color=0x2b2d31
            )
            
            stats_text = f"Wins: **{total_wins}** | Contest: **{contest_wins}** ({contest_wins/total_wins*100:.0f}%)\n" if total_wins > 0 else "Wins: **0** | Contest: **0**\n"
            stats_text += f"Points: **{total_points}**"
            embed.add_field(name="Stats", value=stats_text, inline=False)
            
            if top_maps:
                map_text = "\n".join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_maps)])
                embed.add_field(name="Top Maps", value=map_text, inline=True)
            
            if top_players:
                player_text = "\n".join([f"{i+1}. {name} - {count}" for i, (name, count) in enumerate(top_players)])
                embed.add_field(name="Top Players", value=player_text, inline=True)
            
            recent_wins = data.get('recent', [])
            if recent_wins:
                recent_text = "\n".join([f"{win.get('map', 'Unknown')}" for win in recent_wins])
                embed.add_field(name="Recent", value=recent_text, inline=False)
            
            total_games = await db.db.clanwins.count_documents({})
            embed.set_footer(text=f"Data from 18 Nov 2025 | {total_games:,} games tracked")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            print(f"💥 COMMAND ERROR: {e}")
            await interaction.followup.send(embed=discord.Embed(
                title="Error", description="Failed to fetch clan statistics.", color=0xff0000
            ))

async def setup(bot):
    await bot.add_cog(ClanWins(bot))
