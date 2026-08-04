// commands/stats.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getFlights, getStrikes, getWarns, league, favRoute } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your statistics.")
    .addUserOption(o => o.setName("user").setDescription("Pilot to check (defaults to you)").setRequired(false)),

  async execute(interaction) {
    const target  = interaction.options.getUser("user") ?? interaction.user;
    const flights = getFlights(target.id);
    const strikes = getStrikes(target.id);
    const warns   = getWarns(target.id).length;
    const total   = flights.length;
    const lg      = league(total);

    // Recent 5 flights
    const recentList = flights.slice(-5).reverse()
      .map((f, i) => `\`${i + 1}.\` **${f.callsign}** ${f.departure}→${f.arrival} · *${f.aircraft}*`)
      .join("\n") || "No flights logged yet.";

    // All flights numbered (for /flight remove reference)
    const allFlights = flights.length > 0
      ? flights.map((f, i) => `\`#${i + 1}\` ${f.callsign} — ${f.departure}→${f.arrival}`).slice(-15).join("\n")
      : "None";

    const embed = new EmbedBuilder()
      .setTitle(`📊 Stats — ${target.username}`)
      .setColor(lg.color)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "✈️ Total Flights",   value: `${total}`,       inline: true },
        { name: "🏅 League",          value: lg.name,          inline: true },
        { name: "🚨 Strikes",         value: `${strikes}/3`,   inline: true },
        { name: "⚠️ Warnings",        value: `${warns}`,       inline: true },
        { name: "🗺️ Favourite Route", value: favRoute(target.id), inline: true },
        { name: "🕓 Recent Flights",  value: recentList,       inline: false },
      )
      .setFooter({ text: "Use /flight remove <index> to remove a flight · Staff only" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};