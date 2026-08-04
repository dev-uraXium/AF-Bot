// commands/profile.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getFlights, getStrikes, getWarns, league, favRoute } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a pilot's full profile card.")
    .addUserOption(o => o.setName("user").setDescription("Pilot to view (defaults to you)").setRequired(false)),

  async execute(interaction) {
    const target  = interaction.options.getUser("user") ?? interaction.user;
    const member  = await interaction.guild.members.fetch(target.id).catch(() => null);
    const flights = getFlights(target.id);
    const strikes = getStrikes(target.id);
    const warns   = getWarns(target.id).length;
    const total   = flights.length;
    const lg      = league(total);

    // Aircraft diversity
    const acMap = {};
    flights.forEach(f => { acMap[f.aircraft] = (acMap[f.aircraft] || 0) + 1; });
    const topAc = Object.entries(acMap).sort((a, b) => b[1] - a[1])[0];

    // Unique airports visited
    const airports = new Set(flights.flatMap(f => [f.departure, f.arrival]));

    const roles = member
      ? member.roles.cache
          .filter(r => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => `<@&${r.id}>`)
          .slice(0, 5)
          .join(" ") || "None"
      : "N/A";

    const embed = new EmbedBuilder()
      .setTitle(`🪪 Pilot Profile — ${target.username}`)
      .setColor(lg.color)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "👤 Pilot",          value: `<@${target.id}>`,                              inline: true },
        { name: "📅 Joined Server",   value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "N/A", inline: true },
        { name: "📅 Account Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`,             inline: true },
        { name: "✈️ Total Flights",   value: `${total}`,                                    inline: true },
        { name: "🏅 League",          value: lg.name,                                        inline: true },
        { name: "🌍 Airports Visited",value: `${airports.size}`,                             inline: true },
        { name: "🚨 Strikes",         value: `${strikes}/3`,                                 inline: true },
        { name: "⚠️ Warnings",        value: `${warns}`,                                     inline: true },
        { name: "✈️ Top Aircraft",    value: topAc ? `${topAc[0]} (×${topAc[1]})` : "N/A", inline: true },
        { name: "🗺️ Favourite Route", value: favRoute(target.id),                           inline: true },
        { name: "🎖️ Top Roles",       value: roles,                                          inline: false },
      )
      .setFooter({ text: "AFBot • Virtual Airline" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};