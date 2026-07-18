// https://github.com/viktorexe/terristats-discord-bot
// /playerstats - individual player win statistics with optional day filter.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playerstats')
    .setDescription('Get individual player win statistics')
    .addStringOption((o) =>
      o.setName('player').setDescription('Player name').setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName('days').setDescription('Optional day filter').setRequired(false),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const player = interaction.options.getString('player');
      const days = interaction.options.getInteger('days');

      if (days !== null && days < 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Invalid Input')
              .setDescription(
                'Days must be 0 or greater (0 = last 24 hours, 1 = last 2 days, etc.)',
              )
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const playerName = player.trim();
      const query = { clan_winners: playerName };

      let timePeriod;
      if (days !== null) {
        const hoursBack = (days + 1) * 24;
        query.timestamp = { $gte: new Date(Date.now() - hoursBack * 3600 * 1000) };
        timePeriod = days === 0 ? 'Last 24 Hours' : `Last ${days + 1} Days`;
      } else {
        timePeriod = 'All Time';
      }

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
              { $limit: 5 },
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
              .setTitle(`Player Statistics: ${playerName}`)
              .setDescription('No wins found for this player.')
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
      const recentWins = data.recent || [];

      const embed = new EmbedBuilder()
        .setTitle(`${playerName} Statistics`)
        .setDescription(timePeriod)
        .setColor(0x2b2d31);

      let statsText =
        totalWins > 0
          ? `Wins: **${totalWins}** | Contest: **${contestWins}** (${((contestWins / totalWins) * 100).toFixed(0)}%)\n`
          : 'Wins: **0** | Contest: **0**\n';
      statsText += `Points: **${totalPoints}**`;
      embed.addFields({ name: 'Stats', value: statsText, inline: false });

      if (topClans.length) {
        embed.addFields({
          name: 'Top Clans',
          value: topClans.map(([n, c], i) => `${i + 1}. [${n}] - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (topMaps.length) {
        embed.addFields({
          name: 'Top Maps',
          value: topMaps.map(([n, c], i) => `${i + 1}. ${n} - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (recentWins.length) {
        embed.addFields({
          name: 'Recent',
          value: recentWins
            .map((w) => `[${w.clan_name || 'Unknown'}] ${w.map || 'Unknown'}`)
            .join('\n'),
          inline: false,
        });
      }

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`COMMAND ERROR: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch player statistics.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
