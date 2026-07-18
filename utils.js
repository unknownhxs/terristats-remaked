// https://github.com/viktorexe/terristats-discord-bot
// Small scoring helpers shared by the stats commands.

/**
 * Calculate points for a single win. Contest wins count double.
 * @param {object} win - A clanwins document.
 * @returns {number} points awarded for this win.
 */
function getPoints(win) {
  const basePoints = win.player_count || 0;
  if (win.contest) {
    return basePoints * 2;
  }
  return basePoints;
}

/**
 * Sum the points across a list of wins.
 * @param {object[]} wins - Array of clanwins documents.
 * @returns {number} total points.
 */
function calculateTotalPoints(wins) {
  return wins.reduce((total, win) => total + getPoints(win), 0);
}

/**
 * Escape a string so it can be safely embedded in a RegExp.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a case-insensitive exact-match Mongo regex query value, mirroring the
 * original `{'$regex': f'^{re.escape(x)}$', '$options': 'i'}` pattern.
 * @param {string} value
 * @returns {{$regex: string, $options: string}}
 */
function exactMatch(value) {
  return { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
}

/**
 * Standard embed footer used across every stats command.
 * @param {number} totalGames
 * @returns {string}
 */
function gamesFooter(totalGames) {
  return `Data from 18 Nov 2025 | ${totalGames.toLocaleString('en-US')} games tracked`;
}

module.exports = {
  getPoints,
  calculateTotalPoints,
  escapeRegex,
  exactMatch,
  gamesFooter,
};
