// https://github.com/viktorexe/terristats-discord-bot
// /clan_24h - clan activity summary for the last 24 hours.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan_24h')
    .setDescription('Clan statistics in last 24 hours')
    .addStringOption((o) =>
      o.setName('clan').setDescription('Clan name').setRequired(true),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const clan = interaction.options.getString('clan');
      const clanUpper = clan.toUpperCase().trim();
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
      const query = { clan_name: exactMatch(clanUpper), timestamp: { $gte: cutoff } };

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
                  points: {
                    $sum: {
                      $cond: [
                        '$contest',
                        { $multiply: ['$player_count', 2] },
                        '$player_count',
                      ],
                    },
                  },
                },
              },
            ],
            maps: [
              { $group: { _id: '$map', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 3 },
            ],
            players: [
              { $unwind: '$clan_winners' },
              { $group: { _id: '$clan_winners', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 3 },
            ],
            recent: [
              { $sort: { timestamp: -1 } },
              { $limit: 3 },
              { $project: { map: 1 } },
            ],
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length || !result[0].stats.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] Last 24 Hours`)
              .setDescription('No wins in last 24 hours.')
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
      const topMaps = data.maps.map((m) => [m._id, m.count]);
      const topPlayers = data.players.map((p) => [p._id, p.count]);
      const recent = data.recent || [];

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}] Last 24 Hours`)
        .setDescription('Activity in the past day')
        .setColor(0x2b2d31);

      let statsText = `Wins: **${totalWins}**\n`;
      statsText += `Contests: **${contestWins}**\n`;
      statsText += `Points: **${totalPoints}**\n`;
      statsText += `Avg/Hour: **${(totalWins / 24).toFixed(1)}**`;
      embed.addFields({ name: '📊 Stats', value: statsText, inline: false });

      if (topMaps.length) {
        embed.addFields({
          name: '🗺️ Top Maps',
          value: topMaps.map(([n, c], i) => `${i + 1}. ${n} - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (topPlayers.length) {
        embed.addFields({
          name: '👥 Top Players',
          value: topPlayers.map(([n, c], i) => `${i + 1}. ${n} - ${c}`).join('\n'),
          inline: true,
        });
      }

      embed.addFields({
        name: '🕐 Recent',
        value: recent.map((w) => `${w.map || 'Unknown'}`).join('\n'),
        inline: false,
      });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in clan_24h: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch 24h stats.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
