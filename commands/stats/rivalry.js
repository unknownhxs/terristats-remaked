// https://github.com/viktorexe/terristats-discord-bot
// /rivalry - detects the most competitive clan matchups by looking at clans
// that repeatedly finish near each other on the same maps.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rivalry')
    .setDescription('Show top clan rivalries and competitive matchups'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const pipeline = [
        { $group: { _id: { map: '$map', clan: '$clan_name' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1000 },
      ];

      const results = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!results.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🥊 Clan Rivalries')
              .setDescription('No data found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      // Group clans (with their win counts) per map.
      const mapClans = new Map();
      for (const r of results) {
        if (r._id && r._id.map && r._id.clan) {
          if (!mapClans.has(r._id.map)) mapClans.set(r._id.map, []);
          mapClans.get(r._id.map).push([r._id.clan, r.count || 0]);
        }
      }

      // For every map, pair up the top clans and accumulate a rivalry score.
      const rivalryScores = new Map();
      const clanPairs = new Map();
      const pairKey = (a, b) => [a, b].sort().join('\u0000');

      for (const [mapName, clans] of mapClans.entries()) {
        const topClans = [...clans].sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (let i = 0; i < topClans.length; i += 1) {
          const [clan1, count1] = topClans[i];
          for (let j = i + 1; j < topClans.length; j += 1) {
            const [clan2, count2] = topClans[j];
            const sorted = [clan1, clan2].sort();
            const key = pairKey(clan1, clan2);
            rivalryScores.set(key, (rivalryScores.get(key) || 0) + Math.min(count1, count2));
            if (!clanPairs.has(key)) {
              clanPairs.set(key, { pair: sorted, maps: new Set(), clan1_wins: 0, clan2_wins: 0 });
            }
            const entry = clanPairs.get(key);
            entry.maps.add(mapName);
            entry.clan1_wins += sorted[0] === clan1 ? count1 : count2;
            entry.clan2_wins += sorted[0] === clan1 ? count2 : count1;
          }
        }
      }

      const topRivalries = [...rivalryScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (!topRivalries.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🥊 Clan Rivalries')
              .setDescription('No rivalries found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🥊 Top Clan Rivalries')
        .setDescription('Most competitive clan matchups')
        .setColor(0xff4500);

      topRivalries.forEach(([key, score], i) => {
        const data = clanPairs.get(key);
        const [clan1, clan2] = data.pair;
        const totalWins = data.clan1_wins + data.clan2_wins;
        const intensity = Math.min(100, Math.floor((score / 10) * 100));

        let rivalryText = `**Intensity:** ${intensity}/100\n`;
        rivalryText += `**Record:** [${clan1}] ${data.clan1_wins} - ${data.clan2_wins} [${clan2}]\n`;
        rivalryText += `**Battlegrounds:** ${data.maps.size} maps\n`;
        rivalryText += `**Total Clashes:** ${totalWins}`;

        embed.addFields({
          name: `#${i + 1} [${clan1}] vs [${clan2}]`,
          value: rivalryText,
          inline: false,
        });
      });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in rivalry: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to calculate rivalries.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
