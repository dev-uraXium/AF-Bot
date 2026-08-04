// commands/ticket.js
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits,
} = require("discord.js");
const { db, save } = require("../data/db");
const { isStaff, errorEmbed } = require("../utils/helpers");
const config = require("../config");

// ── Panel embed + button (posted by /ticket panel) ───────────
function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x2f6bd6)
    .setTitle("Support Tickets")
    .setDescription(
      "Need help from the team? Open a support ticket below.\n\n" +
      "**Before opening a ticket:**\n" +
      "• Check if your question is already answered in the server\n" +
      "• Be ready to describe your issue clearly\n" +
      "• One ticket per issue — do not open duplicates\n\n" +
      "**Response time:** Staff aim to respond within **24 hours**."
    )
    .setFooter({ text: "AFBot • Virtual Airline Support" })
    .setTimestamp();
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open_panel")
      .setLabel("Open a Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫")
  );
}

// ── Notice posted at the top of every new ticket ─────────────
function buildTicketNoticeEmbed(user) {
  return new EmbedBuilder()
    .setColor(0xff8c00)
    .setTitle("📋 Ticket Guidelines")
    .setDescription(
      `Welcome <@${user.id}>!\n\n` +
      "⚠️ **Please do not ping staff members directly.**\n" +
      "Our team will respond to your ticket within **24 hours**.\n\n" +
      "**To help us resolve your issue quickly:**\n" +
      "• Describe your issue in detail\n" +
      "• Attach any relevant screenshots\n" +
      "• Include your callsign or contract ID if applicable\n\n" +
      "A staff member will be with you shortly."
    )
    .setFooter({ text: "Pinging staff may result in a warning • AFBot" });
}

function buildTicketControlRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_request:${channelId}`)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );
}

// ── Confirmation embed + buttons (step 2) ────────────────────
function buildConfirmRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_confirm:${channelId}`)
      .setLabel("Yes, close it")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_close_cancel:${channelId}`)
      .setLabel("No, keep it open")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ── Close ticket logic ────────────────────────────────────────
async function closeTicket(interaction, reason = "No reason provided") {
  const ticket = db.tickets[interaction.channel?.id];
  if (!ticket || !ticket.open)
    return interaction.reply({ embeds: [errorEmbed("This is not an active ticket channel.")], ephemeral: true });

  ticket.open     = false;
  ticket.closedAt = new Date().toISOString();
  ticket.closedBy = interaction.user.id;
  save(db);

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle("🔒 Ticket Closed")
    .addFields(
      { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Reason",    value: reason,                       inline: true },
    )
    .setFooter({ text: "This channel will be deleted in 5 seconds." })
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ── Open a ticket channel ─────────────────────────────────────
async function openTicket(guild, user, client) {
  // Check for existing open ticket
  const existing = Object.entries(db.tickets)
    .find(([, t]) => t.ownerId === user.id && t.open);
  if (existing) return { error: `You already have an open ticket: <#${existing[0]}>` };

  const ticketNum  = Object.keys(db.tickets).length + 1;
  const chanName   = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${ticketNum}`;

  const overwrites = [
    { id: guild.id,     deny:  [PermissionFlagsBits.ViewChannel] },
    { id: user.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
  ];
  if (config.STAFF_ROLE) {
    overwrites.push({ id: config.STAFF_ROLE, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] });
  }

  const channel = await guild.channels.create({
    name:   chanName,
    type:   ChannelType.GuildText,
    parent: config.TICKET_CATEGORY || null,
    permissionOverwrites: overwrites,
  });

  db.tickets[channel.id] = {
    ownerId:   user.id,
    open:      true,
    ticketNum,
    createdAt: new Date().toISOString(),
  };
  save(db);

  // Post notice + close button
  await channel.send({
    embeds:     [buildTicketNoticeEmbed(user)],
    components: [buildTicketControlRow(channel.id)],
  });

  return { channel };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket management.")

    .addSubcommand(s => s.setName("panel")
      .setDescription("Post the ticket open panel in this channel. (Staff only)"))

    .addSubcommand(s => s.setName("open")
      .setDescription("Open a new support ticket."))

    .addSubcommand(s => s.setName("add")
      .setDescription("Add a user or role to this ticket.")
      .addUserOption(o => o.setName("user").setDescription("User to add").setRequired(false))
      .addRoleOption(o => o.setName("role").setDescription("Role to add").setRequired(false)))

    .addSubcommand(s => s.setName("remove")
      .setDescription("Remove a user from this ticket.")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))

    .addSubcommand(s => s.setName("close")
      .setDescription("Close this ticket.")
      .addStringOption(o => o.setName("reason").setDescription("Reason for closing").setRequired(false))),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── PANEL ─────────────────────────────────────────────────
    if (sub === "panel") {
      if (!isStaff(interaction.member))
        return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });

      await interaction.channel.send({
        embeds:     [buildPanelEmbed()],
        components: [buildPanelRow()],
      });

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Ticket panel posted.")],
        ephemeral: true,
      });
    }

    // ── OPEN ──────────────────────────────────────────────────
    if (sub === "open") {
      await interaction.deferReply({ ephemeral: true });
      const result = await openTicket(interaction.guild, interaction.user, client);
      if (result.error)
        return interaction.editReply({ embeds: [errorEmbed(result.error)] });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x57f287)
          .setDescription(`✅ Your ticket has been created: ${result.channel}`)],
      });
    }

    // ── ADD ───────────────────────────────────────────────────
    if (sub === "add") {
      const ticket = db.tickets[interaction.channel.id];
      if (!ticket?.open)
        return interaction.reply({ embeds: [errorEmbed("This command must be used inside an open ticket.")], ephemeral: true });
      if (!isStaff(interaction.member) && ticket.ownerId !== interaction.user.id)
        return interaction.reply({ embeds: [errorEmbed("Only the ticket owner or staff can add members.")], ephemeral: true });

      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role)
        return interaction.reply({ embeds: [errorEmbed("Provide a user or role to add.")], ephemeral: true });

      const perms = { allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] };
      if (user) await interaction.channel.permissionOverwrites.create(user.id, perms);
      if (role) await interaction.channel.permissionOverwrites.create(role.id, perms);

      const added = [user && `<@${user.id}>`, role && `<@&${role.id}>`].filter(Boolean).join(" and ");
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Added ${added} to the ticket.`)] });
    }

    // ── REMOVE ────────────────────────────────────────────────
    if (sub === "remove") {
      const ticket = db.tickets[interaction.channel.id];
      if (!ticket?.open)
        return interaction.reply({ embeds: [errorEmbed("This command must be used inside an open ticket.")], ephemeral: true });
      if (!isStaff(interaction.member) && ticket.ownerId !== interaction.user.id)
        return interaction.reply({ embeds: [errorEmbed("Only the ticket owner or staff can remove members.")], ephemeral: true });

      const user = interaction.options.getUser("user");
      if (user.id === ticket.ownerId)
        return interaction.reply({ embeds: [errorEmbed("Cannot remove the ticket owner.")], ephemeral: true });

      await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff4444).setDescription(`Removed <@${user.id}> from the ticket.`)] });
    }

    // ── CLOSE (slash command) ─────────────────────────────────
    if (sub === "close") {
      const ticket = db.tickets[interaction.channel?.id];
      if (!ticket?.open)
        return interaction.reply({ embeds: [errorEmbed("This command must be used inside an open ticket.")], ephemeral: true });

      const reason = interaction.options.getString("reason") ?? "Closed by staff";

      // Show step-2 confirmation
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xff8c00)
          .setTitle("Close this ticket?")
          .setDescription(`Are you sure you want to close this ticket?\n**Reason:** ${reason}\n\nThis action cannot be undone — the channel will be deleted.`)],
        components: [buildConfirmRow(interaction.channel.id)],
        ephemeral: true,
      });
    }
  },

  // Exported so index.js button handlers can call them
  closeTicket,
  openTicket,
  buildConfirmRow,
  buildTicketControlRow,
  buildPanelEmbed,
  buildPanelRow,
  buildTicketNoticeEmbed,
};