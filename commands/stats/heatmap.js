// https://github.com/viktorexe/terristats-discord-bot
// /heatmap - text-based activity heatmap showing a clan's wins per UTC hour.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('heatmap')
    .setDescription('Show clan activity patterns by hour')
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
          $group: {
            _id: null,
            times: { $push: '$time' },
            total_points: { $sum: '$player_count' },
          },
        },
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] Activity Heatmap`)
              .setDescription('No wins found for this clan.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const data = result[0];
      const times = data.times || [];
      const totalPoints = data.total_points || 0;

      // Count wins per hour by parsing the RFC-2822-style time string.
      const hourCounter = new Array(24).fill(0);
      for (const timeStr of times) {
        if (!timeStr) continue;
        const parsed = new Date(timeStr);
        if (!Number.isNaN(parsed.getTime())) {
          hourCounter[parsed.getUTCHours()] += 1;
        }
      }

      const maxWins = Math.max(...hourCounter);
      if (maxWins === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] Activity Heatmap`)
              .setDescription('Unable to parse activity times.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const heatmapLines = [];
      for (let hour = 0; hour < 24; hour += 1) {
        const winsCount = hourCounter[hour];
        const barLength = maxWins > 0 ? Math.floor((winsCount / maxWins) * 10) : 0;
        const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
        heatmapLines.push(`${String(hour).padStart(2, '0')}:00 ${bar} ${winsCount}`);
      }

      const col1 = heatmapLines.slice(0, 8).join('\n');
      const col2 = heatmapLines.slice(8, 16).join('\n');
      const col3 = heatmapLines.slice(16, 24).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}] Activity Heatmap`)
        .setDescription('Peak activity patterns (UTC)')
        .setColor(0x2b2d31)
        .addFields(
          { name: '00:00 - 07:00', value: `\`\`\`${col1}\`\`\``, inline: true },
          { name: '08:00 - 15:00', value: `\`\`\`${col2}\`\`\``, inline: true },
          { name: '16:00 - 23:00', value: `\`\`\`${col3}\`\`\``, inline: true },
        );

      // Top 3 busiest hours (only hours that actually had wins, matching the
      // original Counter.most_common behaviour).
      const topHours = hourCounter
        .map((count, hour) => [hour, count])
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      let peakText = topHours
        .map(([hour, count]) => `${String(hour).padStart(2, '0')}:00 - ${count} wins`)
        .join('\n');
      peakText += `\n\nTotal Points: **${totalPoints}**`;
      embed.addFields({ name: 'Peak Hours', value: peakText, inline: false });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in heatmap: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to generate heatmap.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
