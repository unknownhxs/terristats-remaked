// https://github.com/viktorexe/terristats-discord-bot
// Background scraper: fetches https://territorial.io/clan-results once a
// minute, parses any new match logs and stores them in MongoDB. This is the
// data source that powers every stats command.
const db = require('./database');

const SCRAPE_URL = 'https://territorial.io/clan-results';
const SCRAPE_INTERVAL_MS = 60 * 1000; // 60 seconds, matching the original bot.

/**
 * Parse a single raw log block into a clanwins document.
 * The remote page uses simple "Key: Value" lines separated by blank lines.
 * @param {string} logText - one log block.
 * @returns {object|null} parsed document, or null when there is no winner.
 */
function parseLog(logText) {
  try {
    const data = { timestamp: new Date() };
    const lines = logText.split('\n');

    for (let line of lines) {
      line = line.trim();
      if (!line.includes(':')) continue;

      const idx = line.indexOf(':');
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1).trim();

      switch (key) {
        case 'Time':
          data.time = value;
          break;
        case 'Contest':
          data.contest = value.toLowerCase() === 'yes';
          break;
        case 'Map':
          data.map = value;
          break;
        case 'Player Count':
          data.player_count = /^\d+$/.test(value) ? parseInt(value, 10) : 0;
          break;
        case 'Winning Clan': {
          data.winning_clan = value;
          // The clan tag is inside square brackets, e.g. "[ABC] Some Name".
          const clanMatch = value.match(/\[([^\]]+)\]/);
          data.clan_name = clanMatch ? clanMatch[1] : value;
          break;
        }
        case 'Prev. Points':
          data.prev_points = isNumeric(value) ? parseFloat(value) : 0.0;
          break;
        case 'Gain':
          data.gain = isNumeric(value) ? parseFloat(value) : 0.0;
          break;
        case 'Curr. Points':
          data.curr_points = isNumeric(value) ? parseFloat(value) : 0.0;
          break;
        case 'Payout':
          data.payout = value;
          break;
        case 'Clan Winners':
          data.clan_winners = value
            .split(',')
            .map((w) => w.trim())
            .filter((w) => w.length > 0);
          break;
        default:
          break;
      }
    }

    return data.winning_clan ? data : null;
  } catch (err) {
    console.log(`PARSE ERROR: ${err.message}`);
    return null;
  }
}

/** Loose numeric check mirroring the original Python behaviour. */
function isNumeric(value) {
  return /^-?\d*\.?\d+$/.test(value);
}

/**
 * Process the full page text, storing every log newer than the last saved one.
 * @param {string} text - raw HTML/text body from the results page.
 */
async function processAllNewLogs(text) {
  try {
    if (!text) return;

    const cleanText = text
      .replace('<meta charset="UTF-8">', '')
      .replace('<pre>', '')
      .replace('</pre>', '')
      .trim();

    const logs = cleanText.split('\n\n');
    if (logs.length === 0) return;

    const lastSaved = await db
      .collection('clanwins')
      .findOne({}, { sort: { timestamp: -1 } });
    const lastSavedTime = lastSaved ? lastSaved.time : null;

    const newLogs = [];
    let foundLastSaved = false;

    for (const rawLog of logs) {
      const log = rawLog.trim();
      if (!log) continue;

      let logTime = null;
      for (const line of log.split('\n')) {
        if (line.includes('Time:')) {
          logTime = line.split('Time:')[1].trim();
          break;
        }
      }
      if (!logTime) continue;

      if (!foundLastSaved) {
        if (logTime === lastSavedTime) {
          foundLastSaved = true;
          break;
        }
        newLogs.push(log);
      }
    }

    // First run ever: only keep the most recent log so we do not backfill junk.
    if (!lastSavedTime && logs.length > 0) {
      newLogs.length = 0;
      newLogs.push(logs[0]);
    }

    // Oldest first so timestamps stay in chronological insert order.
    newLogs.reverse();
    let savedCount = 0;

    for (const log of newLogs) {
      const logData = parseLog(log);
      if (logData && logData.winning_clan) {
        try {
          const existing = await db
            .collection('clanwins')
            .findOne({ time: logData.time });
          if (!existing) {
            await db.collection('clanwins').insertOne(logData);
            savedCount += 1;
          }
        } catch (dbError) {
          console.log(`DB ERROR: ${dbError.message}`);
        }
      }
    }

    if (savedCount > 0) {
      console.log(`BATCH SAVED: ${savedCount} new logs`);
    }
  } catch (err) {
    console.log(`PROCESS ERROR: ${err.message}`);
  }
}

/** Perform a single scrape cycle. Exposed so it can be tested in isolation. */
async function scrapeOnce() {
  try {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(SCRAPE_URL, {
        headers,
        signal: controller.signal,
      });
      if (response.status === 200) {
        const text = await response.text();
        await processAllNewLogs(text);
      } else if (response.status === 503) {
        console.log('Server unavailable (503) - will retry in 1 min');
      } else {
        console.log(`HTTP Error: ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.log(`Scraper error: ${err.message}`);
  }
}

/**
 * Start the recurring scrape loop. Runs immediately, then every 60 seconds.
 * @returns {NodeJS.Timeout} the interval handle (so callers can stop it).
 */
function startScraper() {
  scrapeOnce();
  return setInterval(scrapeOnce, SCRAPE_INTERVAL_MS);
}

module.exports = { startScraper, scrapeOnce, processAllNewLogs, parseLog };
