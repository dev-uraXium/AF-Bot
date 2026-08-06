// utils/components.js — Components v2 builder helpers
//
// Discord Components v2 replaces embeds with a tree of layout components:
// Container > Section/TextDisplay/Separator/MediaGallery/ActionRow
//
// A message using Components v2 MUST set flags: MessageFlags.IsComponentsV2
// and CANNOT mix in embeds or top-level `content` — everything is components.

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  SeparatorSpacingSize,
} = require("discord.js");

// ── Color accents (used as container accent_color) ────────────
const COLORS = {
  BLUE:    0x2f6bd6,
  GREEN:   0x57f287,
  RED:     0xff4444,
  ORANGE:  0xff8c00,
  GOLD:    0xffd700,
  GREY:    0x36393f,
  PURPLE:  0x5865f2,
  BRONZE:  0xcd7f32,
  SILVER:  0xc0c0c0,
  RUBY:    0xe0115f,
};

// ── Basic building blocks ──────────────────────────────────────
function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator(spacing = "small", divider = true) {
  const s = new SeparatorBuilder().setDivider(divider);
  s.setSpacing(spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
  return s;
}

function container() {
  // Accent colors intentionally disabled — plain containers only, per branding.
  // Any color argument passed by callers is ignored on purpose.
  return new ContainerBuilder();
}

function mediaGallery(...urls) {
  const gallery = new MediaGalleryBuilder();
  for (const url of urls) {
    gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
  }
  return gallery;
}

// Section = text block(s) + accessory (thumbnail image or a button)
function sectionWithThumbnail(textContent, thumbnailUrl) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(textContent))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
}

function sectionWithButton(textContent, btn) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(textContent))
    .setButtonAccessory(btn);
}

function button(customId, label, style = ButtonStyle.Primary, emojiTag = null, disabled = false) {
  const b = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
  if (emojiTag && typeof emojiTag === "object" && emojiTag.id) {
    b.setEmoji({ id: emojiTag.id, name: emojiTag.name });
  }
  return b;
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

// ── Payload wrapper — always sets the Components v2 flag ──────
function componentsPayload(components, extra = {}) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components,
    ...extra,
  };
}

module.exports = {
  COLORS,
  text, separator, container, mediaGallery,
  sectionWithThumbnail, sectionWithButton,
  button, row,
  componentsPayload,
  ButtonStyle,
};