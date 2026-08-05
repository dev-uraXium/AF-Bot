// commands/moderation.js
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const { isStaff, getWarns } = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Staff moderation tools.")
    .addSubcommand(s => s.setName("warn").setDescription("Issue a warning to a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot to warn").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)))
    .addSubcommand(s => s.setName("warnings").setDescription("View all warnings for a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot to check").setRequired(true)))
    .addSubcommand(s => s.setName("clearwarn").setDescription("Clear a specific warning. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot").setRequired(true))
      .addIntegerOption(o => o.setName("index").setDescription("Warning number").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("strike").setDescription("Add a strike to a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)))
    .addSubcommand(s => s.setName("clearstrikes").setDescription("Clear all strikes for a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot").setRequired(true))),

  async execute(interaction) {
    const emoji = config.EMOJI;
    const err = (msg) => componentsPayload(
      [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} ${msg}`))],
      { ephemeral: true }
    );

    if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));

    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser("pilot");

    if (sub === "warn") {
      const reason = interaction.options.getString("reason");
      getWarns(target.id).push({ reason, mod: interaction.user.id, timestamp: new Date().toISOString() });
      save(db);
      const total = getWarns(target.id).length;

      await interaction.reply(componentsPayload([
        container(COLORS.ORANGE)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Warning Issued**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Pilot**: <@${target.id}>\n**Moderator**: <@${interaction.user.id}>\n**Reason**: ${reason}\n**Total Warnings**: ${total}`
          ))
      ]));

      target.send(componentsPayload([
        container(COLORS.ORANGE)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **You Have Received a Warning**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Reason**: ${reason}\n\nIf you believe this was a mistake, please open a ticket.`))
      ])).catch(() => {});
      return;
    }

    if (sub === "warnings") {
      const warns = getWarns(target.id);
      if (!warns.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} <@${target.id}> has no warnings.`))],
          { ephemeral: true }
        ));

      const panel = container(COLORS.ORANGE)
        .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Warnings — ${target.username}**`))
        .addSeparatorComponents(separator());

      warns.forEach((w, i) => {
        panel.addTextDisplayComponents(text(
          `**${i + 1}.** ${w.reason}\n-# By <@${w.mod}> · <t:${Math.floor(new Date(w.timestamp).getTime()/1000)}:R>`
        ));
      });

      panel.addSeparatorComponents(separator()).addTextDisplayComponents(text(`-# ${warns.length} warning(s) total`));
      return interaction.reply(componentsPayload([panel], { ephemeral: true }));
    }

    if (sub === "clearwarn") {
      const idx   = interaction.options.getInteger("index") - 1;
      const warns = getWarns(target.id);
      if (idx < 0 || idx >= warns.length)
        return interaction.reply(err(`Invalid index. <@${target.id}> has ${warns.length} warning(s).`));

      const removed = warns.splice(idx, 1)[0];
      save(db);
      return interaction.reply(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(text(`${emoji.YES.tag} Removed warning **#${idx + 1}** from <@${target.id}>.\n-# "${removed.reason}"`))
      ]));
    }

    if (sub === "strike") {
      const reason = interaction.options.getString("reason");
      db.strikes[target.id] = (db.strikes[target.id] ?? 0) + 1;
      save(db);
      const total = db.strikes[target.id];
      const color = total >= 3 ? COLORS.RED : total === 2 ? COLORS.ORANGE : COLORS.GOLD;

      const panel = container(color)
        .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Strike Issued**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Pilot**: <@${target.id}>\n**Moderator**: <@${interaction.user.id}>\n**Reason**: ${reason}\n**Strikes**: ${total}/3`
        ));
      if (total >= 3) panel.addSeparatorComponents(separator()).addTextDisplayComponents(text(`${emoji.WARNING.tag} **3 strikes reached — review required.**`));

      await interaction.reply(componentsPayload([panel]));

      target.send(componentsPayload([
        container(color)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **You Have Received a Strike**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Reason**: ${reason}\n**Strikes**: ${total}/3${total >= 3 ? "\n\n⚠️ You have reached 3 strikes. Please contact staff immediately." : ""}`))
      ])).catch(() => {});
      return;
    }

    if (sub === "clearstrikes") {
      const prev = db.strikes[target.id] ?? 0;
      db.strikes[target.id] = 0;
      save(db);
      return interaction.reply(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(text(`${emoji.YES.tag} Cleared **${prev}** strike(s) from <@${target.id}>.`))
      ]));
    }
  },
};