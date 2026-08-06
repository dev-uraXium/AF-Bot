// commands/utility.js — /ping | /help
const { SlashCommandBuilder } = require("discord.js");
const config = require("../config");
const { COLORS, text, separator, container, componentsPayload } = require("../utils/components");

module.exports = [
  {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency."),
    async execute(interaction, client) {
      const sent = await interaction.reply(componentsPayload(
        [container(COLORS.PURPLE).addTextDisplayComponents(text("Pinging…"))],
        { fetchReply: true }
      ));
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      await interaction.editReply(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text("**Pong!**"))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Bot Latency**: \`${latency}ms\`\n**API Latency**: \`${Math.round(client.ws.ping)}ms\``))
      ]));
    },
  },
  {
    data: new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
    async execute(interaction) {
      const emoji = config.EMOJI;
      const panel = container(COLORS.PURPLE)
        .addTextDisplayComponents(text(`${emoji.INFO.tag} **AFBot — Command Reference**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Flight Logging**\n" +
          "`/log` — Submit a flight log with proof\n" +
          "`/flight add` — Manually add a flight *(staff)*\n" +
          "`/flight remove` — Remove a logged flight *(staff)*\n" +
          "`/leaderboard` — Top pilots by total flights\n" +
          "`/stats [user]` — Pilot statistics\n" +
          "`/profile [user]` — Full pilot profile"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Reviews**\n`/review post` — Post a review\n`/review list` — Browse reviews"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Tickets**\n`/ticket open` — Open a support ticket\n`/ticket add` — Add a user/role\n`/ticket remove` — Remove a user\n`/ticket close` — Close the ticket"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Economy**\n`/economy balance` — Check your wallet\n`/economy transfer` — Send money\n`/economy transactions` — Your history\n`/economy richlist` — Wealthiest pilots"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Contracts**\n`/contract list` — Available contracts\n`/contract claim` — Via button on post\n`/contract mine` — Your active contracts\n`/contract complete` — Submit completion"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Tiers**\n`/tier info` — View tier programme\n`/tier buy` — Purchase a tier\n`/tier status` — Check your tier"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**NOTAMs**\n`/notam list` — Active NOTAMs\n`/notam post` / `expire` *(staff)*"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(
          "**Moderation** *(Staff only)*\n`/mod warn` · `/mod warnings` · `/mod strike` · `/mod clearstrikes`"
        ))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text("-# AFBot • Virtual Airline"));

      await interaction.reply(componentsPayload([panel]));
    },
  },
];