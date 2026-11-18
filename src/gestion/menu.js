const { ActionRowBuilder, ContainerBuilder } = require('discord.js');
const { button, ephemeralPanel, panelMessage, text } = require('./ui');

/** Message de /gestion : un bouton par partie (chacun ouvre son panneau, visible uniquement par soi). */
function renderGestionMenu() {
  const buttons = [
    button('ges:lieux', 'Lieux de patrouille'),
    button('ges:vehicules', 'Véhicules'),
    button('ges:sup', 'Superviseur ATM'),
    button('ges:sep', 'Séparateurs'),
    button('ges:upr', 'Agents UPR'),
  ];
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text('## Gestion'))
    .addActionRowComponents(buttons.map((item) => new ActionRowBuilder().addComponents(item)));
  return ephemeralPanel(panelMessage(container));
}

module.exports = { renderGestionMenu };
