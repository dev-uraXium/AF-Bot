// commands/flight.js — /flight add | remove
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const { getFlights, league, isStaff, FLEET_CHOICES, AIRPORT_CHOICES, money } = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("flight")
    .setDescription("Staff flight management.")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("Manually add a flight. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot to credit").setRequired(true))
        .addStringOption(o => o.setName("callsign").setDescription("Flight callsign").setRequired(true))
        .addStringOption(o => o.setName("aircraft").setDescription("Aircraft").setRequired(true).addChoices(...FLEET_CHOICES))
        .addStringOption(o => o.setName("departure").setDescription("Departure airport").setRequired(true).addChoices(...AIRPORT_CHOICES))
        .addStringOption(o => o.setName("arrival").setDescription("Arrival airport").setRequired(true).addChoices(...AIRPORT_CHOICES))
        .addStringOption(o => o.setName("route").setDescription("Waypoints").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
    .addSubcommand(sub =>
      sub.setName("remove").setDescription("Remove a logged flight. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot").setRequired(true))
        .addIntegerOption(o => o.setName("index").setDescription("Flight number (from /stats)").setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const emoji = config.EMOJI;

    if (!isStaff(interaction.member))
      return interaction.reply(componentsPayload(
        [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Staff only.`))],
        { ephemeral: true }
      ));

    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser("pilot");

    if (sub === "add") {
      const callsign  = interaction.options.getString("callsign").toUpperCase();
      const aircraft  = interaction.options.getString("aircraft");
      const departure = interaction.options.getString("departure");
      const arrival   = interaction.options.getString("arrival");
      const route     = interaction.options.getString("route");
      const reason    = interaction.options.getString("reason") ?? "Manually added by staff";

      const flights = getFlights(target.id);
      flights.push({ callsign, aircraft, departure, arrival, route, proofUrl: null, timestamp: new Date().toISOString(), addedBy: interaction.user.id, reason });
      save(db);

      const total = flights.length;
      const rank  = league(total);

      const panel = container(rank.color)
        .addTextDisplayComponents(text(`${emoji.PLANE.tag} **Flight Added by Staff**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Pilot**: <@${target.id}>\n` +
          `**Added By**: <@${interaction.user.id}>\n` +
          `**Callsign**: ${callsign}\n` +
          `**Aircraft**: ${aircraft}\n` +
          `**Route**: ${departure} ${emoji.ROUTE.tag} ${arrival}\n` +
          `**Waypoints**: \`${route}\`\n` +
          `**Reason**: ${reason}\n` +
          `**New Total**: ${total} flights — ${rank.name}`
        ));

      await interaction.reply(componentsPayload([panel]));

      target.send(componentsPayload([
        container(rank.color)
          .addTextDisplayComponents(text(`${emoji.PLANE.tag} **Flight Added to Your Log**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Callsign**: ${callsign}\n**Aircraft**: ${aircraft}\n**Route**: ${departure} ${emoji.ROUTE.tag} ${arrival}\n` +
            `**New Total**: ${total} flights — ${rank.name}\n**Reason**: ${reason}`
          ))
      ])).catch(() => {});
      return;
    }

    if (sub === "remove") {
      const idx     = interaction.options.getInteger("index") - 1;
      const flights = getFlights(target.id);

      if (!flights.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} <@${target.id}> has no logged flights.`))],
          { ephemeral: true }
        ));
      if (idx < 0 || idx >= flights.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Invalid index. <@${target.id}> has **${flights.length}** flight(s).`))],
          { ephemeral: true }
        ));

      const removed = flights.splice(idx, 1)[0];
      save(db);
      const rank = league(flights.length);

      const panel = container(COLORS.RED)
        .addTextDisplayComponents(text(`${emoji.TRASH.tag} **Flight Removed**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Pilot**: <@${target.id}>\n**Removed By**: <@${interaction.user.id}>\n` +
          `**Callsign**: ${removed.callsign}\n**Aircraft**: ${removed.aircraft}\n` +
          `**Route**: ${removed.departure} ${emoji.ROUTE.tag} ${removed.arrival}\n` +
          `**New Total**: ${flights.length} flights — ${rank.name}`
        ));

      await interaction.reply(componentsPayload([panel]));

      target.send(componentsPayload([
        container(COLORS.ORANGE)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Flight Removed from Your Log**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Callsign**: ${removed.callsign}\n**Route**: ${removed.departure} ${emoji.ROUTE.tag} ${removed.arrival}\n` +
            `**New Total**: ${flights.length} flights — ${rank.name}\n\n-# Contact staff if this was a mistake`
          ))
      ])).catch(() => {});
    }
  },
};