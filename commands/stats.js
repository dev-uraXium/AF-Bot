// commands/stats.js
const { SlashCommandBuilder } = require("discord.js");
const config = require("../config");
const { getFlights, getStrikes, getWarns, league, favRoute } = require("../utils/helpers");
const { COLORS, text, separator, container, sectionWithThumbnail, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your statistics.")
    .addUserOption(o => o.setName("user").setDescription("Pilot to check (defaults to you)").setRequired(false)),

  async execute(interaction) {
    const emoji   = config.EMOJI;
    const target  = interaction.options.getUser("user") ?? interaction.user;
    const flights = getFlights(target.id);
    const strikes = getStrikes(target.id);
    const warns   = getWarns(target.id).length;
    const total   = flights.length;
    const rank    = league(total);

    const recentList = flights.slice(-5).reverse()
      .map((f, i) => `\`${i + 1}.\` **${f.callsign}** ${f.departure}→${f.arrival} · ${f.aircraft}`)
      .join("\n") || "No flights logged yet.";

    const panel = container(rank.color)
      .addSectionComponents(
        sectionWithThumbnail(
          `${emoji.NOTES.tag} **Stats — ${target.username}**`,
          target.displayAvatarURL({ size: 256 })
        )
      )
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(
        `**Total Flights**: ${total}\n` +
        `**Rank**: ${rank.name}\n` +
        `**Strikes**: ${strikes}/3\n` +
        `**Warnings**: ${warns}\n` +
        `**Favourite Route**: ${favRoute(target.id)}`
      ))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`**Recent Flights**\n${recentList}`))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`-# Use /flight remove <index> to remove a flight · Staff only`));

    await interaction.reply(componentsPayload([panel]));
  },
};