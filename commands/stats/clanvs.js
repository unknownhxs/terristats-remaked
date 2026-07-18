// https://github.com/viktorexe/terristats-discord-bot
// /clanvs - head-to-head comparison between two clans with an optional day
// filter.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

// A facet pipeline returning the aggregate stats + top maps for one clan query.
function buildFacet(query) {
  return [
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
      },
    },
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clanvs')
    .setDescription('Head-to-head comparison between two clans')
    .addStringOption((o) =>
      o.setName('clan1').setDescription('First clan').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('clan2').setDescription('Second clan').setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName('days').setDescription('Optional day filter').setRequired(false),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const clan1 = interaction.options.getString('clan1');
      const clan2 = interaction.options.getString('clan2');
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

      const clan1Name = clan1.toUpperCase().trim();
      const clan2Name = clan2.toUpperCase().trim();

      if (clan1Name === clan2Name) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Same Clan')
              .setDescription('Please enter two different clans to compare.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const query1 = { clan_name: exactMatch(clan1Name) };
      const query2 = { clan_name: exactMatch(clan2Name) };

      let timePeriod;
      if (days !== null) {
        const hoursBack = (days + 1) * 24;
        const cutoff = new Date(Date.now() - hoursBack * 3600 * 1000);
        query1.timestamp = { $gte: cutoff };
        query2.timestamp = { $gte: cutoff };
        timePeriod = days === 0 ? 'Last 24 Hours' : `Last ${days + 1} Days`;
      } else {
        timePeriod = 'All Time';
      }

      const [result1, result2] = await Promise.all([
        db.collection('clanwins').aggregate(buildFacet(query1)).toArray(),
        db.collection('clanwins').aggregate(buildFacet(query2)).toArray(),
      ]);

      const data1 = result1[0] || { stats: [], maps: [] };
      const data2 = result2[0] || { stats: [], maps: [] };

      const stats1 = data1.stats[0] || { total: 0, contests: 0, points: 0 };
      const stats2 = data2.stats[0] || { total: 0, contests: 0, points: 0 };

      const clan1Total = stats1.total;
      const clan2Total = stats2.total;

      if (clan1Total === 0 && clan2Total === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`⚔️ [${clan1Name}] vs [${clan2Name}]`)
              .setDescription('No wins found for either clan.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const clan1Maps = data1.maps.map((m) => [m._id, m.count]);
      const clan2Maps = data2.maps.map((m) => [m._id, m.count]);

      let winnerText;
      if (clan1Total > clan2Total) winnerText = `[${clan1Name}] leads!`;
      else if (clan2Total > clan1Total) winnerText = `[${clan2Name}] leads!`;
      else winnerText = "It's a tie!";

      const embed = new EmbedBuilder()
        .setTitle(`[${clan1Name}] vs [${clan2Name}]`)
        .setDescription(`${timePeriod} - ${winnerText}`)
        .setColor(0x2b2d31)
        .addFields(
          {
            name: `[${clan1Name}]`,
            value: `Wins: **${clan1Total}**\nContest: **${stats1.contests}**\nPoints: **${stats1.points}**`,
            inline: true,
          },
          {
            name: 'Score',
            value: `**${clan1Total}** - **${clan2Total}**`,
            inline: true,
          },
          {
            name: `[${clan2Name}]`,
            value: `Wins: **${clan2Total}**\nContest: **${stats2.contests}**\nPoints: **${stats2.points}**`,
            inline: true,
          },
        );

      if (clan1Maps.length || clan2Maps.length) {
        const clan1MapText = clan1Maps.length
          ? clan1Maps.map(([name, count]) => `${name} - ${count}`).join('\n')
          : 'No data';
        const clan2MapText = clan2Maps.length
          ? clan2Maps.map(([name, count]) => `${name} - ${count}`).join('\n')
          : 'No data';
        embed.addFields(
          { name: `[${clan1Name}] Maps`, value: clan1MapText, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: `[${clan2Name}] Maps`, value: clan2MapText, inline: true },
        );
      }

      const recentPipeline = [
        { $match: { $or: [query1, query2] } },
        { $sort: { timestamp: -1 } },
        { $limit: 5 },
        { $project: { clan_name: 1, map: 1 } },
      ];
      const recentWins = await db
        .collection('clanwins')
        .aggregate(recentPipeline)
        .toArray();

      if (recentWins.length) {
        const recentText = recentWins
          .map((w) => `[${w.clan_name || 'Unknown'}] ${w.map || 'Unknown'}`)
          .join('\n');
        embed.addFields({ name: 'Recent Activity', value: recentText, inline: false });
      }

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`CLANVS ERROR: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to compare clans.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
