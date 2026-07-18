// https://github.com/viktorexe/terristats-discord-bot
// /warzone - a live 6-hour "battle royale" leaderboard of the most active
// clans, with a countdown to the next 6-hour reset.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warzone')
    .setDescription('Live 6-hour battle royale leaderboard'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const cutoff = new Date(Date.now() - 6 * 3600 * 1000);
      const wins = await db
        .collection('clanwins')
        .find({ timestamp: { $gte: cutoff } })
        .toArray();

      if (!wins.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Warzone - No Activity')
              .setDescription('No wins in the last 6 hours. The battlefield is quiet...')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const clanCounter = new Map();
      for (const w of wins) {
        if (w.clan_name) clanCounter.set(w.clan_name, (clanCounter.get(w.clan_name) || 0) + 1);
      }
      const topClans = [...clanCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

      if (!topClans.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Warzone - No Activity')
              .setDescription('No valid clan data in the last 6 hours.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const [championClan, championWins] = topClans[0];

      const clanPoints = {};
      for (const [clanName] of topClans) {
        clanPoints[clanName] = wins
          .filter((w) => w.clan_name === clanName)
          .reduce((sum, w) => sum + (w.player_count || 0), 0);
      }

      const now = new Date();
      const hoursSinceStart = now.getUTCHours() % 6;
      const minutesSinceStart = now.getUTCMinutes();
      let hoursUntilReset = 5 - hoursSinceStart;
      let minutesUntilReset = 60 - minutesSinceStart;
      if (minutesUntilReset === 60) {
        hoursUntilReset += 1;
        minutesUntilReset = 0;
      }

      const embed = new EmbedBuilder()
        .setTitle('⚔️ WARZONE - Live Battle Royale')
        .setDescription(
          `6-Hour Leaderboard | Resets in **${hoursUntilReset}h ${minutesUntilReset}m**`,
        )
        .setColor(0xff4500);

      const championPoints = clanPoints[championClan] || 0;
      embed.addFields({
        name: '👑 KING OF THE HILL',
        value: `**[${championClan}]**\n${championWins} wins | ${championPoints} points`,
        inline: false,
      });

      const rankings = topClans.map(([clan, count], i) => {
        const points = clanPoints[clan] || 0;
        let medal;
        if (i === 0) medal = '👑';
        else if (i === 1) medal = '🥈';
        else if (i === 2) medal = '🥉';
        else medal = `#${i + 1}`;
        return `${medal} [${clan}] - ${count} wins | ${points}pts`;
      });
      embed.addFields({ name: '🏆 Live Rankings', value: rankings.join('\n'), inline: false });

      const totalWins = wins.length;
      const totalPoints = wins.reduce((sum, w) => sum + (w.player_count || 0), 0);
      const contestWins = wins.filter((w) => w.contest).length;

      let statsText = `Total Battles: **${totalWins}**\n`;
      statsText += `Contest Battles: **${contestWins}**\n`;
      statsText += `Total Points: **${totalPoints}**\n`;
      statsText += `Active Clans: **${topClans.length}**`;
      embed.addFields({ name: '📊 Warzone Stats', value: statsText, inline: false });

      const latestWin = [...wins].sort(
        (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
      )[0];
      const winTime = new Date(latestWin.timestamp || Date.now());
      const minsAgo = Math.floor((Date.now() - winTime.getTime()) / 60000);
      let timeStr;
      if (minsAgo < 1) timeStr = 'just now';
      else if (minsAgo < 60) timeStr = `${minsAgo}m ago`;
      else timeStr = `${Math.floor(minsAgo / 60)}h ago`;

      embed.addFields({
        name: '⚡ Latest Battle',
        value: `[${latestWin.clan_name || 'Unknown'}] won on ${latestWin.map || 'Unknown'} - ${timeStr}`,
        inline: false,
      });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in warzone: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to load warzone.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
