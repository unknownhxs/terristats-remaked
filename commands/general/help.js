// https://github.com/viktorexe/terristats-discord-bot
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Territorial.io Statistics Bot')
      .setDescription('Complete command list organized by category')
      .setColor(0x0099ff)
      .addFields(
        {
          name: 'Clan Statistics',
          value:
            '`/clanwins [clan] (days)` - Clan statistics\n' +
            '`/clanprofile [clan]` - Detailed clan card\n' +
            '`/topclans (days)` - Clan leaderboards\n' +
            '`/clanvs [clan1] [clan2] (days)` - Compare clans\n' +
            '`/mvp [clan] (week/month)` - Top players in clan\n' +
            '`/heatmap [clan]` - Activity patterns\n' +
            '`/contest_streak [clan] (hours)` - Contest win streaks\n' +
            '`/clan_24h [clan]` - Last 24 hours stats',
          inline: false,
        },
        {
          name: 'Player & Search',
          value:
            '`/playerstats [player] (days)` - Player stats\n' +
            '`/loyalty [player]` - Player\'s clan distribution\n' +
            '`/player_24h [player]` - Last 24 hours stats',
          inline: false,
        },
        {
          name: 'Map & Contest Analysis',
          value:
            '`/mapstats [map] (days)` - Map statistics\n' +
            '`/dominance [map]` - Clan dominance on map\n' +
            '`/dailywins` - Today\'s top clans\n' +
            '`/warzone` - Live 6-hour battle royale\n' +
            '`/underdog` - High contest rate clans\n' +
            '`/recentwins [hours]` - Recent activity',
          inline: false,
        },
        {
          name: '🏆 Leaderboards',
          value:
            '`/wins_lb` - Top 100 by total wins\n' +
            '`/contest_lb` - Top 100 by contest wins\n' +
            '`/leaderboard` - Hall of Fame (weighted)',
          inline: false,
        },
        {
          name: '✨ More Commands',
          value:
            '`/rivalry` - Top clan rivalries\n' +
            '`/milestones [clan]` - Achievements & badges\n' +
            '`/compare [player1] [player2]` - Compare players',
          inline: false,
        },
        {
          name: 'Bot Information',
          value: '`/ping` - Check bot response time',
          inline: false,
        },
      )
      .setFooter({
        text: 'Full Guide: https://terristatsguide.vercel.app • Data recording from 18 Nov 2025',
      });

    await interaction.reply({ embeds: [embed] });
  },
};
