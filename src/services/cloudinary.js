const { v2: cloudinary } = require('cloudinary');
const { config } = require('../config');

const { cloudName, apiKey, apiSecret, folder: baseFolder } = config.cloudinary;
const enabled = Boolean(cloudName && apiKey && apiSecret);

if (enabled) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
} else {
  console.warn('[Cloudinary] Identifiants absents : l\'ajout de photos aux sessions est désactivé.');
}

const isCloudinaryEnabled = () => enabled;

/**
 * Télécharge une image (ex : pièce jointe Discord, dont l'URL expire) et l'enregistre sur Cloudinary.
 * @param {string} url URL de l'image à sauvegarder.
 * @param {string} subFolder Sous-dossier (ex : identifiant de la session).
 * @returns {Promise<{ url: string, publicId: string }>}
 */
async function uploadImageFromUrl(url, subFolder) {
  if (!enabled) throw new Error('Cloudinary n\'est pas configuré.');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `${baseFolder}/${subFolder}`, resource_type: 'image' },
      (error, uploadResult) => (error ? reject(error) : resolve(uploadResult)),
    );
    stream.end(buffer);
  });

  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Supprime une image de Cloudinary.
 * @param {string} publicId
 */
async function deleteImage(publicId) {
  if (!enabled) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
}

module.exports = { isCloudinaryEnabled, uploadImageFromUrl, deleteImage };
