const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const PdsAtm = require('../models/PdsAtm');
const { config } = require('../config');
const { sessionUrl } = require('./service');
const { deleteImage, uploadImageFromUrl } = require('../services/cloudinary');
const { dayKey, formatDate } = require('../utils/date');

/**
 * "[22] • Yvick Waler" à partir du surnom Discord ("[22] Yvick Waler", "22 | Yvick Waler",
 * "Yvick Waler [22]"…). Sans numéro trouvé, le surnom est affiché tel quel.
 */
function formatAgentName(nickname) {
  const leading = /^\s*[[(]?\s*(\d{1,4})\s*[\])]?\s*[-|•·:.]?\s*(.+?)\s*$/.exec(nickname);
  if (leading) return `[${leading[1]}] • ${leading[2]}`;
  const trailing = /^\s*(.+?)\s*[-|•·]?\s*[[(]\s*(\d{1,4})\s*[\])]\s*$/.exec(nickname);
  if (trailing) return `[${trailing[2]}] • ${trailing[1]}`;
  return nickname.trim();
}

/** Agents de la session (texte, sans mention), d'après leur surnom sur le serveur. Motard : 🏍️. */
function buildAgentLabels(guild, session) {
  return session.dispatch.map((agent) => {
    const member = guild.members.cache.get(agent.userId);
    const name = formatAgentName(member?.nickname ?? member?.displayName ?? agent.userId);
    return agent.roles.includes('moto') ? `${name} 🏍️` : name;
  });
}

/**
 * Message (Components V2) d'une PDS ATM.
 * Le bouton ✏️ n'est utilisable que tant que la session est en cours.
 */
function renderPdsMessage(pds, session) {
  const editable = session.status === 'in_progress';

  const container = new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("- **__Emplacement de l'ATM :__**"))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`pds:edit:${pds._id}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✏️')
            .setDisabled(!editable),
        ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(pds.image.url)),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `- **__Immatriculation :__** \`${session.vehicle}\``,
          '- **__Agents :__**',
          ...pds.agents.map((agent) => `> - ${agent}`),
          `- **__Mallettes :__** \`${pds.mallettes}\``,
          `- **__Date :__** \`${formatDate(session.scheduledAt, config.timezone)}\``,
        ].join('\n'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pds:num:${pds._id}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel(String(pds.number).padStart(2, '0'))
          .setDisabled(true),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Session ATM').setURL(sessionUrl(session)),
      ),
    );

  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

async function fetchPdsChannel(client) {
  const channelId = config.channels.pdsAtm;
  if (!channelId) throw new Error("le salon des PDS ATM n'est pas configuré (`BOBCAT_PDS_ATM_CHANNEL_ID` dans le .env)");
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable?.()) {
    throw new Error(`le salon des PDS ATM (${channelId}) est introuvable ou inaccessible au bot`);
  }
  return channel;
}

/**
 * Crée une PDS : photo envoyée sur Cloudinary, numéro du jour, message dans BOBCAT_PDS_ATM_CHANNEL_ID.
 * Le numéro repart à 1 chaque jour ; le jour est celui de la session (une session commencée à 23h
 * et finie à 1h compte pour le jour où elle a commencé).
 */
async function createPds(interaction, session, { mallettes, attachment }) {
  const channel = await fetchPdsChannel(interaction.client);
  const image = await uploadImageFromUrl(attachment.url, `pds/${session._id}`);
  const key = dayKey(session.scheduledAt, config.timezone);

  let pds = null;
  try {
    for (let attempt = 0; !pds; attempt += 1) {
      const number = (await PdsAtm.countDocuments({ guildId: session.guildId, dayKey: key })) + 1;
      try {
        pds = await PdsAtm.create({
          guildId: session.guildId,
          sessionId: session._id,
          number,
          dayKey: key,
          mallettes,
          image,
          agents: buildAgentLabels(interaction.guild, session),
          createdBy: interaction.user.id,
        });
      } catch (error) {
        if (error.code !== 11000 || attempt >= 4) throw error; // numéro pris en même temps : on réessaie
      }
    }
    const message = await channel.send(renderPdsMessage(pds, session));
    pds.channelId = channel.id;
    pds.messageId = message.id;
    await pds.save();
    return { pds, message };
  } catch (error) {
    if (pds) await pds.deleteOne().catch(() => null);
    await deleteImage(image.publicId).catch(() => null);
    throw error;
  }
}

/** Remplace la photo d'une PDS (l'ancienne est supprimée de Cloudinary). */
async function replacePdsImage(pds, attachment) {
  const image = await uploadImageFromUrl(attachment.url, `pds/${pds.sessionId}`);
  const previous = pds.image.publicId;
  pds.image = image;
  await deleteImage(previous).catch((error) => console.error('[Cloudinary] Suppression impossible :', error));
}

/** Met à jour les messages des PDS d'une session (ex : ✏️ désactivé quand la session est terminée). */
async function refreshSessionPds(client, session) {
  for (const pds of await PdsAtm.find({ sessionId: session._id })) {
    if (!pds.channelId || !pds.messageId) continue;
    try {
      const channel = await client.channels.fetch(pds.channelId);
      await channel.messages.edit(pds.messageId, renderPdsMessage(pds, session));
    } catch (error) {
      console.error('[PDS] Mise à jour du message impossible :', error);
    }
  }
}

module.exports = { formatAgentName, renderPdsMessage, createPds, replacePdsImage, refreshSessionPds };
