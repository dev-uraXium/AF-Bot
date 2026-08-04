// commands/flight.js  —  /flight add   /flight remove
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getFlights, league, isStaff, errorEmbed, successEmbed } = require("../utils/helpers");
const { db, save } = require("../data/db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("flight")
    .setDescription("Staff flight management.")

    // ── /flight add ─────────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Manually add a flight for a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot to credit").setRequired(true))
        .addStringOption(o => o.setName("callsign").setDescription("Flight callsign (e.g. AF001)").setRequired(true))
        .addStringOption(o => o.setName("aircraft").setDescription("Aircraft type").setRequired(true))
        .addStringOption(o => o.setName("departure").setDescription("ICAO departure").setRequired(true))
        .addStringOption(o => o.setName("arrival").setDescription("ICAO arrival").setRequired(true))
        .addStringOption(o => o.setName("route").setDescription("Filed route").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason for manual addition").setRequired(false)))

    // ── /flight remove ───────────────────────────────────────
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Remove a logged flight from a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot whose flight to remove").setRequired(true))
        .addIntegerOption(o =>
          o.setName("index")
            .setDescription("Flight number to remove — use /stats to see the list")
            .setRequired(true)
            .setMinValue(1))),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed("You need the Staff role to use this command.")], ephemeral: true });
    }

    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser("pilot");

    // ── ADD ──────────────────────────────────────────────────
    if (sub === "add") {
      const callsign  = interaction.options.getString("callsign").toUpperCase();
      const aircraft  = interaction.options.getString("aircraft");
      const departure = interaction.options.getString("departure").toUpperCase();
      const arrival   = interaction.options.getString("arrival").toUpperCase();
      const route     = interaction.options.getString("route");
      const reason    = interaction.options.getString("reason") ?? "Manually added by staff";

      const flights = getFlights(target.id);
      flights.push({
        callsign, aircraft, departure, arrival, route,
        proofUrl: null,
        timestamp: new Date().toISOString(),
        addedBy: interaction.user.id,
        reason,
      });
      save(db);

      const total = flights.length;
      const lg    = league(total);

      const embed = new EmbedBuilder()
        .setTitle("✅ Flight Added by Staff")
        .setColor(lg.color)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "👤 Pilot",      value: `<@${target.id}>`,              inline: true },
          { name: "🛡️ Added By",   value: `<@${interaction.user.id}>`,    inline: true },
          { name: "📡 Callsign",   value: callsign,                        inline: true },
          { name: "✈️ Aircraft",   value: aircraft,                        inline: true },
          { name: "🛫 Departure",  value: departure,                       inline: true },
          { name: "🛬 Arrival",    value: arrival,                         inline: true },
          { name: "🗺️ Route",      value: `\`${route}\``,                 inline: false },
          { name: "📝 Reason",     value: reason,                          inline: false },
          { name: "📊 New Total",  value: `${total} flights — ${lg.name}`, inline: false },
        )
        .setFooter({ text: `Flight #${total} • Manual Entry` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // DM the pilot
      target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ A Flight Has Been Added to Your Log")
            .setColor(lg.color)
            .addFields(
              { name: "Callsign",   value: callsign,  inline: true },
              { name: "Aircraft",   value: aircraft,  inline: true },
              { name: "Route",      value: `${departure} → ${arrival}`, inline: false },
              { name: "Total Now",  value: `${total} flights — ${lg.name}`, inline: false },
              { name: "Reason",     value: reason, inline: false },
            )
            .setFooter({ text: "AFBot • Virtual Airline" })
            .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }

    // ── REMOVE ───────────────────────────────────────────────
    if (sub === "remove") {
      const idx     = interaction.options.getInteger("index") - 1; // convert to 0-based
      const flights = getFlights(target.id);

      if (flights.length === 0) {
        return interaction.reply({ embeds: [errorEmbed(`<@${target.id}> has no logged flights.`)], ephemeral: true });
      }
      if (idx < 0 || idx >= flights.length) {
        return interaction.reply({
          embeds: [errorEmbed(`Invalid flight index. <@${target.id}> has **${flights.length}** flight(s).`)],
          ephemeral: true,
        });
      }

      const removed = flights.splice(idx, 1)[0];
      save(db);

      const total = flights.length;
      const lg    = league(total);

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Flight Removed")
        .setColor(0xff4444)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "👤 Pilot",      value: `<@${target.id}>`,           inline: true },
          { name: "🛡️ Removed By", value: `<@${interaction.user.id}>`, inline: true },
          { name: "📡 Callsign",   value: removed.callsign,            inline: true },
          { name: "✈️ Aircraft",   value: removed.aircraft,            inline: true },
          { name: "🛫 Route",      value: `${removed.departure} → ${removed.arrival}`, inline: true },
          { name: "📊 New Total",  value: `${total} flights — ${lg.name}`, inline: false },
        )
        .setFooter({ text: "Flight removed from the log" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // DM the pilot
      target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ A Flight Has Been Removed from Your Log")
            .setColor(0xff8c00)
            .addFields(
              { name: "Callsign",  value: removed.callsign, inline: true },
              { name: "Route",     value: `${removed.departure} → ${removed.arrival}`, inline: false },
              { name: "New Total", value: `${total} flights — ${lg.name}`, inline: false },
            )
            .setFooter({ text: "AFBot • Virtual Airline — Contact staff if this was a mistake" })
            .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }
  },
};