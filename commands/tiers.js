// commands/tiers.js — /tier buy | info | status | grant | revoke
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config         = require("../config");
const {
  isStaff, getBalance, addBalance, deductBalance, logTx,
  CURRENCY, TIERS, getTierByKey, getMemberTier, hasTier,
} = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Pilot tier system — buy and manage prestige tiers.")
    .addSubcommand(s => s.setName("info").setDescription("View all available tiers and their prices."))
    .addSubcommand(s => s.setName("status").setDescription("Check your current tier or another pilot's.")
      .addUserOption(o => o.setName("user").setDescription("Pilot to check (defaults to you)").setRequired(false)))
    .addSubcommand(s => s.setName("buy").setDescription("Purchase a tier with your virtual currency.")
      .addStringOption(o => o.setName("tier").setDescription("Tier to purchase").setRequired(true)
        .addChoices(
          { name: "Le Prestige  — 40,000 EUR",  value: "PRESTIGE"  },
          { name: "Le Signature — 100,000 EUR", value: "SIGNATURE" },
          { name: "L'Apogée    — 250,000 EUR",  value: "APOGEE"    },
          { name: "La Première  — 500,000 EUR", value: "PREMIERE"  },
        )))
    .addSubcommand(s => s.setName("grant").setDescription("Grant a tier to a pilot for free. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot to grant tier to").setRequired(true))
      .addStringOption(o => o.setName("tier").setDescription("Tier to grant").setRequired(true)
        .addChoices({ name: "Le Prestige", value: "PRESTIGE" }, { name: "Le Signature", value: "SIGNATURE" }, { name: "L'Apogée", value: "APOGEE" }, { name: "La Première", value: "PREMIERE" })))
    .addSubcommand(s => s.setName("revoke").setDescription("Revoke a tier from a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Pilot").setRequired(true))
      .addStringOption(o => o.setName("tier").setDescription("Tier to revoke").setRequired(true)
        .addChoices({ name: "Le Prestige", value: "PRESTIGE" }, { name: "Le Signature", value: "SIGNATURE" }, { name: "L'Apogée", value: "APOGEE" }, { name: "La Première", value: "PREMIERE" }))),

  async execute(interaction) {
    const emoji = config.EMOJI;
    const err = (msg) => componentsPayload(
      [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} ${msg}`))],
      { ephemeral: true }
    );

    const sub = interaction.options.getSubcommand();

    if (sub === "info") {
      const member      = interaction.member;
      const currentTier = getMemberTier(member);

      const panel = container(currentTier?.color ?? COLORS.PURPLE)
        .addTextDisplayComponents(text(`${emoji.STAR.tag} **Pilot Tier Programme**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "Spend your earnings to unlock exclusive contract channels with higher-reward contracts.\n" +
          "Tiers must be purchased **in order** — you cannot skip a tier."
        ))
        .addSeparatorComponents(separator());

      TIERS.forEach((t, i) => {
        const owned  = hasTier(member, t.key);
        const canBuy = !t.requires || hasTier(member, t.requires);
        const locked = !canBuy && !owned;
        const status = owned ? `${emoji.YES.tag} Owned` : locked ? `${emoji.LOCK.tag} Requires ${getTierByKey(t.requires)?.name}` : "🛒 Available to buy";
        panel.addTextDisplayComponents(text(
          `${t.emoji} **${t.name}** — ${t.price.toLocaleString()} ${CURRENCY}\n${t.description}\n${status}`
        ));
        if (i < TIERS.length - 1) panel.addSeparatorComponents(separator());
      });

      panel.addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Your Current Tier**: ${currentTier ? `${currentTier.emoji} ${currentTier.name}` : "No tier — use `/tier buy` to get started"}\n` +
          `**Your Balance**: ${getBalance(interaction.user.id).toLocaleString()} ${CURRENCY}`
        ));

      return interaction.reply(componentsPayload([panel]));
    }

    if (sub === "status") {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply(err("Could not find that member."));

      const currentTier = getMemberTier(member);
      const ownedTiers  = TIERS.filter(t => hasTier(member, t.key));
      const flights     = (db.flights[target.id] || []).length;
      const bal         = getBalance(target.id);
      const tierList    = ownedTiers.length ? ownedTiers.map(t => `${t.emoji} ${t.name}`).join("\n") : "No tiers owned yet.";
      const nextTier    = TIERS.find(t => !hasTier(member, t.key) && (!t.requires || hasTier(member, t.requires)));

      const panel = container(currentTier?.color ?? COLORS.PURPLE)
        .addTextDisplayComponents(text(`${emoji.STAR.tag} **Tier Status — ${target.username}**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Highest Tier**: ${currentTier ? `${currentTier.emoji} ${currentTier.name}` : "None"}\n` +
          `**Total Flights**: ${flights}\n**Balance**: ${bal.toLocaleString()} ${CURRENCY}`
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(`**Owned Tiers**\n${tierList}`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          `**Next Unlock**: ${nextTier ? `${nextTier.emoji} ${nextTier.name} — ${nextTier.price.toLocaleString()} ${CURRENCY}` : "All tiers owned! 🎉"}`
        ));

      return interaction.reply(componentsPayload([panel]));
    }

    if (sub === "buy") {
      const key    = interaction.options.getString("tier");
      const tier   = getTierByKey(key);
      const member = interaction.member;

      if (hasTier(member, key)) return interaction.reply(err(`You already own **${tier.name}**.`));

      if (tier.requires && !hasTier(member, tier.requires)) {
        const req = getTierByKey(tier.requires);
        return interaction.reply(err(
          `You must own **${req.name}** before purchasing **${tier.name}**.\n\nBuy **${req.name}** first (${req.price.toLocaleString()} ${CURRENCY}).`
        ));
      }

      const bal = getBalance(interaction.user.id);
      if (bal < tier.price) {
        return interaction.reply(err(
          `Insufficient funds.\n**Price**: ${tier.price.toLocaleString()} ${CURRENCY}\n**Your Balance**: ${bal.toLocaleString()} ${CURRENCY}\n**Shortfall**: ${(tier.price - bal).toLocaleString()} ${CURRENCY}`
        ));
      }

      const roleId = config.TIER_ROLES?.[key];
      if (!roleId) return interaction.reply(err("This tier role hasn't been configured yet. Please contact staff."));

      await interaction.deferReply();
      deductBalance(interaction.user.id, tier.price);
      logTx(interaction.user.id, "TIER_PURCHASE", tier.price, `Tier purchase: ${tier.name}`);
      save(db);

      try {
        await member.roles.add(roleId);
      } catch (e) {
        addBalance(interaction.user.id, tier.price);
        save(db);
        return interaction.editReply(componentsPayload([
          container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Failed to assign role. Your balance has been refunded.\n\`${e.message}\``))
        ]));
      }

      const newBal   = getBalance(interaction.user.id);
      const chanId   = config.TIER_CHANNELS?.[key];
      const chanText = chanId ? `<#${chanId}>` : "your tier contracts channel";

      await interaction.editReply(componentsPayload([
        container(tier.color)
          .addTextDisplayComponents(text(`${tier.emoji} **${tier.name} Unlocked!**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `Congratulations **${interaction.user.username}** — you've purchased **${tier.name}**!\n\nYou now have access to exclusive ${tier.name} contracts in ${chanText}.`
          ))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Cost**: -${tier.price.toLocaleString()} ${CURRENCY}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}`
          ))
      ]));

      interaction.user.send(componentsPayload([
        container(tier.color)
          .addTextDisplayComponents(text(`${tier.emoji} **Welcome to ${tier.name}!**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `You've successfully purchased **${tier.name}**!\n\nYour exclusive contracts channel: ${chanText}\n\n**Cost**: -${tier.price.toLocaleString()} ${CURRENCY}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}`
          ))
      ])).catch(() => {});
      return;
    }

    if (sub === "grant") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const target = interaction.options.getUser("pilot");
      const key    = interaction.options.getString("tier");
      const tier   = getTierByKey(key);
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply(err("Could not find that member."));
      if (hasTier(member, key)) return interaction.reply(err(`<@${target.id}> already has **${tier.name}**.`));

      const roleId = config.TIER_ROLES?.[key];
      if (!roleId) return interaction.reply(err("This tier role isn't configured."));

      try { await member.roles.add(roleId); }
      catch (e) { return interaction.reply(err(`Failed to assign role: \`${e.message}\``)); }

      await interaction.reply(componentsPayload([
        container(tier.color)
          .addTextDisplayComponents(text(`${tier.emoji} **Tier Granted**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Pilot**: <@${target.id}>\n**Tier**: ${tier.emoji} ${tier.name}\n**Granted By**: <@${interaction.user.id}>`))
      ]));

      target.send(componentsPayload([
        container(tier.color)
          .addTextDisplayComponents(text(`${tier.emoji} **${tier.name} Granted!**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`Staff has granted you the **${tier.name}** tier! You now have access to exclusive contracts.`))
      ])).catch(() => {});
      return;
    }

    if (sub === "revoke") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const target = interaction.options.getUser("pilot");
      const key    = interaction.options.getString("tier");
      const tier   = getTierByKey(key);
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply(err("Could not find that member."));
      if (!hasTier(member, key)) return interaction.reply(err(`<@${target.id}> doesn't have **${tier.name}**.`));

      const roleId = config.TIER_ROLES?.[key];
      if (!roleId) return interaction.reply(err("This tier role isn't configured."));

      try { await member.roles.remove(roleId); }
      catch (e) { return interaction.reply(err(`Failed to remove role: \`${e.message}\``)); }

      return interaction.reply(componentsPayload([
        container(COLORS.RED)
          .addTextDisplayComponents(text(`**Tier Revoked**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Pilot**: <@${target.id}>\n**Tier**: ${tier.emoji} ${tier.name}\n**Revoked By**: <@${interaction.user.id}>`))
      ]));
    }
  },
};