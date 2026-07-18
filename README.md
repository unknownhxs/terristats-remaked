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
| `/help` | full command list |
| `/ping` | check bot latency |

## self hosting

1. clone the repo
2. create a `.env` file with your tokens (see `.env.example`)
3. install dependencies: `npm install`
4. run: `npm start` (or `npm run dev` for auto-restart on file changes)

**.env**
```
DISCORD_TOKEN=your_token
MONGO_URI=mongodb://localhost:27017/
```

Set `GUILD_ID` in `.env` to register slash commands instantly in one guild
during development; otherwise commands are registered globally (which can take
up to an hour to appear).

## stack

- [discord.js](https://discord.js.org) v14
- mongodb (official `mongodb` driver)
- Node.js built-in `fetch` for scraping
- Node.js built-in `http` for the health-check web server
- hosted on railway (preferred)

## project structure

```
index.js          # entry point: loads commands, connects, registers, runs
database.js       # mongodb connection + index setup
scraper.js        # background scraper (territorial.io -> mongodb)
webServer.js      # tiny health-check http server
utils.js          # shared scoring/query helpers
pagination.js     # reusable button pagination for leaderboards
commands/general  # /help, /ping
commands/stats    # every stats slash command
```

---

## license

see [LICENSE](LICENSE)
