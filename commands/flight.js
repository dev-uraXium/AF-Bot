// commands/flight.js — /flight add | remove | import
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const {
  getFlights, league, isStaff, FLEET_CHOICES, AIRPORT_CHOICES, money,
  addBalance, logTx, flightPay, CURRENCY,
} = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

// ── Import helpers ──────────────────────────────────────────
// Recursively pulls every TextDisplay string out of a Components v2
// message, regardless of whether discord.js gave us builder instances
// or raw API component data.
function extractText(components = []) {
  let out = [];
  for (const c of components) {
    const data = typeof c.toJSON === "function" ? c.toJSON() : c;
    if (typeof data.content === "string") out.push(data.content);
    if (Array.isArray(data.components)) out = out.concat(extractText(data.components));
  }
  return out;
}

// Parses one of this bot's own "Flight Approved" log messages back into
// a flight entry. Returns null if the message doesn't match that shape.
function parseApprovedFlightMessage(message) {
  if (!message.components?.length) return null;
  const lines = extractText(message.components).join("\n");

  if (!/\*\*Flight Approved\*\*/.test(lines)) return null;

  const callsign  = lines.match(/`Callsign`:\s*(\S+)/)?.[1];
  const aircraft  = lines.match(/`Aircraft`:\s*(\S+)/)?.[1];
  const brief     = lines.match(/`Brief`:\s*(\S+)\s*\S+\s*(\S+)/); // dep <emoji> arr
  const route     = lines.match(/\*\*Route\*\*\n```\n([\s\S]*?)\n```/)?.[1]?.trim();
  const footer    = lines.match(/-#\s*(\d{15,25})\s*•\s*Approved/);

  if (!callsign || !aircraft || !brief || !footer) return null;

  return {
    userId: footer[1],
    callsign,
    aircraft,
    departure: brief[1],
    arrival: brief[2],
    route: route || "",
    proofUrl: null,
    timestamp: message.createdAt.toISOString(),
    approvedBy: null,
    importedFrom: message.id,
  };
}

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
        .addIntegerOption(o => o.setName("index").setDescription("Flight number (from /stats)").setRequired(true).setMinValue(1)))
    .addSubcommand(sub =>
      sub.setName("import").setDescription("Scan a channel's flight-log history and import approved flights. (Staff only)")
        .addChannelOption(o => o.setName("channel").setDescription("Flight log channel to scan").setRequired(true))
        .addIntegerOption(o => o.setName("limit").setDescription("Max messages to scan (default 500, max 2000)").setRequired(false).setMinValue(1).setMaxValue(2000))
        .addBooleanOption(o => o.setName("pay").setDescription("Pay flight rate for each imported flight (default: yes)").setRequired(false))),

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

    if (sub === "import") {
      const channel = interaction.options.getChannel("channel");
      const limit   = interaction.options.getInteger("limit") ?? 500;
      const doPay   = interaction.options.getBoolean("pay") ?? true;

      if (!channel?.isTextBased?.())
        return interaction.reply(componentsPayload(
          [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} That's not a text channel.`))],
          { ephemeral: true }
        ));

      await interaction.deferReply();

      // ── Page through history, oldest-first isn't guaranteed by the
      // API, so we just walk backwards from "now" collecting up to `limit`.
      let scanned = 0, imported = 0, skippedDupe = 0, skippedUnparsed = 0, totalPaid = 0;
      let before = undefined;

      // Track already-imported message IDs across all pilots so re-runs
      // (or overlapping channels) don't double-count.
      const alreadyImported = new Set();
      for (const uid of Object.keys(db.flights)) {
        for (const f of db.flights[uid]) {
          if (f.importedFrom) alreadyImported.add(f.importedFrom);
        }
      }

      while (scanned < limit) {
        const batchSize = Math.min(100, limit - scanned);
        const batch = await channel.messages.fetch({ limit: batchSize, before }).catch(() => null);
        if (!batch || !batch.size) break;

        for (const message of batch.values()) {
          scanned++;
          const parsed = parseApprovedFlightMessage(message);
          if (!parsed) { skippedUnparsed++; continue; }
          if (alreadyImported.has(parsed.importedFrom)) { skippedDupe++; continue; }

          const flights = getFlights(parsed.userId);
          flights.push({
            callsign: parsed.callsign, aircraft: parsed.aircraft,
            departure: parsed.departure, arrival: parsed.arrival,
            route: parsed.route, proofUrl: parsed.proofUrl,
            timestamp: parsed.timestamp, approvedBy: parsed.approvedBy,
            importedFrom: parsed.importedFrom, importedBy: interaction.user.id,
          });
          alreadyImported.add(parsed.importedFrom);
          imported++;

          if (doPay) {
            const pay = flightPay(parsed.aircraft);
            addBalance(parsed.userId, pay);
            logTx(parsed.userId, "FLIGHT_PAY", pay, `Imported flight: ${parsed.callsign} ${parsed.departure}→${parsed.arrival}`, interaction.user.id);
            totalPaid += pay;
          }
        }

        before = batch.last()?.id;
        if (batch.size < batchSize) break; // reached the start of the channel
      }

      save(db);

      const panel = container(COLORS.GREEN)
        .addTextDisplayComponents(text(`${emoji.FOLDER.tag} **Flight Import Complete**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Channel**: <#${channel.id}>\n` +
          `**Messages Scanned**: ${scanned}\n` +
          `**Flights Imported**: ${imported}\n` +
          `**Skipped (already imported)**: ${skippedDupe}\n` +
          `**Skipped (not a flight log)**: ${skippedUnparsed}\n` +
          (doPay ? `**Total Paid Out**: ${money(totalPaid)}` : `**Payout**: skipped (pay: false)`)
        ));

      return interaction.editReply(componentsPayload([panel]));
    }
  },
};