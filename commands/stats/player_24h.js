// https://github.com/viktorexe/terristats-discord-bot
// /player_24h - a player's activity over the last 24 hours.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('player_24h')
    .setDescription('Player statistics in last 24 hours')
    .addStringOption((o) =>
      o.setName('player').setDescription('Player name').setRequired(true),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const playerName = interaction.options.getString('player').trim();
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
      const query = { clan_winners: playerName, timestamp: { $gte: cutoff } };

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
            clans: [
              { $group: { _id: '$clan_name', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 3 },
            ],
            maps: [
              { $group: { _id: '$map', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 3 },
            ],
            recent: [
              { $sort: { timestamp: -1 } },
              { $limit: 3 },
              { $project: { clan_name: 1, map: 1 } },
            ],
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      const data = result[0];
      const stats = data ? data.stats : [];

      if (!data || !stats.length || (stats[0].total || 0) === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${playerName} - Last 24 Hours`)
              .setDescription('No wins in last 24 hours.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const statsData = stats[0];
      const totalWins = statsData.total || 0;
      const contestWins = statsData.contests || 0;
      const totalPoints = statsData.points || 0;

      const topClans = data.clans.map((c) => [c._id, c.count]);
      const topMaps = data.maps.map((m) => [m._id, m.count]);
      const recent = data.recent || [];

      const embed = new EmbedBuilder()
        .setTitle(`${playerName} - Last 24 Hours`)
        .setDescription('Activity in the past day')
        .setColor(0x2b2d31);

      let statsText = `Wins: **${totalWins}**\n`;
      statsText += `Contests: **${contestWins}**\n`;
      statsText += `Points: **${totalPoints}**\n`;
      statsText += `Avg/Hour: **${(totalWins / 24).toFixed(1)}**`;
      embed.addFields({ name: '📊 Stats', value: statsText, inline: false });

      if (topClans.length) {
        embed.addFields({
          name: '🏷️ Top Clans',
          value: topClans.map(([n, c], i) => `${i + 1}. [${n}] - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (topMaps.length) {
        embed.addFields({
          name: '🗺️ Top Maps',
          value: topMaps.map(([n, c], i) => `${i + 1}. ${n} - ${c}`).join('\n'),
          inline: true,
        });
      }

      embed.addFields({
        name: '🕐 Recent',
        value: recent
          .map((w) => `[${w.clan_name || 'Unknown'}] ${w.map || 'Unknown'}`)
          .join('\n'),
        inline: false,
      });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in player_24h: ${err.message}`);
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
