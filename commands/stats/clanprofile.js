// https://github.com/viktorexe/terristats-discord-bot
// /clanprofile - a detailed clan profile card with overview, performance,
// team and recent-win sections.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clanprofile')
    .setDescription('Detailed clan profile card with all statistics')
    .addStringOption((o) =>
      o.setName('clan').setDescription('Clan name').setRequired(true),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const clan = interaction.options.getString('clan');
      const clanUpper = clan.toUpperCase().trim();
      const query = { clan_name: exactMatch(clanUpper) };

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
                  total_gain: { $sum: '$gain' },
                },
              },
            ],
            maps: [
              { $group: { _id: '$map', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            players: [
              { $unwind: '$clan_winners' },
              { $group: { _id: '$clan_winners', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            recent: [
              { $sort: { timestamp: -1 } },
              { $limit: 5 },
              { $project: { map: 1, time: 1 } },
            ],
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length || !result[0].stats.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] Profile`)
              .setDescription('No data found.')
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
      const totalGain = stats.total_gain || 0;
      const avgGain = totalWins > 0 ? totalGain / totalWins : 0;

      const topMaps = data.maps.map((m) => [m._id, m.count]);
      const topMap = topMaps.length ? topMaps[0] : ['Unknown', 0];

      const playersData = data.players || [];
      const uniquePlayers = playersData.length;
      const topPlayer = playersData.length
        ? [playersData[0]._id, playersData[0].count]
        : ['Unknown', 0];

      const recentWins = data.recent || [];
      const lastWin = recentWins.length
        ? (recentWins[0].time || 'Unknown').slice(0, 16)
        : 'Unknown';

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}]`)
        .setDescription('Complete Clan Profile')
        .setColor(0x5865f2);

      let overview = `**Wins:** ${totalWins}\n`;
      overview +=
        totalWins > 0
          ? `**Contest:** ${contestWins} (${((contestWins / totalWins) * 100).toFixed(1)}%)\n`
          : '**Contest:** 0\n';
      overview += `**Non-Contest:** ${totalWins - contestWins}\n`;
      overview += `**Points:** ${totalPoints}\n`;
      overview += `**Gain:** ${totalGain.toFixed(5)}`;
      embed.addFields({ name: 'Overview', value: overview, inline: false });

      let performance = `**Favorite Map:** ${topMap[0]} (${topMap[1]})\n`;
      performance += `**Avg Gain/Win:** ${avgGain.toFixed(5)}\n`;
      performance +=
        totalWins > 0
          ? `**Contest Rate:** ${((contestWins / totalWins) * 100).toFixed(1)}%`
          : '**Contest Rate:** 0%';
      embed.addFields({ name: 'Performance', value: performance, inline: true });

      let team = `**Unique Players:** ${uniquePlayers}\n`;
      team += `**MVP:** ${topPlayer[0]} (${topPlayer[1]} wins)\n`;
      team += `**Last Win:** ${lastWin}`;
      embed.addFields({ name: 'Team', value: team, inline: true });

      const mapsText = topMaps
        .map(([name, count], i) => `${i + 1}. ${name} - ${count}`)
        .join('\n');
      embed.addFields({ name: 'Top 5 Maps', value: mapsText, inline: true });

      const pipelinePlayers = [
        { $match: query },
        { $unwind: '$clan_winners' },
        {
          $group: {
            _id: '$clan_winners',
            count: { $sum: 1 },
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
        { $sort: { count: -1 } },
        { $limit: 5 },
      ];
      const topPlayersFull = await db
        .collection('clanwins')
        .aggregate(pipelinePlayers)
        .toArray();
      const playersText = topPlayersFull
        .map((p, i) => `${i + 1}. ${p._id} - ${p.count} (${p.points}pts)`)
        .join('\n');
      embed.addFields({ name: 'Top 5 Players', value: playersText, inline: true });

      const recentText = recentWins.map((w) => `${w.map || 'Unknown'}`).join('\n');
      embed.addFields({ name: 'Recent Wins', value: recentText, inline: true });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in clanprofile: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to generate profile.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
