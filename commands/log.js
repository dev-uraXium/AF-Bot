// commands/log.js
const { SlashCommandBuilder, ButtonStyle } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const { genId, AIRPORT_CHOICES } = require("../utils/helpers");
const {
  COLORS, text, separator, container, mediaGallery,
  button, row, componentsPayload,
} = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Log a flight.")
    .addStringOption(o => o.setName("callsign").setDescription("Flight callsign (e.g. AFV001)").setRequired(true))
    .addStringOption(o => o.setName("aircraft").setDescription("Aircraft type").setRequired(true)
      .addChoices(
        { name: "Boeing 777-300ER", value: "B773" },
        { name: "Boeing 787-9",     value: "B789" },
        { name: "Airbus A350",      value: "A350" },
        { name: "Airbus A320",      value: "A320" },
        { name: "Airbus A220",      value: "A220" },
      ))
    .addStringOption(o => o.setName("departure").setDescription("Departure airport").setRequired(true).addChoices(...AIRPORT_CHOICES))
    .addStringOption(o => o.setName("arrival").setDescription("Arrival airport").setRequired(true).addChoices(...AIRPORT_CHOICES))
    .addStringOption(o => o.setName("route").setDescription("Waypoints (e.g. MAROG CHUMA GASKO)").setRequired(true))
    .addAttachmentOption(o => o.setName("proof").setDescription("Screenshot proof of flight").setRequired(true))
    .addStringOption(o => o.setName("contract_id").setDescription("Contract ID this flight fulfils (optional)").setRequired(false)),

  async execute(interaction, client) {
    const callsign  = interaction.options.getString("callsign").toUpperCase();
    const aircraft  = interaction.options.getString("aircraft");
    const departure = interaction.options.getString("departure");
    const arrival    = interaction.options.getString("arrival");
    const route      = interaction.options.getString("route").toUpperCase();
    const proof       = interaction.options.getAttachment("proof");
    const contractId   = interaction.options.getString("contract_id")?.toUpperCase().trim() || null;

    const emoji = config.EMOJI;

    if (departure === arrival) {
      return interaction.reply(componentsPayload(
        [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Departure and arrival cannot be the same airport.`))],
        { ephemeral: true }
      ));
    }

    if (!proof.contentType?.startsWith("image/")) {
      return interaction.reply(componentsPayload(
        [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Proof must be an image file.`))],
        { ephemeral: true }
      ));
    }

    // ── Validate contract ID if the pilot attached one ────────
    if (contractId) {
      const c = db.contracts.find(c => c.id === contractId);
      if (!c) {
        return interaction.reply(componentsPayload(
          [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Contract \`${contractId}\` not found. Double-check the ID and try again.`))],
          { ephemeral: true }
        ));
      }
      if (!c.active) {
        return interaction.reply(componentsPayload(
          [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Contract \`${contractId}\` is no longer active.`))],
          { ephemeral: true }
        ));
      }
      if (c.claimedBy !== interaction.user.id) {
        return interaction.reply(componentsPayload(
          [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} You haven't claimed contract \`${contractId}\`. Use the Claim button first.`))],
          { ephemeral: true }
        ));
      }
    }

    const subId = genId();
    db.pendingFlights[subId] = {
      id: subId, userId: interaction.user.id, userTag: interaction.user.tag,
      callsign, aircraft, departure, arrival, route,
      proofUrl: proof.url, timestamp: new Date().toISOString(),
      contractId,
    };
    save(db);

    // ── Build the Components v2 log panel ────────────────────
    const dateStr = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const logContainer = container(COLORS.BLUE)
      .addTextDisplayComponents(
        text(`${emoji.FOLDER.tag} **Flight Logged**`),
        text(`<@${interaction.user.id}> has submitted a flight log.`)
      )
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(
        text(
          `**Flight Details**\n` +
          `\`Callsign\`: ${callsign}\n` +
          `\`Aircraft\`: ${aircraft}\n` +
          `\`Brief\`: ${departure} ${emoji.ROUTE.tag} ${arrival}` +
          (contractId ? `\n\`Contract\`: ${contractId}` : "")
        )
      )
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`**Route**\n\`\`\`\n${route}\n\`\`\``))
      .addSeparatorComponents(separator())
      .addMediaGalleryComponents(mediaGallery(proof.url))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`-# ${interaction.user.id} • ${dateStr}`))
      .addActionRowComponents(
        row(
          button(`log_approve:${subId}`, "Approve", ButtonStyle.Success, emoji.YES),
          button(`log_revoke:${subId}`,  "Revoke",  ButtonStyle.Danger,  emoji.TRASH),
        )
      );

    // ── Ephemeral confirmation to pilot ──────────────────────
    const confirmContainer = container(COLORS.GREEN)
      .addTextDisplayComponents(text(`${emoji.YES.tag} Flight submitted! Pending staff review.\n\`${subId}\``));

    await interaction.reply(componentsPayload([confirmContainer], { ephemeral: true }));

    if (config.LOG_CHANNEL) {
      const ch = await client.channels.fetch(config.LOG_CHANNEL).catch(() => null);
      if (ch) {
        try {
          await ch.send(componentsPayload([logContainer]));
        } catch (err) {
          console.error("Failed to send log message:", err);
        }
      }
    }
  },
};