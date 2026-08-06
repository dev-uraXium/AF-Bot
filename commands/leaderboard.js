// commands/leaderboard.js
const { SlashCommandBuilder } = require("discord.js");
const { db } = require("../data/db");
const config  = require("../config");
const { league } = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the flight log leaderboard.")
    .addIntegerOption(o => o.setName("page").setDescription("Page number (10 pilots per page)").setRequired(false).setMinValue(1)),

  async execute(interaction) {
    const emoji = config.EMOJI;
    const page    = (interaction.options.getInteger("page") ?? 1) - 1;
    const perPage = 10;

    const sorted = Object.entries(db.flights)
      .map(([uid, arr]) => ({ uid, count: arr.length }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);

    if (!sorted.length)
      return interaction.reply(componentsPayload(
        [container(COLORS.GREY).addTextDisplayComponents(text("No flights have been logged yet."))],
        { ephemeral: true }
      ));

    const totalPages = Math.ceil(sorted.length / perPage);
    const slice       = sorted.slice(page * perPage, page * perPage + perPage);
    const medals       = ["#1", "#2", "#3"];

    const rows = slice.map((e, i) => {
      const rank = page * perPage + i;
      const r    = league(e.count);
      const medal = medals[rank] ?? `#${rank + 1}`;
      return `${medal} <@${e.uid}> — **${e.count}** flights · ${r.name}`;
    });

    const panel = container(COLORS.GOLD)
      .addTextDisplayComponents(text(`${emoji.PODIUM.tag} **Flight Leaderboard**`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(rows.join("\n")))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`-# Page ${page + 1}/${totalPages} · ${sorted.length} pilots total`));

    await interaction.reply(componentsPayload([panel]));
  },
};