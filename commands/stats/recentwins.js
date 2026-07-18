// https://github.com/viktorexe/terristats-discord-bot
// /recentwins - all activity across every clan in the last X hours (max 168).
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recentwins')
    .setDescription('Show recent wins in last X hours')
    .addIntegerOption((o) =>
      o.setName('hours').setDescription('Look-back window (1-168)').setRequired(true),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const hours = interaction.options.getInteger('hours');

      if (hours <= 0 || hours > 168) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Invalid Hours')
              .setDescription('Please enter hours between 1 and 168 (1 week).')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const cutoff = new Date(Date.now() - hours * 3600 * 1000);
      const query = { timestamp: { $gte: cutoff } };

      const pipeline = [
        { $match: query },
        {
          $facet: {
            stats: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  contests: { $sum: { $cond: ['$contest', 1, 0] } },
                  points: { $sum: '$player_count' },
                },
              },
            ],
            clans: [
              { $group: { _id: '$clan_name', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            maps: [
              { $group: { _id: '$map', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 3 },
            ],
            latest: [
              { $sort: { timestamp: -1 } },
              { $limit: 5 },
              { $project: { clan_name: 1, map: 1, timestamp: 1 } },
            ],
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length || !result[0].stats.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`📅 Recent Wins (${hours}h)`)
              .setDescription(`No wins found in the last ${hours} hours.`)
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const data = result[0];
      const stats = data.stats[0] || {};
      const totalWins = stats.total || 0;
      const contestWins = stats.contests || 0;
      const totalPoints = stats.points || 0;

      const topClans = data.clans.map((c) => [c._id, c.count]);
      const topMaps = data.maps.map((m) => [m._id, m.count]);
      const latestWins = data.latest || [];

      const embed = new EmbedBuilder()
        .setTitle(`Recent Wins (${hours}h)`)
        .setDescription(`Activity in the last ${hours} hours`)
        .setColor(0x2b2d31);

      let statsText = `Games: **${totalWins}** | Contest: **${contestWins}**\n`;
      statsText += `Points: **${totalPoints}** | Avg: **${(totalWins / hours).toFixed(1)}**/hr`;
      embed.addFields({ name: 'Stats', value: statsText, inline: false });

      if (topClans.length) {
        embed.addFields({
          name: 'Most Active Clans',
          value: topClans.map(([n, c], i) => `${i + 1}. [${n}] - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (topMaps.length) {
        embed.addFields({
          name: 'Popular Maps',
          value: topMaps.map(([n, c], i) => `${i + 1}. ${n} - ${c}`).join('\n'),
          inline: true,
        });
      }

      if (latestWins.length) {
        const latestText = latestWins.map((win) => {
          const winTime = new Date(win.timestamp || Date.now());
          const diffMs = Date.now() - winTime.getTime();
          const hoursAgo = Math.floor(diffMs / 3600000);
          const minsAgo = Math.floor((diffMs % 3600000) / 60000);
          const timeStr = hoursAgo > 0 ? `${hoursAgo}h` : `${minsAgo}m`;
          return `[${win.clan_name || 'Unknown'}] ${win.map || 'Unknown'} - ${timeStr}`;
        });
        embed.addFields({ name: 'Latest', value: latestText.join('\n'), inline: false });
      }

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`RECENTWINS ERROR: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch recent wins.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
