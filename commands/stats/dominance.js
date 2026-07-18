// https://github.com/viktorexe/terristats-discord-bot
// /dominance - clan dominance on a specific map, shown as percentage bars.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dominance')
    .setDescription('Show clan dominance on specific map by percentage')
    .addStringOption((o) =>
      o
        .setName('map')
        .setDescription('Select a map')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  // Suggest up to 25 map names matching what the user has typed so far.
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
      const query = { map: { $regex: `^${map.trim()}$`, $options: 'i' } };

      const pipeline = [
        { $match: query },
        {
          $facet: {
            stats: [
              { $group: { _id: null, total: { $sum: 1 }, points: { $sum: '$player_count' } } },
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
      if (!result.length || !result[0].stats.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${map} Dominance`)
              .setDescription('No games found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const data = result[0];
      const stats = data.stats[0] || {};
      const total = stats.total || 0;
      const totalPoints = stats.points || 0;
      const topClans = data.clans.map((c) => [c._id, c.count]);

      const embed = new EmbedBuilder()
        .setTitle(`${map} Dominance`)
        .setDescription(`${total} games | ${totalPoints} points`)
        .setColor(0x2b2d31);

      const rankings = topClans.map(([clan, count], i) => {
        const percentage = (count / total) * 100;
        const barLength = Math.floor(percentage / 10);
        const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
        return `#${i + 1} [${clan}]\n${bar} ${percentage.toFixed(1)}% (${count})`;
      });
      embed.addFields({ name: 'Clan Dominance', value: rankings.join('\n\n'), inline: false });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in dominance: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to calculate dominance.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
