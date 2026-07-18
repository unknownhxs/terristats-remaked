// https://github.com/viktorexe/terristats-discord-bot
// /clanwins - clan win statistics with an optional day filter. The background
// scraper that feeds this data lives in scraper.js.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clanwins')
    .setDescription('Get clan win statistics')
    .addStringOption((o) =>
      o.setName('clan').setDescription('Clan name').setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('days')
        .setDescription('0 = last 24h, 1 = last 2 days, etc.')
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const clan = interaction.options.getString('clan');
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

      const clanUpper = clan.toUpperCase().trim();
      const query = { clan_name: exactMatch(clanUpper) };

      let timePeriod;
      if (days !== null) {
        const hoursBack = (days + 1) * 24;
        const cutoff = new Date(Date.now() - hoursBack * 3600 * 1000);
        query.timestamp = { $gte: cutoff };
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
              { $limit: 5 },
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
              .setTitle(`Clan Statistics: [${clanUpper}]`)
              .setDescription('No wins found for this clan.')
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

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}] Statistics`)
        .setDescription(timePeriod)
        .setColor(0x2b2d31);

      let statsText =
        totalWins > 0
          ? `Wins: **${totalWins}** | Contest: **${contestWins}** (${((contestWins / totalWins) * 100).toFixed(0)}%)\n`
          : 'Wins: **0** | Contest: **0**\n';
      statsText += `Points: **${totalPoints}**`;
      embed.addFields({ name: 'Stats', value: statsText, inline: false });

      if (topMaps.length) {
        const mapText = topMaps
          .map(([name, count], i) => `${i + 1}. ${name} - ${count}`)
          .join('\n');
        embed.addFields({ name: 'Top Maps', value: mapText, inline: true });
      }

      if (topPlayers.length) {
        const playerText = topPlayers
          .map(([name, count], i) => `${i + 1}. ${name} - ${count}`)
          .join('\n');
        embed.addFields({ name: 'Top Players', value: playerText, inline: true });
      }

      const recentWins = data.recent || [];
      if (recentWins.length) {
        const recentText = recentWins.map((w) => `${w.map || 'Unknown'}`).join('\n');
        embed.addFields({ name: 'Recent', value: recentText, inline: false });
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
              .setDescription('Failed to fetch clan statistics.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
