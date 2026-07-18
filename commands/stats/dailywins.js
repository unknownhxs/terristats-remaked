// https://github.com/viktorexe/terristats-discord-bot
// /dailywins - top clans for the current UTC day.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dailywins')
    .setDescription('Top clans for today only'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const now = new Date();
      const todayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const query = { timestamp: { $gte: todayStart } };

      const pipeline = [
        { $match: query },
        {
          $facet: {
            stats: [
              { $group: { _id: null, total: { $sum: 1 }, points: { $sum: '$player_count' } } },
            ],
            clans: [
              { $group: { _id: '$clan_name', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length || !result[0].stats.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Daily Wins')
              .setDescription('No wins today yet.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const data = result[0];
      const stats = data.stats[0] || {};
      const totalWins = stats.total || 0;
      const totalPoints = stats.points || 0;
      const topClans = data.clans.map((c) => [c._id, c.count]);

      const embed = new EmbedBuilder()
        .setTitle('Daily Wins Leaderboard')
        .setDescription(`Today's top clans - ${totalWins} wins | ${totalPoints} points`)
        .setColor(0x2b2d31);

      const rankings = topClans
        .map(([clan, count], i) => `#${i + 1} [${clan}] - ${count} wins`)
        .join('\n');
      embed.addFields({ name: 'Rankings', value: rankings, inline: false });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in dailywins: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch daily wins.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
