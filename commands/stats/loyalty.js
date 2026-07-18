// https://github.com/viktorexe/terristats-discord-bot
// /loyalty - shows which clans a player wins with most often.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loyalty')
    .setDescription('Show which clans a player plays with most')
    .addStringOption((o) =>
      o.setName('player').setDescription('Player name').setRequired(true),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const playerName = interaction.options.getString('player').trim();
      const query = { clan_winners: playerName };

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
              { $limit: 10 },
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
              .setTitle(`${playerName} Loyalty`)
              .setDescription('No wins found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const statsData = stats[0];
      const totalWins = statsData.total || 0;
      const totalPoints = statsData.points || 0;
      const clanCounter = data.clans.map((c) => [c._id, c.count]);

      const embed = new EmbedBuilder()
        .setTitle(`${playerName} Clan Loyalty`)
        .setDescription(`${totalWins} wins | ${totalPoints} points`)
        .setColor(0x2b2d31);

      const loyaltyList = clanCounter
        .map(([clan, count], i) => {
          const percentage = (count / totalWins) * 100;
          return `#${i + 1} [${clan}] - ${count} wins (${percentage.toFixed(1)}%)`;
        })
        .join('\n');
      embed.addFields({ name: 'Clan Distribution', value: loyaltyList, inline: false });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in loyalty: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch loyalty data.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
