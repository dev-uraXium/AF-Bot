// commands/utility.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = [
  // ── /ping ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check bot latency."),

    async execute(interaction, client) {
      const sent    = await interaction.reply({ content: "Pinging…", fetchReply: true });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      await interaction.editReply({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setTitle("🏓 Pong!")
            .setColor(0x5865f2)
            .addFields(
              { name: "⏱️ Bot Latency", value: `\`${latency}ms\``,                              inline: true },
              { name: "🌐 API Latency", value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
            )
            .setTimestamp()
        ]
      });
    },
  },

  // ── /help ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("List all available commands."),

    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setTitle("📋 AFBot — Command Reference")
        .setColor(0x5865f2)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .addFields(
          {
            name: "✈️ Flight Logging",
            value: [
              "`/log` — Log a flight with proof screenshot",
              "`/flight add` — Manually add a flight *(staff)*",
              "`/flight remove` — Remove a logged flight *(staff)*",
              "`/leaderboard` — Top pilots ranked by total flights",
              "`/stats [user]` — View pilot statistics & recent flights",
              "`/profile [user]` — Full pilot profile card",
            ].join("\n"),
          },
          {
            name: "⭐ Reviews",
            value: [
              "`/review post` — Post a flight review (1–5 stars)",
              "`/review list` — Browse all posted reviews",
            ].join("\n"),
          },
          {
            name: "🎫 Tickets",
            value: [
              "`/ticket open` — Open a new support ticket",
              "`/ticket add` — Add a user or role to the ticket",
              "`/ticket remove` — Remove a user from the ticket",
              "`/ticket close` — Close and delete the ticket",
            ].join("\n"),
          },
          {
            name: "🛡️ Moderation *(Staff only)*",
            value: [
              "`/mod warn` — Issue a warning to a pilot",
              "`/mod warnings` — View a pilot's warnings",
              "`/mod clearwarn` — Remove a specific warning",
              "`/mod strike` — Add a strike to a pilot",
              "`/mod clearstrikes` — Clear all strikes",
            ].join("\n"),
          },
          {
            name: "⚙️ Utility",
            value: "`/ping` — Bot latency\n`/help` — This menu",
          },
        )
        .setFooter({ text: "AFBot • Virtual Airline | Use /ticket open for support" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    },
  },
];