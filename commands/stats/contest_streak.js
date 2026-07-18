// https://github.com/viktorexe/terristats-discord-bot
// /contest_streak - current and best consecutive contest-win streaks for a
// clan. A streak continues while consecutive contest wins are <= 20 minutes
// apart.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

// Format a Date like Python's "%b %d, %Y", e.g. "Nov 18, 2025".
function formatDate(date) {
  if (!date) return 'Unknown';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(date);
  return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contest_streak')
    .setDescription('Show clan contest win streaks')
    .addStringOption((o) =>
      o.setName('clan').setDescription('Clan name').setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName('hours').setDescription('Look-back window (1-720)').setRequired(false),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const clan = interaction.options.getString('clan');
      const hours = interaction.options.getInteger('hours');

      if (hours !== null && (hours <= 0 || hours > 720)) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Invalid Hours')
              .setDescription('Hours must be between 1 and 720 (30 days).')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const clanUpper = clan.toUpperCase().trim();
      const query = { clan_name: exactMatch(clanUpper) };

      let timePeriod;
      if (hours !== null) {
        query.timestamp = { $gte: new Date(Date.now() - hours * 3600 * 1000) };
        timePeriod = `Last ${hours} Hours`;
      } else {
        timePeriod = 'All Time';
      }

      const contestWins = await db
        .collection('clanwins')
        .aggregate([
          { $match: query },
          { $match: { contest: true } },
          { $sort: { timestamp: 1 } },
          { $project: { timestamp: 1 } },
        ])
        .toArray();

      let totalContests = 0;
      let currentStreak = 0;
      let bestStreak = 0;
      let bestStreakStart = null;

      if (contestWins.length) {
        totalContests = contestWins.length;
        let tempStreak = 1;
        bestStreak = 1;
        bestStreakStart = contestWins[0].timestamp;

        for (let i = 1; i < contestWins.length; i += 1) {
          const prev = new Date(contestWins[i - 1].timestamp);
          const curr = new Date(contestWins[i].timestamp);
          const diffMinutes = (curr - prev) / 60000;

          if (diffMinutes <= 20) {
            tempStreak += 1;
            if (tempStreak > bestStreak) {
              bestStreak = tempStreak;
              bestStreakStart = contestWins[i - tempStreak + 1].timestamp;
            }
          } else {
            tempStreak = 1;
          }
        }
        currentStreak = tempStreak;
      }

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}] Contest Streaks`)
        .setDescription(`${timePeriod}\nTotal contest wins: ${totalContests}`)
        .setColor(0x2b2d31);

      embed.addFields({
        name: '🔥 Current Streak',
        value:
          currentStreak > 0
            ? `**${currentStreak}** consecutive contest wins`
            : 'No contest wins in time period',
        inline: false,
      });

      embed.addFields({
        name: '🏆 Best Streak',
        value:
          bestStreak > 0
            ? `**${bestStreak}** consecutive contest wins\nStarted: ${formatDate(bestStreakStart)}`
            : 'No contest wins recorded',
        inline: false,
      });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in contest_streak: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to calculate contest streak.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
