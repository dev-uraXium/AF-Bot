// commands/log.js
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");
const { db, save }   = require("../data/db");
const config         = require("../config");
const {
  e, eObj, league, getFlights, genId,
  flightPay, formatKD, errorEmbed,
} = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("log")
    .setDescription("Log a flight.")
    .addStringOption(o =>
      o.setName("callsign").setDescription("Flight callsign (e.g. KAV001)").setRequired(true))
    .addStringOption(o =>
      o.setName("aircraft").setDescription("Aircraft type").setRequired(true)
        .addChoices(
          { name: "Airbus A350",    value: "A350" },
          { name: "Airbus A320",    value: "A320" },
          { name: "Airbus A220",    value: "A220" },
          { name: "Boeing 777",     value: "B777" },
          { name: "Boeing 787",     value: "B787" },
        ))
    .addStringOption(o =>
      o.setName("departure").setDescription("ICAO departure airport").setRequired(true))
    .addStringOption(o =>
      o.setName("arrival").setDescription("ICAO arrival airport").setRequired(true))
    .addStringOption(o =>
      o.setName("route").setDescription("Waypoints (e.g. MAROG CHUMA GASKO)").setRequired(true))
    .addAttachmentOption(o =>
      o.setName("proof").setDescription("Screenshot proof of flight").setRequired(true)),

  async execute(interaction, client) {
    const callsign  = interaction.options.getString("callsign").toUpperCase();
    const aircraft  = interaction.options.getString("aircraft");
    const departure = interaction.options.getString("departure").toUpperCase();
    const arrival   = interaction.options.getString("arrival").toUpperCase();
    const route     = interaction.options.getString("route").toUpperCase();
    const proof     = interaction.options.getAttachment("proof");

    if (!proof.contentType?.startsWith("image/")) {
      return interaction.reply({ embeds: [errorEmbed("Proof must be an image file (PNG, JPG, etc).")], ephemeral: true });
    }

    // Store as pending — only moves to confirmed on staff Approve
    const subId = genId();
    const submission = {
      id: subId,
      userId:    interaction.user.id,
      userTag:   interaction.user.tag,
      callsign, aircraft, departure, arrival, route,
      proofUrl:  proof.url,
      timestamp: new Date().toISOString(),
    };
    db.pendingFlights[subId] = submission;
    save(db);

    // ── Build the embed matching the screenshot style ─────────
    const routeArrow = e("EMOJI_ROUTE") || "➡️";
    const folder     = e("EMOJI_FOLDER") || "📁";

    const embed = new EmbedBuilder()
      .setColor(0x2f6bd6)           // blue left bar
      .setTitle(`${folder} Flight Logged`)
      .setDescription(
        `<@${interaction.user.id}> has submitted a flight log.\n\n` +
        `**Flight Details**\n` +
        `\`Callsign\`: ${callsign}\n` +
        `\`Aircraft\`: ${aircraft}\n` +
        `\`Brief\`: ${departure} ${routeArrow} ${arrival}\n\n` +
        `**Route**\n` +
        `\`\`\`\n${route}\n\`\`\``
      )
      .setImage(proof.url)
      .setFooter({ text: `${interaction.user.id} • ${new Date().toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}` });

    // ── Buttons ───────────────────────────────────────────────
    const approveEmoji = eObj("EMOJI_APPROVE");
    const trashEmoji   = eObj("EMOJI_TRASH");

    const approveBtn = new ButtonBuilder()
      .setCustomId(`log_approve:${subId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success);
    if (approveEmoji) approveBtn.setEmoji(approveEmoji);

    const revokeBtn = new ButtonBuilder()
      .setCustomId(`log_revoke:${subId}`)
      .setLabel("Revoke")
      .setStyle(ButtonStyle.Danger);
    if (trashEmoji) revokeBtn.setEmoji(trashEmoji);

    const row = new ActionRowBuilder().addComponents(approveBtn, revokeBtn);

    // ── Reply to pilot ────────────────────────────────────────
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ **Flight submitted!** Your log is pending staff review.\n\`${subId}\``)
          .setTimestamp()
      ],
      ephemeral: true,
    });

    // ── Post to log channel ───────────────────────────────────
    if (config.LOG_CHANNEL) {
      const ch = await client.channels.fetch(config.LOG_CHANNEL).catch(() => null);
      if (ch) {
        await ch.send({ embeds: [embed], components: [row] });
      }
    }
  },
};