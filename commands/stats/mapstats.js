// https://github.com/viktorexe/terristats-discord-bot
// /mapstats - which clans and players dominate a specific map, with optional
// day filter.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mapstats')
    .setDescription('Show which clans dominate specific maps')
    .addStringOption((o) =>
      o
        .setName('map')
        .setDescription('Select a map to view statistics')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((o) =>
      o.setName('days').setDescription('Optional day filter').setRequired(false),
    ),

  async autocomplete(interaction) {
    try {
      const current = interaction.options.getFocused().toLowerCase();
      let maps = await db.collection('clanwins').distinct('map');
      maps = maps.filter((m) => m && typeof m === 'string').sort();
      const filtered = current
        ? maps.filter((m) => m.toLowerCase().includes(current))
        : maps;
      await interaction.respond(
        filtered.slice(0, 25).map((m) => ({ name: m, value: m })),
      );
    } catch (err) {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const map = interaction.options.getString('map');
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

      const mapName = map.trim();
      const query = { map: { $regex: `^${mapName}$`, $options: 'i' } };

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
                  points: { $sum: '$player_count' },
                },
              },
            ],
            clans: [
              { $group: { _id: '$clan_name', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 },
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
              { $project: { clan_name: 1 } },
            ],
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length || !result[0].stats.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Map Statistics: ${mapName}`)
              .setDescription('No games found for this map.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const data = result[0];
      const stats = data.stats[0] || {};
      const totalGames = stats.total || 0;
      const contestGames = stats.contests || 0;
      const totalPoints = stats.points || 0;

      const topClans = data.clans.map((c) => [c._id, c.count]);
      const topPlayers = data.players.map((p) => [p._id, p.count]);
      const recentWins = data.recent || [];

      const embed = new EmbedBuilder()
        .setTitle(`${mapName} Statistics`)
        .setDescription(timePeriod)
        .setColor(0x2b2d31);

      let statsText =
        totalGames > 0
          ? `Games: **${totalGames}** | Contest: **${contestGames}** (${((contestGames / totalGames) * 100).toFixed(0)}%)\n`
          : 'Games: **0** | Contest: **0**\n';
      statsText += `Points: **${totalPoints}**`;
      embed.addFields({ name: 'Stats', value: statsText, inline: false });

      if (topClans.length) {
        embed.addFields({
          name: 'Top Clans',
          value: topClans.map(([n, c], i) => `${i + 1}. [${n}] - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (topPlayers.length) {
        embed.addFields({
          name: 'Top Players',
          value: topPlayers.map(([n, c], i) => `${i + 1}. ${n} - ${c}`).join('\n'),
          inline: true,
        });
      }
      if (recentWins.length) {
        embed.addFields({
          name: 'Recent Winners',
          value: recentWins.map((w) => `[${w.clan_name || 'Unknown'}]`).join('\n'),
          inline: false,
        });
      }

      const totalDbGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalDbGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`MAPSTATS ERROR: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch map statistics.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
