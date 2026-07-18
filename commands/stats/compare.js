// https://github.com/viktorexe/terristats-discord-bot
// /compare - head-to-head comparison between two players, including shared
// clans, shared maps and games played together.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

// Facet returning aggregate stats plus the player's single most-used clan.
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
        clans: [
          { $group: { _id: '$clan_name', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ],
      },
    },
  ];
}

// Return the distinct set of values for `field` across a player's wins.
async function distinctSet(query, field) {
  const rows = await db
    .collection('clanwins')
    .aggregate([{ $match: query }, { $group: { _id: `$${field}` } }, { $limit: 100 }])
    .toArray();
  return new Set(rows.map((r) => r._id).filter(Boolean));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare two players head-to-head')
    .addStringOption((o) =>
      o.setName('player1').setDescription('First player').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('player2').setDescription('Second player').setRequired(true),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const player1Name = interaction.options.getString('player1').trim();
      const player2Name = interaction.options.getString('player2').trim();

      if (player1Name === player2Name) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Same Player')
              .setDescription('Please enter two different players.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const query1 = { clan_winners: player1Name };
      const query2 = { clan_winners: player2Name };

      const [result1, result2] = await Promise.all([
        db.collection('clanwins').aggregate(buildFacet(query1)).toArray(),
        db.collection('clanwins').aggregate(buildFacet(query2)).toArray(),
      ]);

      const data1 = result1[0] || { stats: [], clans: [] };
      const data2 = result2[0] || { stats: [], clans: [] };

      const stats1 = data1.stats[0] || { total: 0, contests: 0, points: 0 };
      const stats2 = data2.stats[0] || { total: 0, contests: 0, points: 0 };

      const p1Total = stats1.total || 0;
      const p2Total = stats2.total || 0;

      if (p1Total === 0 && p2Total === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`⚔️ ${player1Name} vs ${player2Name}`)
              .setDescription('No wins found for either player.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const [clans1, clans2, maps1, maps2] = await Promise.all([
        distinctSet(query1, 'clan_name'),
        distinctSet(query2, 'clan_name'),
        distinctSet(query1, 'map'),
        distinctSet(query2, 'map'),
      ]);

      const commonClans = [...clans1].filter((c) => clans2.has(c));
      const commonMaps = [...maps1].filter((m) => maps2.has(m));

      const p1TopClan = data1.clans.length
        ? [data1.clans[0]._id, data1.clans[0].count]
        : ['None', 0];
      const p2TopClan = data2.clans.length
        ? [data2.clans[0]._id, data2.clans[0].count]
        : ['None', 0];

      const coWinsResult = await db
        .collection('clanwins')
        .aggregate([
          { $match: { $and: [{ clan_winners: player1Name }, { clan_winners: player2Name }] } },
          { $count: 'total' },
        ])
        .toArray();
      const coWinsCount = coWinsResult.length ? coWinsResult[0].total : 0;

      let winnerText;
      if (p1Total > p2Total) winnerText = `${player1Name} leads!`;
      else if (p2Total > p1Total) winnerText = `${player2Name} leads!`;
      else winnerText = "It's a tie!";

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${player1Name} vs ${player2Name}`)
        .setDescription(winnerText)
        .setColor(0x2b2d31)
        .addFields(
          {
            name: `${player1Name}`,
            value: `Wins: **${p1Total}**\nContests: **${stats1.contests}**\nPoints: **${stats1.points}**\nTop Clan: [${p1TopClan[0]}]`,
            inline: true,
          },
          { name: 'Score', value: `**${p1Total}** - **${p2Total}**`, inline: true },
          {
            name: `${player2Name}`,
            value: `Wins: **${p2Total}**\nContests: **${stats2.contests}**\nPoints: **${stats2.points}**\nTop Clan: [${p2TopClan[0]}]`,
            inline: true,
          },
        );

      if (commonClans.length) {
        let commonText = commonClans.slice(0, 5).map((c) => `[${c}]`).join(', ');
        if (commonClans.length > 5) commonText += ` +${commonClans.length - 5}`;
        embed.addFields({ name: '🤝 Common Clans', value: commonText, inline: false });
      }

      if (commonMaps.length) {
        let commonMapText = commonMaps.slice(0, 5).join(', ');
        if (commonMaps.length > 5) commonMapText += ` +${commonMaps.length - 5}`;
        embed.addFields({ name: '🗺️ Common Maps', value: commonMapText, inline: false });
      }

      if (coWinsCount > 0) {
        embed.addFields({
          name: '👥 Played Together',
          value: `${coWinsCount} games as teammates`,
          inline: false,
        });
      }

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in compare: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to compare players.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
