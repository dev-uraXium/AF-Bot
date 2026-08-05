// commands/ticket.js
const { SlashCommandBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require("discord.js");
const { db, save } = require("../data/db");
const { isStaff } = require("../utils/helpers");
const config        = require("../config");
const { COLORS, text, separator, container, button, row, componentsPayload } = require("../utils/components");

// ── Panel (posted once by /ticket panel) ──────────────────────
function buildPanel() {
  const emoji = config.EMOJI;
  return container(COLORS.BLUE)
    .addTextDisplayComponents(text(`${emoji.TICKET.tag} **Support Tickets**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      "Need help from the team? Open a support ticket below.\n\n" +
      "**Before opening a ticket:**\n" +
      "• Check if your question is already answered in the server\n" +
      "• Be ready to describe your issue clearly\n" +
      "• One ticket per issue — do not open duplicates\n\n" +
      `**Response time**: Staff aim to respond within **24 hours**.`
    ))
    .addSeparatorComponents(separator())
    .addActionRowComponents(row(button("ticket_open_panel", "Open a Ticket", ButtonStyle.Primary, emoji.TICKET)));
}

// ── Notice posted at top of every new ticket ──────────────────
function buildTicketNotice(user, channelId) {
  const emoji = config.EMOJI;
  return container(COLORS.ORANGE)
    .addTextDisplayComponents(text(`${emoji.INFO.tag} **Ticket Guidelines**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `Welcome <@${user.id}>!\n\n` +
      `${emoji.WARNING.tag} **Please do not ping staff members directly.**\n` +
      `Our team will respond to your ticket within **24 hours**.\n\n` +
      "**To help us resolve your issue quickly:**\n" +
      "• Describe your issue in detail\n" +
      "• Attach any relevant screenshots\n" +
      "• Include your callsign or contract ID if applicable"
    ))
    .addSeparatorComponents(separator())
    .addActionRowComponents(row(button(`ticket_close_request:${channelId}`, "Close Ticket", ButtonStyle.Danger, emoji.LOCK)));
}

function buildConfirmPanel(channelId) {
  const emoji = config.EMOJI;
  return container(COLORS.ORANGE)
    .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Close this ticket?**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      "Are you sure you want to close this ticket?\n\n" +
      "The channel will be **permanently deleted** in 5 seconds once confirmed.\n" +
      "This action **cannot** be undone."
    ))
    .addSeparatorComponents(separator())
    .addActionRowComponents(row(
      button(`ticket_close_confirm:${channelId}`, "Yes, close it",    ButtonStyle.Danger,    emoji.YES),
      button(`ticket_close_cancel:${channelId}`,  "No, keep it open", ButtonStyle.Secondary, emoji.NO),
    ));
}

// ── Open a ticket channel ─────────────────────────────────────
async function openTicket(guild, user) {
  const existing = Object.entries(db.tickets).find(([, t]) => t.ownerId === user.id && t.open);
  if (existing) return { error: `You already have an open ticket: <#${existing[0]}>` };

  const ticketNum = Object.keys(db.tickets).length + 1;
  const chanName  = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${ticketNum}`;

  const overwrites = [
    { id: guild.id, deny:  [PermissionFlagsBits.ViewChannel] },
    { id: user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
  ];
  if (config.STAFF_ROLE) {
    overwrites.push({ id: config.STAFF_ROLE, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] });
  }

  const channel = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: config.TICKET_CATEGORY || null,
    permissionOverwrites: overwrites,
  });

  db.tickets[channel.id] = { ownerId: user.id, open: true, ticketNum, createdAt: new Date().toISOString() };
  save(db);

  await channel.send(componentsPayload([buildTicketNotice(user, channel.id)]));

  return { channel };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket management.")
    .addSubcommand(s => s.setName("panel").setDescription("Post the ticket open panel in this channel. (Staff only)"))
    .addSubcommand(s => s.setName("open").setDescription("Open a new support ticket."))
    .addSubcommand(s => s.setName("add").setDescription("Add a user or role to this ticket.")
      .addUserOption(o => o.setName("user").setDescription("User to add").setRequired(false))
      .addRoleOption(o => o.setName("role").setDescription("Role to add").setRequired(false)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user from this ticket.")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("close").setDescription("Close this ticket.")
      .addStringOption(o => o.setName("reason").setDescription("Reason for closing").setRequired(false))),

  async execute(interaction, client) {
    const emoji = config.EMOJI;
    const err = (msg) => componentsPayload(
      [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} ${msg}`))],
      { ephemeral: true }
    );

    const sub = interaction.options.getSubcommand();

    if (sub === "panel") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      await interaction.channel.send(componentsPayload([buildPanel()]));
      return interaction.reply(componentsPayload(
        [container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Ticket panel posted.`))],
        { ephemeral: true }
      ));
    }

    if (sub === "open") {
      await interaction.deferReply({ ephemeral: true });
      const result = await openTicket(interaction.guild, interaction.user);
      if (result.error) return interaction.editReply(err(result.error));
      return interaction.editReply(componentsPayload(
        [container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Your ticket has been created: ${result.channel}`))]
      ));
    }

    if (sub === "add") {
      const ticket = db.tickets[interaction.channel.id];
      if (!ticket?.open) return interaction.reply(err("This command must be used inside an open ticket."));
      if (!isStaff(interaction.member) && ticket.ownerId !== interaction.user.id)
        return interaction.reply(err("Only the ticket owner or staff can add members."));

      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role) return interaction.reply(err("Provide a user or role to add."));

      const perms = { allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] };
      if (user) await interaction.channel.permissionOverwrites.create(user.id, perms);
      if (role) await interaction.channel.permissionOverwrites.create(role.id, perms);

      const added = [user && `<@${user.id}>`, role && `<@&${role.id}>`].filter(Boolean).join(" and ");
      return interaction.reply(componentsPayload([
        container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Added ${added} to the ticket.`))
      ]));
    }

    if (sub === "remove") {
      const ticket = db.tickets[interaction.channel.id];
      if (!ticket?.open) return interaction.reply(err("This command must be used inside an open ticket."));
      if (!isStaff(interaction.member) && ticket.ownerId !== interaction.user.id)
        return interaction.reply(err("Only the ticket owner or staff can remove members."));

      const user = interaction.options.getUser("user");
      if (user.id === ticket.ownerId) return interaction.reply(err("Cannot remove the ticket owner."));

      await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
      return interaction.reply(componentsPayload([
        container(COLORS.RED).addTextDisplayComponents(text(`Removed <@${user.id}> from the ticket.`))
      ]));
    }

    if (sub === "close") {
      const ticket = db.tickets[interaction.channel?.id];
      if (!ticket?.open) return interaction.reply(err("This command must be used inside an open ticket."));
      const reason = interaction.options.getString("reason") ?? "Closed by staff";
      return interaction.reply(componentsPayload(
        [buildConfirmPanel(interaction.channel.id)],
        { ephemeral: true }
      ));
    }
  },

  openTicket,
  buildPanel,
  buildTicketNotice,
  buildConfirmPanel,
};