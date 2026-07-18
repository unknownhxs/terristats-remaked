// https://github.com/viktorexe/terristats-discord-bot
// /milestones - achievement badges a clan has unlocked and the next goals.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { exactMatch, gamesFooter } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('milestones')
    .setDescription('Show clan milestones and achievements')
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
      ];

      const result = await db.collection('clanwins').aggregate(pipeline).toArray();
      if (!result.length) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`[${clanUpper}] Milestones`)
              .setDescription('No data found.')
              .setColor(0xff0000),
          ],
        });
        return;
      }

      const stats = result[0];
      const totalWins = stats.total || 0;
      const contestWins = stats.contests || 0;
      const totalPoints = stats.points || 0;

      const winMilestones = [10, 25, 50, 100, 250, 500, 1000];
      const contestMilestones = [5, 10, 25, 50, 100, 250];
      const pointMilestones = [100, 500, 1000, 2500, 5000, 10000];

      const highestOf = (list, value) =>
        list.filter((m) => value >= m).reduce((a, b) => Math.max(a, b), 0);
      const nextOf = (list, value) => list.find((m) => value < m) ?? null;

      const highestWin = highestOf(winMilestones, totalWins);
      const highestContest = highestOf(contestMilestones, contestWins);
      const highestPoint = highestOf(pointMilestones, totalPoints);

      const nextWin = nextOf(winMilestones, totalWins);
      const nextContest = nextOf(contestMilestones, contestWins);
      const nextPoint = nextOf(pointMilestones, totalPoints);

      const embed = new EmbedBuilder()
        .setTitle(`[${clanUpper}] Milestones`)
        .setDescription(`${totalWins} wins | ${contestWins} contests | ${totalPoints} points`)
        .setColor(0xffd700);

      const achievements = [];
      if (highestWin > 0) achievements.push(`🏆 ${highestWin} Wins`);
      if (highestContest > 0) achievements.push(`🎯 ${highestContest} Contests`);
      if (highestPoint > 0) achievements.push(`💰 ${highestPoint} Points`);
      if (achievements.length) {
        embed.addFields({ name: '🏅 Current Badges', value: achievements.join('\n'), inline: false });
      }

      const nextGoals = [];
      if (nextWin) nextGoals.push(`🏆 ${nextWin} Wins (${nextWin - totalWins} to go)`);
      if (nextContest) nextGoals.push(`🎯 ${nextContest} Contests (${nextContest - contestWins} to go)`);
      if (nextPoint) nextGoals.push(`💰 ${nextPoint} Points (${nextPoint - totalPoints} to go)`);
      embed.addFields({
        name: '🎯 Next Goals',
        value: nextGoals.length ? nextGoals.join('\n') : 'All milestones unlocked!',
        inline: false,
      });

      const totalGames = await db.collection('clanwins').countDocuments({});
      embed.setFooter({ text: gamesFooter(totalGames) });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`Error in milestones: ${err.message}`);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('Failed to fetch milestones.')
              .setColor(0xff0000),
          ],
        });
      } catch (e) {
        // ignore
      }
    }
  },
};
