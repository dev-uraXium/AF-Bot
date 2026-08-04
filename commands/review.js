// commands/review.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const { star }     = require("../utils/helpers");

const COLORS = [0xff4444, 0xff8c00, 0xffd700, 0x7fcf5f, 0x00cc66];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Post a review or view all reviews.")

    .addSubcommand(sub =>
      sub.setName("post")
        .setDescription("Post a flight review.")
        .addIntegerOption(o =>
          o.setName("stars").setDescription("Your rating").setRequired(true)
            .addChoices(
              { name: "⭐ (1)", value: 1 },
              { name: "⭐⭐ (2)", value: 2 },
              { name: "⭐⭐⭐ (3)", value: 3 },
              { name: "⭐⭐⭐⭐ (4)", value: 4 },
              { name: "⭐⭐⭐⭐⭐ (5)", value: 5 },
            ))
        .addStringOption(o => o.setName("context").setDescription("Flight / context (e.g. KAV001 EGLL→OAKB)").setRequired(true))
        .addStringOption(o => o.setName("content").setDescription("Your review text").setRequired(true)))

    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("View all posted reviews.")
        .addIntegerOption(o => o.setName("page").setDescription("Page number").setRequired(false).setMinValue(1))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── POST ─────────────────────────────────────────────────
    if (sub === "post") {
      const stars   = interaction.options.getInteger("stars");
      const context = interaction.options.getString("context");
      const content = interaction.options.getString("content");

      db.reviews.push({
        userId: interaction.user.id,
        stars, context, content,
        timestamp: new Date().toISOString(),
      });
      save(db);

      const embed = new EmbedBuilder()
        .setTitle("📝 New Review Posted")
        .setColor(COLORS[stars - 1])
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "👤 Pilot",   value: `<@${interaction.user.id}>`, inline: true },
          { name: "⭐ Rating",  value: star(stars),                  inline: true },
          { name: "🗺️ Context", value: context,                      inline: false },
          { name: "💬 Review",  value: content,                      inline: false },
        )
        .setFooter({ text: `Review #${db.reviews.length}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Post to review channel if set
      if (process.env.REVIEW_CHANNEL) {
        const ch = await interaction.client.channels.fetch(process.env.REVIEW_CHANNEL).catch(() => null);
        if (ch) ch.send({ embeds: [embed] });
      }
      return;
    }

    // ── LIST ─────────────────────────────────────────────────
    if (sub === "list") {
      if (db.reviews.length === 0) {
        return interaction.reply({ content: "📭 No reviews posted yet.", ephemeral: true });
      }

      const page    = (interaction.options.getInteger("page") ?? 1) - 1;
      const perPage = 5;
      const total   = db.reviews.length;
      const totalPages = Math.ceil(total / perPage);
      const slice   = [...db.reviews].reverse().slice(page * perPage, page * perPage + perPage);

      const avg = (db.reviews.reduce((s, r) => s + r.stars, 0) / total).toFixed(1);

      const embed = new EmbedBuilder()
        .setTitle("📋 Reviews")
        .setColor(0xffd700)
        .setDescription(
          slice.map(r =>
            `${star(r.stars)} — **${r.context}**\n> ${r.content}\n— <@${r.userId}> · <t:${Math.floor(new Date(r.timestamp).getTime() / 1000)}:R>`
          ).join("\n\n")
        )
        .addFields({ name: "📊 Average Rating", value: `${avg}/5 ⭐ (${total} reviews)`, inline: false })
        .setFooter({ text: `Page ${page + 1}/${totalPages}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};