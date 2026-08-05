// commands/notams.js
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config         = require("../config");
const { postManualNotam, postScheduledNotam } = require("../tasks/notamScheduler");
const { isStaff, genId } = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("notam")
    .setDescription("NOTAM management.")
    .addSubcommand(s => s.setName("post").setDescription("Post a manual NOTAM. (Staff only)")
      .addStringOption(o => o.setName("title").setDescription("NOTAM title").setRequired(true))
      .addStringOption(o => o.setName("body").setDescription("NOTAM body text").setRequired(true))
      .addStringOption(o => o.setName("severity").setDescription("Severity").setRequired(true)
        .addChoices({ name: "INFO", value: "INFO" }, { name: "CAUTION", value: "CAUTION" }, { name: "WARNING", value: "WARNING" }, { name: "CRITICAL", value: "CRITICAL" }))
      .addStringOption(o => o.setName("expires").setDescription("Expiry e.g. 12h, 7d").setRequired(false)))
    .addSubcommand(s => s.setName("forcepost").setDescription("Force post the next scheduled NOTAM now. (Staff only)"))
    .addSubcommand(s => s.setName("list").setDescription("List all active NOTAMs."))
    .addSubcommand(s => s.setName("expire").setDescription("Manually expire a NOTAM. (Staff only)")
      .addStringOption(o => o.setName("id").setDescription("NOTAM ID").setRequired(true))),

  async execute(interaction, client) {
    const emoji = config.EMOJI;
    const err = (msg) => componentsPayload(
      [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} ${msg}`))],
      { ephemeral: true }
    );
    const sub = interaction.options.getSubcommand();

    if (sub === "post") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const title    = interaction.options.getString("title");
      const body     = interaction.options.getString("body");
      const severity = interaction.options.getString("severity");
      const expStr   = interaction.options.getString("expires");

      let expiresAt = null;
      if (expStr) {
        const match = expStr.match(/^(\d+)(d|h|m)$/i);
        if (!match) return interaction.reply(err("Invalid expiry. Use e.g. `12h`, `7d`."));
        const mult = { d: 86400000, h: 3600000, m: 60000 };
        expiresAt = new Date(Date.now() + parseInt(match[1]) * mult[match[2].toLowerCase()]).toISOString();
      }

      const notam = {
        id: genId(), title, body, severity,
        authorTag: interaction.user.tag,
        createdAt: new Date().toISOString(),
        expiresAt, active: true, scheduled: false, messageId: null,
      };
      db.notams.push(notam);
      save(db);
      await postManualNotam(client, notam);

      return interaction.reply(componentsPayload([
        container(COLORS.GREEN).addTextDisplayComponents(text(
          `${emoji.YES.tag} NOTAM \`${notam.id}\` posted${config.NOTAM_CHANNEL ? ` to <#${config.NOTAM_CHANNEL}>` : ""}.\nExpires: ${expiresAt ? `<t:${Math.floor(new Date(expiresAt).getTime()/1000)}:R>` : "Never"}`
        ))
      ], { ephemeral: true }));
    }

    if (sub === "forcepost") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      await interaction.reply(componentsPayload(
        [container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Forcing next scheduled NOTAM...`))],
        { ephemeral: true }
      ));
      await postScheduledNotam(client);
      return;
    }

    if (sub === "list") {
      const active = db.notams.filter(n => n.active);
      if (!active.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text("No active NOTAMs."))],
          { ephemeral: true }
        ));

      const rows = active.map(n => {
        const exp  = n.expiresAt ? `<t:${Math.floor(new Date(n.expiresAt).getTime()/1000)}:R>` : "No expiry";
        const type = n.scheduled ? "Scheduled" : "Manual";
        return `**${n.title}** \`${n.id}\` · ${type} · Exp: ${exp}`;
      });

      return interaction.reply(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Active NOTAMs**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(rows.join("\n")))
      ], { ephemeral: true }));
    }

    if (sub === "expire") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const id = interaction.options.getString("id").toUpperCase();
      const n  = db.notams.find(n => n.id === id);
      if (!n)        return interaction.reply(err(`NOTAM \`${id}\` not found.`));
      if (!n.active) return interaction.reply(err("Already expired."));
      n.active = false;
      save(db);
      if (n.messageId && config.NOTAM_CHANNEL) {
        try {
          const ch  = await client.channels.fetch(config.NOTAM_CHANNEL);
          const msg = await ch.messages.fetch(n.messageId);
          await msg.delete();
        } catch {}
      }
      return interaction.reply(componentsPayload([
        container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} NOTAM \`${id}\` expired and deleted.`))
      ]));
    }
  },
};