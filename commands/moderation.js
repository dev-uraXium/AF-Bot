// commands/moderation.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const { isStaff, getWarns, getStrikes, getFlights, league, errorEmbed } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Staff moderation tools.")

    // /mod warn
    .addSubcommand(sub =>
      sub.setName("warn")
        .setDescription("Issue a formal warning to a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot to warn").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason for warning").setRequired(true)))

    // /mod warnings
    .addSubcommand(sub =>
      sub.setName("warnings")
        .setDescription("View all warnings for a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot to check").setRequired(true)))

    // /mod clearwarn
    .addSubcommand(sub =>
      sub.setName("clearwarn")
        .setDescription("Clear a specific warning from a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot").setRequired(true))
        .addIntegerOption(o => o.setName("index").setDescription("Warning number to clear (use /mod warnings to see)").setRequired(true).setMinValue(1)))

    // /mod strike
    .addSubcommand(sub =>
      sub.setName("strike")
        .setDescription("Add a strike to a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot to strike").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason for strike").setRequired(true)))

    // /mod clearstrikes
    .addSubcommand(sub =>
      sub.setName("clearstrikes")
        .setDescription("Clear all strikes for a pilot. (Staff only)")
        .addUserOption(o => o.setName("pilot").setDescription("Pilot to clear strikes for").setRequired(true))),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed("You need the Staff role to use this command.")], ephemeral: true });
    }

    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser("pilot");

    // ── WARN ─────────────────────────────────────────────────
    if (sub === "warn") {
      const reason = interaction.options.getString("reason");
      getWarns(target.id).push({ reason, mod: interaction.user.id, timestamp: new Date().toISOString() });
      save(db);

      const total = getWarns(target.id).length;

      const embed = new EmbedBuilder()
        .setTitle("⚠️ Warning Issued")
        .setColor(0xff8c00)
        .addFields(
          { name: "👤 Pilot",          value: `<@${target.id}>`,           inline: true },
          { name: "🛡️ Moderator",      value: `<@${interaction.user.id}>`, inline: true },
          { name: "📝 Reason",         value: reason,                       inline: false },
          { name: "📊 Total Warnings", value: `${total}`,                   inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ You Have Received a Warning")
            .setColor(0xff8c00)
            .setDescription(`**Reason:** ${reason}\n\nIf you believe this was a mistake, please open a ticket.`)
            .setFooter({ text: "AFBot • Virtual Airline" })
            .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }

    // ── WARNINGS ─────────────────────────────────────────────
    if (sub === "warnings") {
      const warns = getWarns(target.id);
      if (warns.length === 0) {
        return interaction.reply({ embeds: [{ color: 0x57f287, description: `✅ <@${target.id}> has no warnings.` }], ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings — ${target.username}`)
        .setColor(0xff8c00)
        .setDescription(
          warns.map((w, i) =>
            `**${i + 1}.** ${w.reason}\n> By <@${w.mod}> · <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:R>`
          ).join("\n\n")
        )
        .setFooter({ text: `${warns.length} warning(s) total` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ── CLEARWARN ────────────────────────────────────────────
    if (sub === "clearwarn") {
      const idx   = interaction.options.getInteger("index") - 1;
      const warns = getWarns(target.id);
      if (idx < 0 || idx >= warns.length) {
        return interaction.reply({ embeds: [errorEmbed(`Invalid index. <@${target.id}> has **${warns.length}** warning(s).`)], ephemeral: true });
      }
      const removed = warns.splice(idx, 1)[0];
      save(db);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`✅ Removed warning **#${idx + 1}** from <@${target.id}>.\n> *"${removed.reason}"*`)
            .setTimestamp()
        ]
      });
      return;
    }

    // ── STRIKE ───────────────────────────────────────────────
    if (sub === "strike") {
      const reason = interaction.options.getString("reason");
      db.strikes[target.id] = (db.strikes[target.id] ?? 0) + 1;
      save(db);
      const total  = db.strikes[target.id];
      const color  = total >= 3 ? 0xff0000 : total === 2 ? 0xff8c00 : 0xffd700;

      const embed = new EmbedBuilder()
        .setTitle("🚨 Strike Issued")
        .setColor(color)
        .addFields(
          { name: "👤 Pilot",        value: `<@${target.id}>`,           inline: true },
          { name: "🛡️ Moderator",    value: `<@${interaction.user.id}>`, inline: true },
          { name: "📝 Reason",       value: reason,                       inline: false },
          { name: "🚨 Strikes Now",  value: `${total}/3`,                 inline: true },
          total >= 3
            ? { name: "⚠️ Status", value: "**3 strikes reached — pilot may be removed per policy.**", inline: false }
            : { name: "\u200B", value: "\u200B", inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚨 You Have Received a Strike")
            .setColor(color)
            .setDescription(`**Reason:** ${reason}\n**Strikes:** ${total}/3\n\n${total >= 3 ? "⚠️ You have reached 3 strikes. Please contact staff immediately." : ""}`)
            .setFooter({ text: "AFBot • Virtual Airline" })
            .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }

    // ── CLEARSTRIKES ─────────────────────────────────────────
    if (sub === "clearstrikes") {
      const prev = db.strikes[target.id] ?? 0;
      db.strikes[target.id] = 0;
      save(db);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`✅ Cleared **${prev}** strike(s) from <@${target.id}>.`)
            .setTimestamp()
        ]
      });
      return;
    }
  },
};