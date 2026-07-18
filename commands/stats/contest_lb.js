// https://github.com/viktorexe/terristats-discord-bot
// /contest_lb - top 100 clans ranked by number of contest wins, paginated.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { sendPaginated } = require('../../pagination');

const PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contest_lb')
    .setDescription('Top 100 clans by contest wins'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const pipeline = [
        { $match: { contest: true } },
        { $group: { _id: '$clan_name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 100 },
      ];

      const results = await db.collection('clanwins').aggregate(pipeline).toArray();
      const rankings = results.filter((r) => r._id).map((r) => [r._id, r.count]);

      if (!rankings.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎯 Contest Leaderboard')
              .setDescription('No contest wins found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const maxPages = Math.ceil(rankings.length / PER_PAGE);
      const buildEmbed = (page) => {
        const start = page * PER_PAGE;
        const pageData = rankings.slice(start, start + PER_PAGE);
        const clanList = pageData
          .map(([clan, wins], i) => `#${start + i + 1} [${clan}] - ${wins}`)
          .join('\n');
        return new EmbedBuilder()
          .setTitle('🎯 Contest Wins Leaderboard')
          .setDescription('Top 100 clans by contest wins')
          .setColor(0x2b2d31)
          .addFields({ name: 'Rankings', value: clanList || 'No data', inline: false })
          .setFooter({ text: `Page ${page + 1}/${maxPages}` });
      };

      await sendPaginated(interaction, { pageCount: maxPages, buildEmbed });
    } catch (err) {
      console.log(`Error in contest_lb: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch contest leaderboard.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
