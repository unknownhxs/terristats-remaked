# terristats

a discord bot that tracks clan and player stats for [territorial.io](https://territorial.io)

data is scraped from `territorial.io/clan-results` every 60 seconds and stored in mongodb.

**[invite the bot](https://discord.com/oauth2/authorize?client_id=1283122663027507355)**

---

## what it does

- tracks every clan win, contest win, map, and player automatically
- slash commands for clan stats, player stats, leaderboards, rivalries, and more
- all data is stored and queryable with optional time filters

## commands

| command | description |
|---|---|
| `/clanwins` | clan win stats with optional day filter |
| `/clanprofile` | full clan profile card |
| `/clanvs` | head to head between two clans |
| `/clan_24h` | clan activity in last 24 hours |
| `/playerstats` | individual player stats |
| `/player_24h` | player activity in last 24 hours |
| `/compare` | compare two players |
| `/leaderboard` | combined weighted leaderboard |
| `/topclans` | top clans by wins or contest wins |
| `/wins_lb` | top 100 clans by total wins |
| `/contest_lb` | top 100 clans by contest wins |
| `/mapstats` | stats for a specific map |
| `/dominance` | clan dominance % on a map |
| `/heatmap` | clan activity by hour |
| `/mvp` | top players in a clan |
| `/rivalry` | most competitive clan matchups |
| `/loyalty` | which clans a player plays with most |
| `/recentwins` | wins in last X hours |
| `/dailywins` | today's top clans |
| `/warzone` | live 6-hour battle leaderboard |
| `/milestones` | clan milestone badges |
| `/contest_streak` | clan contest win streaks |
| `/underdog` | high contest rate, low total wins |

## self hosting

1. clone the repo
2. create a `.env` file with your tokens (see below)
3. install dependencies: `pip install -r requirements.txt` for linux users use `pip install -r requirements.txt --break-system-packages`
4. run: `python main.py` for linux users run `python3 main.py`

**.env**
```
DISCORD_TOKEN=your_token
MONGODB_URI=your_mongodb_uri
```

## stack

- discord.py 2.3.2
- mongodb + motor (async)
- aiohttp for scraping
- hosted on railway (preferred)

---

## license

see [LICENSE](LICENSE)
