// https://github.com/viktorexe/terristats-discord-bot
// Reusable pagination helper for leaderboard-style commands. It sends the
// first page with Previous/Next buttons and swaps the embed as the user pages
// through the results, disabling the buttons once the collector times out.
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

/**
 * Send a paginated embed reply on an already-deferred interaction.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} opts
 * @param {number} opts.pageCount - total number of pages.
 * @param {(page: number) => import('discord.js').EmbedBuilder} opts.buildEmbed
 * @param {number} [opts.timeout] - collector lifetime in ms (default 5 min).
 */
async function sendPaginated(interaction, { pageCount, buildEmbed, timeout = 300000 }) {
  let page = 0;

  const makeRow = (p) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p <= 0),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= pageCount - 1),
    );

  // The interaction is expected to be deferred already; edit that reply so we
  // do not leave a lingering "thinking..." message.
  await interaction.editReply({
    embeds: [buildEmbed(0)],
    components: pageCount > 1 ? [makeRow(0)] : [],
  });

  if (pageCount <= 1) return;

  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeout,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'prev' && page > 0) page -= 1;
    else if (i.customId === 'next' && page < pageCount - 1) page += 1;
    await i.update({ embeds: [buildEmbed(page)], components: [makeRow(page)] });
  });

  collector.on('end', async () => {
    try {
      await message.edit({ components: [] });
    } catch (err) {
      // Message may have been deleted; ignore.
    }
  });
}

module.exports = { sendPaginated };
