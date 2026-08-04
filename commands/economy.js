// commands/economy.js — Virtual Economy System
// Commands: /economy balance | addmoney | deductmoney | transfer | transactions | richlist
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const {
  isStaff, errorEmbed, getBalance, addBalance, deductBalance,
  logTx, CURRENCY, CURRENCY_ICON,
} = require("../utils/helpers");

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
    const sub = interaction.options.getSubcommand();

    if (sub === "balance") {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const bal    = getBalance(target.id);
      const flights = (db.flights[target.id] || []).length;
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle(`${CURRENCY_ICON} Wallet — ${target.username}`)
          .setColor(0xffd700)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            { name: "💵 Balance",        value: `**${bal.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "✈️ Total Flights",  value: `${flights}`,                              inline: true },
            { name: "💡 Earn Money",     value: "Log flights · Complete contracts",        inline: false },
          )
          .setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()
      ]});
    }

    if (sub === "addmoney") {
      if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });
      const target = interaction.options.getUser("pilot");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason") ?? "Manual credit by staff";
      const newBal = addBalance(target.id, amount);
      logTx(target.id, "CREDIT", amount, reason, interaction.user.id);
      save(db);
      await interaction.reply({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Money Added`).setColor(0x57f287)
          .addFields(
            { name: "👤 Pilot",       value: `<@${target.id}>`,           inline: true },
            { name: "🛡️ By",          value: `<@${interaction.user.id}>`, inline: true },
            { name: "➕ Added",       value: `**+${amount.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "💵 New Balance", value: `**${newBal.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "📝 Reason",      value: reason, inline: false },
          ).setTimestamp()
      ]});
      target.send({ embeds: [new EmbedBuilder().setTitle(`${CURRENCY_ICON} You Received Money!`).setColor(0x57f287)
        .setDescription(`**+${amount.toLocaleString()} ${CURRENCY}** added to your wallet.\n**Reason:** ${reason}\n**New Balance:** ${newBal.toLocaleString()} ${CURRENCY}`)
        .setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()] }).catch(() => {});
      return;
    }

    if (sub === "deductmoney") {
      if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });
      const target = interaction.options.getUser("pilot");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason") ?? "Manual deduction by staff";
      const newBal = deductBalance(target.id, amount);
      logTx(target.id, "DEBIT", amount, reason, interaction.user.id);
      save(db);
      await interaction.reply({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Money Deducted`).setColor(0xff8c00)
          .addFields(
            { name: "👤 Pilot",       value: `<@${target.id}>`,           inline: true },
            { name: "🛡️ By",          value: `<@${interaction.user.id}>`, inline: true },
            { name: "➖ Deducted",    value: `**-${amount.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "💵 New Balance", value: `**${newBal.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "📝 Reason",      value: reason, inline: false },
          ).setTimestamp()
      ]});
      target.send({ embeds: [new EmbedBuilder().setTitle(`${CURRENCY_ICON} Deduction Notice`).setColor(0xff8c00)
        .setDescription(`**-${amount.toLocaleString()} ${CURRENCY}** deducted.\n**Reason:** ${reason}\n**New Balance:** ${newBal.toLocaleString()} ${CURRENCY}`)
        .setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()] }).catch(() => {});
      return;
    }

    if (sub === "transfer") {
      const target = interaction.options.getUser("pilot");
      const amount = interaction.options.getInteger("amount");
      const note   = interaction.options.getString("note") ?? "Pilot transfer";
      if (target.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed("Can't transfer to yourself.")], ephemeral: true });
      if (target.bot) return interaction.reply({ embeds: [errorEmbed("Can't transfer to a bot.")], ephemeral: true });
      const senderBal = getBalance(interaction.user.id);
      if (senderBal < amount) return interaction.reply({ embeds: [errorEmbed(`Insufficient funds. You have **${senderBal.toLocaleString()} ${CURRENCY}**.`)], ephemeral: true });
      deductBalance(interaction.user.id, amount);
      addBalance(target.id, amount);
      logTx(interaction.user.id, "TRANSFER_OUT", amount, note, target.id);
      logTx(target.id,           "TRANSFER_IN",  amount, note, interaction.user.id);
      save(db);
      await interaction.reply({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Transfer Complete`).setColor(0x5865f2)
          .addFields(
            { name: "📤 From",         value: `<@${interaction.user.id}>`, inline: true },
            { name: "📥 To",           value: `<@${target.id}>`,          inline: true },
            { name: "💸 Amount",       value: `**${amount.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "💵 Your Balance", value: `**${getBalance(interaction.user.id).toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "📝 Note",         value: note, inline: false },
          ).setTimestamp()
      ]});
      target.send({ embeds: [new EmbedBuilder().setTitle(`${CURRENCY_ICON} Transfer Received!`).setColor(0x5865f2)
        .setDescription(`<@${interaction.user.id}> sent you **${amount.toLocaleString()} ${CURRENCY}**\n**Note:** ${note}\n**Your Balance:** ${getBalance(target.id).toLocaleString()} ${CURRENCY}`)
        .setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()] }).catch(() => {});
      return;
    }

    if (sub === "transactions") {
      const target = interaction.options.getUser("user") ?? interaction.user;
      if (target.id !== interaction.user.id && !isStaff(interaction.member))
        return interaction.reply({ embeds: [errorEmbed("You can only view your own transactions.")], ephemeral: true });
      const history = (db.txHistory[target.id] || []).slice(-10).reverse();
      if (!history.length) return interaction.reply({ content: `📭 No transactions for <@${target.id}>.`, ephemeral: true });
      const rows = history.map(tx => {
        const isCredit = ["CREDIT","TRANSFER_IN"].includes(tx.type);
        const sign = isCredit ? "+" : "-";
        const dot  = isCredit ? "🟢" : "🔴";
        const ts   = `<t:${Math.floor(new Date(tx.timestamp).getTime()/1000)}:R>`;
        return `${dot} \`${sign}${tx.amount.toLocaleString()} ${CURRENCY}\` — ${tx.reason} · ${ts}`;
      });
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Transactions — ${target.username}`).setColor(0x5865f2)
          .setDescription(rows.join("\n"))
          .addFields({ name: "💵 Current Balance", value: `**${getBalance(target.id).toLocaleString()} ${CURRENCY}**`, inline: false })
          .setFooter({ text: "Last 10 transactions" }).setTimestamp()
      ], ephemeral: true });
    }

    if (sub === "richlist") {
      const sorted = Object.entries(db.balances).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,10);
      if (!sorted.length) return interaction.reply({ content: "📭 No balances yet.", ephemeral: true });
      const medals = ["🥇","🥈","🥉"];
      const rows = sorted.map(([uid, bal], i) => `${medals[i]??`\`#${i+1}\``} <@${uid}> — **${bal.toLocaleString()} ${CURRENCY}**`);
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Wealthiest Pilots`).setColor(0xffd700)
          .setDescription(rows.join("\n")).setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()
      ]});
    }
  },
};