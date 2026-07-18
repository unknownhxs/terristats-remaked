// https://github.com/viktorexe/terristats-discord-bot
// /topclans - top clans by total wins, with buttons to toggle between all
// wins and contest-only wins plus Previous/Next pagination.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const db = require('../../database');

const PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('topclans')
    .setDescription('Show top clans by total wins')
    .addIntegerOption((o) =>
      o.setName('days').setDescription('Optional day filter').setRequired(false),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

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

      let matchStage = {};
      if (days !== null) {
        const hoursBack = (days + 1) * 24;
        matchStage = { timestamp: { $gte: new Date(Date.now() - hoursBack * 3600 * 1000) } };
      }

      const pipelineAll = [
        { $match: matchStage },
        { $group: { _id: '$clan_name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ];
      const pipelineContest = [
        { $match: { ...matchStage, contest: true } },
        { $group: { _id: '$clan_name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ];

      const [allResults, contestResults] = await Promise.all([
        db.collection('clanwins').aggregate(pipelineAll).toArray(),
        db.collection('clanwins').aggregate(pipelineContest).toArray(),
      ]);

      const allClans = allResults.filter((r) => r._id).map((r) => [r._id, r.count]);
      const contestClans = contestResults.filter((r) => r._id).map((r) => [r._id, r.count]);

      if (!allClans.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🏆 Top Clans by Wins')
              .setDescription('No valid clan data found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      let page = 0;
      let contestMode = false;

      const currentData = () => (contestMode ? contestClans : allClans);
      const maxPages = () => Math.max(1, Math.ceil(currentData().length / PER_PAGE));

      const buildEmbed = () => {
        const data = currentData();
        const start = page * PER_PAGE;
        const pageData = data.slice(start, start + PER_PAGE);
        const title = contestMode ? 'Top Clans - Contest' : 'Top Clans - Total';
        const description = contestMode ? 'Ranked by contest wins' : 'Ranked by total wins';
        const clanList = pageData
          .map(([clan, wins], i) => `#${start + i + 1} [${clan}] - ${wins}`)
          .join('\n');
        return new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(0x2b2d31)
          .addFields({ name: 'Rankings', value: clanList || 'No data', inline: false })
          .setFooter({ text: `Data from 18 Nov 2025 | Page ${page + 1}/${maxPages()}` });
      };

      const buildRows = () => {
        const modeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('all')
            .setLabel('All Wins')
            .setStyle(contestMode ? ButtonStyle.Secondary : ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('contest')
            .setLabel('Contest Only')
            .setStyle(contestMode ? ButtonStyle.Primary : ButtonStyle.Secondary),
        );
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= maxPages() - 1),
        );
        return [modeRow, navRow];
      };

      await interaction.editReply({ embeds: [buildEmbed()], components: buildRows() });
      const message = await interaction.fetchReply();

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000,
      });

      collector.on('collect', async (i) => {
        if (i.customId === 'all') {
          contestMode = false;
          if (page >= maxPages()) page = Math.max(0, maxPages() - 1);
        } else if (i.customId === 'contest') {
          contestMode = true;
          if (page >= maxPages()) page = Math.max(0, maxPages() - 1);
        } else if (i.customId === 'prev' && page > 0) {
          page -= 1;
        } else if (i.customId === 'next' && page < maxPages() - 1) {
          page += 1;
        }
        await i.update({ embeds: [buildEmbed()], components: buildRows() });
      });

      collector.on('end', async () => {
        try {
          await message.edit({ components: [] });
        } catch (e) {
          // ignore
        }
      });
    } catch (err) {
      console.log(`Error in topclans command: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch clan rankings.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
