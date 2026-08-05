// commands/profile.js
const { SlashCommandBuilder } = require("discord.js");
const config = require("../config");
const { getFlights, getStrikes, getWarns, league, favRoute } = require("../utils/helpers");
const { COLORS, text, separator, container, sectionWithThumbnail, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a pilot's full profile card.")
    .addUserOption(o => o.setName("user").setDescription("Pilot to view (defaults to you)").setRequired(false)),

  async execute(interaction) {
    const emoji   = config.EMOJI;
    const target  = interaction.options.getUser("user") ?? interaction.user;
    const member  = await interaction.guild.members.fetch(target.id).catch(() => null);
    const flights = getFlights(target.id);
    const strikes = getStrikes(target.id);
    const warns   = getWarns(target.id).length;
    const total   = flights.length;
    const rank    = league(total);

    const acMap = {};
    flights.forEach(f => { acMap[f.aircraft] = (acMap[f.aircraft] || 0) + 1; });
    const topAc = Object.entries(acMap).sort((a, b) => b[1] - a[1])[0];

    const airports = new Set(flights.flatMap(f => [f.departure, f.arrival]));

    const roles = member
      ? member.roles.cache
          .filter(r => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => `<@&${r.id}>`)
          .slice(0, 5)
          .join(" ") || "None"
      : "N/A";

    const panel = container(rank.color)
      .addSectionComponents(
        sectionWithThumbnail(
          `${emoji.PLANE.tag} **Pilot Profile — ${target.username}**`,
          target.displayAvatarURL({ size: 256 })
        )
      )
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(
        `**Pilot**: <@${target.id}>\n` +
        `**Joined Server**: ${member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "N/A"}\n` +
        `**Account Created**: <t:${Math.floor(target.createdTimestamp / 1000)}:D>`
      ))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(
        `**Total Flights**: ${total}\n` +
        `**Rank**: ${rank.name}\n` +
        `**Airports Visited**: ${airports.size}\n` +
        `**Strikes**: ${strikes}/3\n` +
        `**Warnings**: ${warns}\n` +
        `**Top Aircraft**: ${topAc ? `${topAc[0]} (×${topAc[1]})` : "N/A"}\n` +
        `**Favourite Route**: ${favRoute(target.id)}`
      ))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`**Top Roles**\n${roles}`));

    await interaction.reply(componentsPayload([panel]));
  },
};