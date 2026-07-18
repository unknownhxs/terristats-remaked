// https://github.com/viktorexe/terristats-discord-bot
// /underdog - clans with a high contest win rate but a low total win count
// (5-50 wins and >40% contest rate).
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('underdog')
    .setDescription('Clans with high contest win rate but low total wins'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const pipeline = [
        {
          $group: {
            _id: '$clan_name',
            total: { $sum: 1 },
            contest: { $sum: { $cond: [{ $eq: ['$contest', true] }, 1, 0] } },
            points: { $sum: '$player_count' },
          },
        },
        { $match: { total: { $gte: 5, $lte: 50 } } },
        {
          $project: {
            clan: '$_id',
            total: 1,
            contest: 1,
            points: 1,
            rate: { $multiply: [{ $divide: ['$contest', '$total'] }, 100] },
          },
        },
        { $match: { rate: { $gte: 40 } } },
        { $sort: { rate: -1 } },
        { $limit: 10 },
      ];

      const results = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!results.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Underdog Clans')
              .setDescription('No underdogs found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('Underdog Clans')
        .setDescription('High contest rate, low total wins (5-50 wins, >40% contest)')
        .setColor(0x2b2d31);

      const rankings = results.map((r, i) => {
        const clan = r.clan || 'Unknown';
        const total = r.total || 0;
        const contest = r.contest || 0;
        const rate = r.rate || 0;
        const points = r.points || 0;
        return `#${i + 1} [${clan}]\nWins: ${total} | Contest: ${contest} (${rate.toFixed(1)}%) | Points: ${points}`;
      });
      embed.addFields({ name: 'Rankings', value: rankings.join('\n\n'), inline: false });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in underdog: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to find underdogs.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
