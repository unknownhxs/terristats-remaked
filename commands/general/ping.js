// https://github.com/viktorexe/terristats-discord-bot
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  async execute(interaction) {
    // client.ws.ping is the websocket heartbeat latency in milliseconds.
    const latency = Math.round(interaction.client.ws.ping);
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(0x00ff00)
      .addFields({ name: 'Latency', value: `${latency}ms`, inline: true });
    await interaction.reply({ embeds: [embed] });
  },
};
