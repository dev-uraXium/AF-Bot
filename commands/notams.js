// commands/notams.js — /notam post | list | expire | info
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db, save }       = require("../data/db");
const config             = require("../config");
const { postNotam }      = require("../tasks/notamScheduler");
const {
  isStaff, errorEmbed, genId,
  buildNotamEmbed, NOTAM_COLORS, NOTAM_ICONS,
} = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notam")
    .setDescription("NOTAM (Notice to Airmen) management.")

    .addSubcommand(s => s.setName("post")
      .setDescription("Post a new NOTAM. (Staff only)")
      .addStringOption(o => o.setName("title").setDescription("NOTAM title").setRequired(true))
      .addStringOption(o => o.setName("body").setDescription("NOTAM body text").setRequired(true))
      .addStringOption(o => o.setName("severity").setDescription("Severity level").setRequired(true)
        .addChoices(
          { name: "ℹ️ INFO",      value: "INFO"     },
          { name: "⚠️ CAUTION",   value: "CAUTION"  },
          { name: "🚧 WARNING",   value: "WARNING"  },
          { name: "🚨 CRITICAL",  value: "CRITICAL" },
        ))
      .addStringOption(o => o.setName("expires").setDescription("Expiry (e.g. 12h, 7d) — leave blank for no expiry").setRequired(false)))

    .addSubcommand(s => s.setName("list")
      .setDescription("List all active NOTAMs."))

    .addSubcommand(s => s.setName("info")
      .setDescription("View a specific NOTAM.")
      .addStringOption(o => o.setName("id").setDescription("NOTAM ID").setRequired(true)))

    .addSubcommand(s => s.setName("expire")
      .setDescription("Manually expire / delete a NOTAM. (Staff only)")
      .addStringOption(o => o.setName("id").setDescription("NOTAM ID").setRequired(true))),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── POST ──────────────────────────────────────────────────
    if (sub === "post") {
      if (!isStaff(interaction.member))
        return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });

      const title    = interaction.options.getString("title");
      const body     = interaction.options.getString("body");
      const severity = interaction.options.getString("severity");
      const expStr   = interaction.options.getString("expires");

      let expiresAt = null;
      if (expStr) {
        const match = expStr.match(/^(\d+)(d|h|m)$/i);
        if (!match)
          return interaction.reply({ embeds: [errorEmbed("Invalid expiry. Use e.g. `12h`, `7d`, `30m`.")], ephemeral: true });
        const mult = { d: 86400000, h: 3600000, m: 60000 };
        expiresAt = new Date(Date.now() + parseInt(match[1]) * mult[match[2].toLowerCase()]).toISOString();
      }

      const notam = {
        id:        genId(),
        title, body, severity,
        authorTag: interaction.user.tag,
        createdAt: new Date().toISOString(),
        expiresAt, active: true,
        scheduled: false, messageId: null,
      };

      db.notams.push(notam);
      save(db);

      await interaction.reply({
        embeds: [
          new EmbedBuilder().setColor(NOTAM_COLORS[severity]).setDescription(
            `✅ NOTAM **${notam.id}** posted${config.NOTAM_CHANNEL ? " to <#" + config.NOTAM_CHANNEL + ">" : ""}.\n` +
            `Expires: ${expiresAt ? `<t:${Math.floor(new Date(expiresAt).getTime()/1000)}:R>` : "Never"}`
          )
        ],
        ephemeral: true,
      });

      // Post to NOTAM channel
      await postNotam(client, notam);
      return;
    }

    // ── LIST ──────────────────────────────────────────────────
    if (sub === "list") {
      const active = db.notams.filter(n => n.active && !n.scheduled);
      const scheduled = db.notams.filter(n => n.active && n.scheduled);

      if (!active.length && !scheduled.length)
        return interaction.reply({ content: "📭 No active NOTAMs.", ephemeral: true });

      const fmt = (n) => {
        const icon = NOTAM_ICONS[n.severity] ?? "📢";
        const exp  = n.expiresAt
          ? `Exp <t:${Math.floor(new Date(n.expiresAt).getTime()/1000)}:R>`
          : "No expiry";
        return `${icon} **${n.title}** \`${n.id}\`\n> ${exp}`;
      };

      const embed = new EmbedBuilder()
        .setTitle("📡 Active NOTAMs")
        .setColor(0x5865f2)
        .setTimestamp();

      if (active.length)    embed.addFields({ name: "Staff NOTAMs",     value: active.map(fmt).join("\n\n"),    inline: false });
      if (scheduled.length) embed.addFields({ name: "Scheduled Reminders", value: scheduled.map(fmt).join("\n\n"), inline: false });
      embed.setFooter({ text: `${active.length + scheduled.length} active NOTAM(s)` });

      return interaction.reply({ embeds: [embed] });
    }

    // ── INFO ──────────────────────────────────────────────────
    if (sub === "info") {
      const id = interaction.options.getString("id").toUpperCase();
      const n  = db.notams.find(n => n.id === id);
      if (!n) return interaction.reply({ embeds: [errorEmbed(`NOTAM \`${id}\` not found.`)], ephemeral: true });
      return interaction.reply({ embeds: [buildNotamEmbed(n)] });
    }

    // ── EXPIRE ────────────────────────────────────────────────
    if (sub === "expire") {
      if (!isStaff(interaction.member))
        return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });

      const id = interaction.options.getString("id").toUpperCase();
      const n  = db.notams.find(n => n.id === id);
      if (!n)        return interaction.reply({ embeds: [errorEmbed(`NOTAM \`${id}\` not found.`)], ephemeral: true });
      if (!n.active) return interaction.reply({ embeds: [errorEmbed("NOTAM is already expired.")], ephemeral: true });

      n.active    = false;
      n.expiresAt = new Date().toISOString();
      save(db);

      // Edit original message
      if (n.messageId && config.NOTAM_CHANNEL) {
        try {
          const ch  = await client.channels.fetch(config.NOTAM_CHANNEL);
          const msg = await ch.messages.fetch(n.messageId);
          await msg.edit({
            embeds: [buildNotamEmbed(n).setTitle(`~~${NOTAM_ICONS[n.severity]} NOTAM — ${n.title}~~ *(Expired)*`).setColor(0x36393f)],
            components: [],
          });
        } catch {}
      }

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ NOTAM **${id}** — **${n.title}** has been expired.`)],
      });
    }
  },
};