// commands/review.js
const { SlashCommandBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const { COLORS, text, separator, container, sectionWithThumbnail, componentsPayload } = require("../utils/components");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Post a review or view all reviews.")
    .addSubcommand(s => s.setName("post")
      .setDescription("Post a review.")
      .addIntegerOption(o =>
        o.setName("stars").setDescription("Your rating").setRequired(true)
          .addChoices(
            { name: "⭐ 1", value: 1 }, { name: "⭐ 2", value: 2 },
            { name: "⭐ 3", value: 3 }, { name: "⭐ 4", value: 4 }, { name: "⭐ 5", value: 5 },
          ))
      .addStringOption(o => o.setName("review").setDescription("Your review text").setRequired(true))
      .addAttachmentOption(o => o.setName("image").setDescription("Optional screenshot").setRequired(false)))
    .addSubcommand(s => s.setName("list")
      .setDescription("View recent reviews.")
      .addIntegerOption(o => o.setName("page").setDescription("Page number").setRequired(false).setMinValue(1))),

  async execute(interaction, client) {
    const emoji  = config.EMOJI;
    const starTag = emoji.STAR.tag;
    const sub    = interaction.options.getSubcommand();

    if (sub === "post") {
      const rating = interaction.options.getInteger("stars");
      const rtext  = interaction.options.getString("review");
      const image  = interaction.options.getAttachment("image");
      const now    = new Date();
      const dateStr = now.toLocaleString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });

      db.reviews.push({
        userId: interaction.user.id, username: interaction.user.username,
        stars: rating, text: rtext, imageUrl: image?.url ?? null,
        timestamp: now.toISOString(),
      });
      save(db);

      const body =
        `**Review**\n` +
        `<@${interaction.user.id}> has posted a **General Review**!\n\n` +
        `${starTag.repeat(rating)}\n\n` +
        `**Review**\n${rtext}\n\n` +
        `-# ${dateStr}`;

      const panel = container(COLORS.GREY);
      if (image) {
        panel.addSectionComponents(sectionWithThumbnail(body, image.url));
      } else {
        panel.addTextDisplayComponents(text(body));
      }

      await interaction.reply(componentsPayload([panel]));

      if (config.REVIEW_CHANNEL) {
        try {
          const ch = await client.channels.fetch(config.REVIEW_CHANNEL);
          if (ch) await ch.send(componentsPayload([panel]));
        } catch {}
      }
      return;
    }

    if (sub === "list") {
      if (!db.reviews.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text("No reviews posted yet."))],
          { ephemeral: true }
        ));

      const page    = (interaction.options.getInteger("page") ?? 1) - 1;
      const perPage = 5;
      const total   = db.reviews.length;
      const slice   = [...db.reviews].reverse().slice(page * perPage, page * perPage + perPage);
      const pages   = Math.ceil(total / perPage);
      const avg     = (db.reviews.reduce((s, r) => s + r.stars, 0) / total).toFixed(1);

      const panel = container(COLORS.GREY)
        .addTextDisplayComponents(text(`${emoji.SCROLL.tag} **Reviews**`))
        .addSeparatorComponents(separator());

      slice.forEach((r, i) => {
        const d = new Date(r.timestamp).toLocaleString("en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        panel.addTextDisplayComponents(text(
          `<@${r.userId}> — ${starTag.repeat(r.stars)}\n${r.text}\n-# ${d}`
        ));
        if (i < slice.length - 1) panel.addSeparatorComponents(separator());
      });

      panel.addSeparatorComponents(separator())
        .addTextDisplayComponents(text(`-# ${starTag.repeat(Math.round(Number(avg)))} ${avg}/5 · ${total} reviews · Page ${page + 1}/${pages}`));

      return interaction.reply(componentsPayload([panel]));
    }
  },
};