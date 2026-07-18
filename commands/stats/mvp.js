// https://github.com/viktorexe/terristats-discord-bot
// /mvp - the most valuable players in a clan, optionally filtered by a week
// or a specific month (the two filters are mutually exclusive).
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mvp')
    .setDescription('Most valuable players in a clan')
    .addStringOption((o) =>
      o.setName('clan').setDescription('Clan name').setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('week')
        .setDescription('Select a week (cannot use with month)')
        .setRequired(false)
        .addChoices(
          { name: 'This Week', value: 0 },
          { name: 'Last Week', value: 1 },
          { name: '2 Weeks Ago', value: 2 },
          { name: '3 Weeks Ago', value: 3 },
          { name: '4 Weeks Ago', value: 4 },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('month')
        .setDescription('Select a month (cannot use with week)')
        .setRequired(false)
        .addChoices(
          { name: 'November 2025 (from 18th)', value: '2025-11' },
          { name: 'December 2025', value: '2025-12' },
        ),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const clan = interaction.options.getString('clan');
      const week = interaction.options.getInteger('week');
      const month = interaction.options.getString('month');

      if (week !== null && month !== null) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Invalid Input')
              .setDescription('Cannot use both week and month filters together.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const clanUpper = clan.toUpperCase().trim();
      const query = { clan_name: exactMatch(clanUpper) };

      let timePeriod = 'All Time';
      if (week !== null) {
        const now = new Date();
        // Convert JS day (Sun=0) to Python-style weekday (Mon=0).
        const weekday = (now.getUTCDay() + 6) % 7;
        const start = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        start.setUTCDate(start.getUTCDate() - (weekday + week * 7));
        query.timestamp = { $gte: start };
        timePeriod = week === 0 ? 'This Week' : `${week} Week${week > 1 ? 's' : ''} Ago to Date`;
      } else if (month !== null) {
        const [yearStr, monStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const mon = parseInt(monStr, 10);
        let startDate;
        if (year === 2025 && mon === 11) {
          startDate = new Date(Date.UTC(2025, 10, 18));
          timePeriod = 'November 2025 (from 18th)';
        } else {
          startDate = new Date(Date.UTC(year, mon - 1, 1));
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          timePeriod = `${monthNames[mon - 1]} ${year}`;
        }
        query.timestamp = { $gte: startDate };
      }

      const wins = await db.collection('clanwins').find(query).toArray();
      if (!wins.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] MVP`)
              .setDescription('No wins found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const allWinners = [];
      for (const win of wins) {
        if (Array.isArray(win.clan_winners)) allWinners.push(...win.clan_winners);
      }

      if (!allWinners.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] MVP`)
              .setDescription('No player data found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const playerCounter = new Map();
      for (const p of allWinners) playerCounter.set(p, (playerCounter.get(p) || 0) + 1);

      const totalWins = wins.length;
      const pointsOf = (w) => (w.contest ? (w.player_count || 0) * 2 : w.player_count || 0);
      const totalPoints = wins.reduce((sum, w) => sum + pointsOf(w), 0);

      const topPlayers = [...playerCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const mvpList = topPlayers.map(([player, count], i) => {
        const participation = (count / totalWins) * 100;
        const playerWins = wins.filter((w) => (w.clan_winners || []).includes(player));
        const playerContests = playerWins.filter((w) => w.contest).length;
        const playerPoints = playerWins.reduce((sum, w) => sum + pointsOf(w), 0);
        return `#${i + 1} ${player}\nWins: ${count} | Contest: ${playerContests} | Points: ${playerPoints} (${participation.toFixed(1)}%)`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}] MVP Rankings`)
        .setDescription(`${timePeriod}\n${totalWins} wins | ${totalPoints} points`)
        .setColor(0x2b2d31)
        .addFields({
          name: 'Top Players',
          value: mvpList.length ? mvpList.join('\n\n') : 'No data',
          inline: false,
        });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in mvp: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch MVP data.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
