const crypto = require('crypto');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const { jwtSecret } = require('../config/env');

/**
 * Uploaded files (incident photos, exam attachments, avatars) are kept in MongoDB with GridFS.
 *
 * They used to be written to the server's own disk under /uploads, which the host wipes on every
 * deploy — so the photos grooms attached to incident reports silently disappeared. GridFS keeps
 * them in the same Atlas database as everything else, with no extra service or credentials.
 *
 * Files are served by GET /api/v1/files/:id?s=<signature>. An <img> tag can't send the login
 * token, so the URL itself carries an HMAC of the id: it opens without logging in, but ids can't
 * be guessed or enumerated.
 */

const BUCKET = 'uploads';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });

const sign = (id) => crypto.createHmac('sha256', jwtSecret).update(String(id)).digest('base64url').slice(0, 22);

/** The URL a client stores and shows. Relative to the API host, like the old /uploads paths. */
const fileUrl = (id) => `/api/v1/files/${id}?s=${sign(id)}`;

const isValidSignature = (id, signature) => typeof signature === 'string' && signature === sign(id);

/** Saves one multer file (memory storage) and returns what to store on the record. */
function saveFile(file, meta = {}) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(file.originalname || 'file', {
      metadata: { contentType: file.mimetype, ...meta },
    });
    Readable.from(file.buffer)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () =>
        resolve({
          id: upload.id,
          url: fileUrl(upload.id),
          name: file.originalname,
          contentType: file.mimetype,
          size: file.size,
        })
      );
  });
}

async function findFile(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const [doc] = await bucket().find({ _id: new mongoose.Types.ObjectId(id) }).toArray();
  return doc || null;
}

const openDownload = (id) => bucket().openDownloadStream(new mongoose.Types.ObjectId(id));

/** The GridFS id inside one of our file URLs, or null for anything else (e.g. old /uploads paths). */
function idFromUrl(url) {
  const match = /\/files\/([a-f0-9]{24})/.exec(String(url || ''));
  return match ? match[1] : null;
}

async function deleteFileByUrl(url) {
  const id = idFromUrl(url);
  if (!id) return;
  try {
    await bucket().delete(new mongoose.Types.ObjectId(id));
  } catch (_err) {
    // Already gone — nothing to clean up.
  }
}

module.exports = { saveFile, findFile, openDownload, fileUrl, isValidSignature, idFromUrl, deleteFileByUrl };
