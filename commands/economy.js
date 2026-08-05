// commands/economy.js
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const { isStaff, getBalance, addBalance, deductBalance, logTx, CURRENCY } = require("../utils/helpers");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Virtual economy management.")
    .addSubcommand(s => s.setName("balance").setDescription("Check wallet balance.")
      .addUserOption(o => o.setName("user").setDescription("Pilot to check").setRequired(false)))
    .addSubcommand(s => s.setName("addmoney").setDescription("Add money to a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Recipient").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
    .addSubcommand(s => s.setName("deductmoney").setDescription("Deduct money from a pilot. (Staff only)")
      .addUserOption(o => o.setName("pilot").setDescription("Target").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
    .addSubcommand(s => s.setName("transfer").setDescription("Transfer currency to another pilot.")
      .addUserOption(o => o.setName("pilot").setDescription("Recipient").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("note").setDescription("Optional note").setRequired(false)))
    .addSubcommand(s => s.setName("transactions").setDescription("View recent transaction history.")
      .addUserOption(o => o.setName("user").setDescription("Pilot (staff only for others)").setRequired(false)))
    .addSubcommand(s => s.setName("richlist").setDescription("View the wealthiest pilots.")),

  async execute(interaction) {
    const emoji = config.EMOJI;
    const sub   = interaction.options.getSubcommand();

    const err = (msg) => componentsPayload(
      [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} ${msg}`))],
      { ephemeral: true }
    );

    if (sub === "balance") {
      const target  = interaction.options.getUser("user") ?? interaction.user;
      const bal     = getBalance(target.id);
      const flights = (db.flights[target.id] || []).length;
      return interaction.reply(componentsPayload([
        container(COLORS.GOLD)
          .addTextDisplayComponents(text(`${emoji.POINT.tag} **Wallet — ${target.username}**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Balance**: ${bal.toLocaleString()} ${CURRENCY}\n` +
            `**Total Flights**: ${flights}\n\n` +
            `-# Earn more by logging flights and completing contracts`
          ))
      ]));
    }

    if (sub === "addmoney") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const target = interaction.options.getUser("pilot");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason") ?? "Manual credit by staff";
      const newBal = addBalance(target.id, amount);
      logTx(target.id, "CREDIT", amount, reason, interaction.user.id);
      save(db);

      await interaction.reply(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(text(`${emoji.YES.tag} **Money Added**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Pilot**: <@${target.id}>\n**By**: <@${interaction.user.id}>\n` +
            `**Added**: +${amount.toLocaleString()} ${CURRENCY}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}\n**Reason**: ${reason}`
          ))
      ]));

      target.send(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(text(`${emoji.POINT.tag} **Money Received**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`+${amount.toLocaleString()} ${CURRENCY} added to your wallet.\n**Reason**: ${reason}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}`))
      ])).catch(() => {});
      return;
    }

    if (sub === "deductmoney") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const target = interaction.options.getUser("pilot");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason") ?? "Manual deduction by staff";
      const newBal = deductBalance(target.id, amount);
      logTx(target.id, "DEBIT", amount, reason, interaction.user.id);
      save(db);

      await interaction.reply(componentsPayload([
        container(COLORS.ORANGE)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Money Deducted**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Pilot**: <@${target.id}>\n**By**: <@${interaction.user.id}>\n` +
            `**Deducted**: -${amount.toLocaleString()} ${CURRENCY}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}\n**Reason**: ${reason}`
          ))
      ]));

      target.send(componentsPayload([
        container(COLORS.ORANGE)
          .addTextDisplayComponents(text(`${emoji.WARNING.tag} **Deduction Notice**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`-${amount.toLocaleString()} ${CURRENCY} deducted.\n**Reason**: ${reason}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}`))
      ])).catch(() => {});
      return;
    }

    if (sub === "transfer") {
      const target = interaction.options.getUser("pilot");
      const amount = interaction.options.getInteger("amount");
      const note   = interaction.options.getString("note") ?? "Pilot transfer";
      if (target.id === interaction.user.id) return interaction.reply(err("You can't transfer to yourself."));
      if (target.bot) return interaction.reply(err("You can't transfer to a bot."));
      const senderBal = getBalance(interaction.user.id);
      if (senderBal < amount) return interaction.reply(err(`Insufficient funds. You have ${senderBal.toLocaleString()} ${CURRENCY}.`));

      deductBalance(interaction.user.id, amount);
      addBalance(target.id, amount);
      logTx(interaction.user.id, "TRANSFER_OUT", amount, note, target.id);
      logTx(target.id,           "TRANSFER_IN",  amount, note, interaction.user.id);
      save(db);

      await interaction.reply(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.HANDSHAKE.tag} **Transfer Complete**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**From**: <@${interaction.user.id}>\n**To**: <@${target.id}>\n` +
            `**Amount**: ${amount.toLocaleString()} ${CURRENCY}\n**Your Balance**: ${getBalance(interaction.user.id).toLocaleString()} ${CURRENCY}\n**Note**: ${note}`
          ))
      ]));

      target.send(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.HANDSHAKE.tag} **Transfer Received**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`<@${interaction.user.id}> sent you ${amount.toLocaleString()} ${CURRENCY}\n**Note**: ${note}\n**Your Balance**: ${getBalance(target.id).toLocaleString()} ${CURRENCY}`))
      ])).catch(() => {});
      return;
    }

    if (sub === "transactions") {
      const target = interaction.options.getUser("user") ?? interaction.user;
      if (target.id !== interaction.user.id && !isStaff(interaction.member))
        return interaction.reply(err("You can only view your own transactions."));

      const history = (db.txHistory[target.id] || []).slice(-10).reverse();
      if (!history.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text(`No transactions found for <@${target.id}>.`))],
          { ephemeral: true }
        ));

      const rows = history.map(tx => {
        const isCredit = ["CREDIT", "TRANSFER_IN"].includes(tx.type);
        const sign = isCredit ? "+" : "-";
        const dot  = isCredit ? "🟢" : "🔴";
        const ts   = `<t:${Math.floor(new Date(tx.timestamp).getTime()/1000)}:R>`;
        return `${dot} \`${sign}${tx.amount.toLocaleString()} ${CURRENCY}\` — ${tx.reason} · ${ts}`;
      });

      return interaction.reply(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`**Transactions — ${target.username}**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(rows.join("\n")))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Current Balance**: ${getBalance(target.id).toLocaleString()} ${CURRENCY}`))
      ], { ephemeral: true }));
    }

    if (sub === "richlist") {
      const sorted = Object.entries(db.balances).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,10);
      if (!sorted.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text("No balances yet."))],
          { ephemeral: true }
        ));
      const medals = ["🥇","🥈","🥉"];
      const rows = sorted.map(([uid, bal], i) => `${medals[i] ?? `\`#${i+1}\``} <@${uid}> — **${bal.toLocaleString()} ${CURRENCY}**`);

      return interaction.reply(componentsPayload([
        container(COLORS.GOLD)
          .addTextDisplayComponents(text(`${emoji.PODIUM.tag} **Wealthiest Pilots**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(rows.join("\n")))
      ]));
    }
  },
};