// commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db }    = require("../data/db");
const { league } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the flight log leaderboard.")
    .addIntegerOption(o =>
      o.setName("page").setDescription("Page number (10 pilots per page)").setRequired(false).setMinValue(1)),

  async execute(interaction) {
    const page    = (interaction.options.getInteger("page") ?? 1) - 1;
    const perPage = 10;

    const sorted = Object.entries(db.flights)
      .map(([uid, arr]) => ({ uid, count: arr.length }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);

    if (sorted.length === 0) {
      return interaction.reply({ content: "📭 No flights have been logged yet.", ephemeral: true });
    }

    const totalPages = Math.ceil(sorted.length / perPage);
    const slice      = sorted.slice(page * perPage, page * perPage + perPage);

    const medals = ["🥇", "🥈", "🥉"];

    const rows = slice.map((e, i) => {
      const rank     = page * perPage + i;
      const lg       = league(e.count);
      const medal    = medals[rank] ?? `\`#${rank + 1}\``;
      return `${medal} <@${e.uid}> — **${e.count}** flights · ${lg.name}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 Flight Leaderboard")
      .setColor(0xffd700)
      .setDescription(rows.join("\n"))
      .setFooter({ text: `Page ${page + 1}/${totalPages} · ${sorted.length} pilots total` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};