# AGENTS.md

## Project overview

`terristats` is a Node.js Discord bot (discord.js v14) that tracks
territorial.io clan/player stats. A background scraper (`scraper.js`) fetches
`https://territorial.io/clan-results` every 60 seconds and stores match logs in
MongoDB (database `terristats`, collection `clanwins`). Slash commands under
`commands/general` and `commands/stats` query that data. `webServer.js` exposes
a `/health` endpoint for hosting health checks.

Standard commands live in `package.json` scripts (`npm start`, `npm run dev`).
Setup and env vars are documented in `README.md` and `.env.example`.

## Cursor Cloud specific instructions

- Runtime: Node.js (>= 18; the VM has v22). The update script runs `npm install`.
- MongoDB is required and runs locally in the VM (installed via the MongoDB
  apt repo, listening on `127.0.0.1:27017`). It is NOT started by the update
  script — start it before running the bot or any DB-backed test, e.g.:
  `mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017` (run it in
  a tmux session so it keeps running). With no Mongo env vars set, the app
  defaults to `mongodb://localhost:27017/`, which matches this local instance.
- Running the bot requires `DISCORD_TOKEN` (add it as a secret). Without it the
  process loads all commands + starts the web server, then exits with
  "DISCORD_TOKEN not found". Set `GUILD_ID` to register slash commands
  instantly in one test guild; otherwise global registration can take ~1 hour.
- The scraper only inserts logs newer than the most recent stored `time`, so on
  a fresh DB the first cycle stores just the latest result; data accumulates
  over subsequent 60s cycles.
- To exercise command/DB/scraper logic without a Discord connection, call a
  command module's `execute()` with a mock interaction (`deferReply`,
  `editReply`, `options.getString/getInteger`, `fetchReply`) against local
  MongoDB — this is the fastest way to verify changes end-to-end here.
