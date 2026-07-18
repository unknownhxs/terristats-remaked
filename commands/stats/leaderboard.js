// https://github.com/viktorexe/terristats-discord-bot
// /leaderboard - "Hall of Fame" combined leaderboard using a weighted score:
// wins * 1.0 + contests * 2.0 + points * 0.01, paginated.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { sendPaginated } = require('../../pagination');

const PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Combined leaderboard with weighted scoring system'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const pipeline = [
        {
          $group: {
            _id: '$clan_name',
            wins: { $sum: 1 },
            contests: { $sum: { $cond: [{ $eq: ['$contest', true] }, 1, 0] } },
            points: { $sum: '$player_count' },
          },
        },
        {
          $project: {
            clan_name: '$_id',
            wins: 1,
            contests: 1,
            points: 1,
            score: {
              $add: [
                { $multiply: ['$wins', 1.0] },
                { $multiply: ['$contests', 2.0] },
                { $multiply: ['$points', 0.01] },
              ],
            },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 100 },
      ];

      const results = await db.collection('clanwins').aggregate(pipeline).toArray();
      const rankings = results
        .filter((r) => r.clan_name)
        .map((r) => [r.clan_name, r.score, r.wins, r.contests, r.points]);

      if (!rankings.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🏆 Hall of Fame')
              .setDescription('No data found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const maxPages = Math.ceil(rankings.length / PER_PAGE);
      const buildEmbed = (page) => {
        const start = page * PER_PAGE;
        const pageData = rankings.slice(start, start + PER_PAGE);
        const clanList = pageData.map(([clan, score, wins, contests, points], i) => {
          const rank = start + i + 1;
          let medal;
          if (rank === 1) medal = '👑';
          else if (rank === 2) medal = '🥈';
          else if (rank === 3) medal = '🥉';
          else medal = `#${rank}`;
          return `${medal} **[${clan}]** - ${score.toFixed(1)} pts\nWins: ${wins} | Contests: ${contests} | Points: ${points}`;
        });
        return new EmbedBuilder()
          .setTitle('🏆 Hall of Fame - Combined Leaderboard')
          .setDescription('Weighted scoring: Wins × 1.0 + Contests × 2.0 + Points × 0.01')
          .setColor(0xffd700)
          .addFields({ name: 'Rankings', value: clanList.join('\n\n') || 'No data', inline: false })
          .setFooter({ text: `Page ${page + 1}/${maxPages}` });
      };

      await sendPaginated(interaction, { pageCount: maxPages, buildEmbed });
    } catch (err) {
      console.log(`Error in leaderboard: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to generate leaderboard.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
