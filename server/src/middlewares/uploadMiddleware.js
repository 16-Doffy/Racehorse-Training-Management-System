const multer = require('multer');

/**
 * Uploads are kept in memory only long enough to be written to GridFS (see utils/fileStore.js);
 * nothing is written to the server's disk, which the host wipes on every deploy.
 */
const storage = multer.memoryStorage();

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif)$/;
const DOCUMENT_TYPES = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

function onlyTypes(pattern, message) {
  return (req, file, cb) => {
    if (pattern.test(file.mimetype)) return cb(null, true);
    const err = new Error(message);
    err.statusCode = 400;
    return cb(err);
  };
}

// Incident photos: images up to 5 MB.
const uploadIncidentImages = multer({
  storage,
  fileFilter: onlyTypes(IMAGE_TYPES, 'Chỉ nhận ảnh (jpeg, png, webp, gif).'),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
});

// Exam attachments: X-rays, lab results, scanned prescriptions — images or PDF up to 10 MB.
const uploadMedicalFiles = multer({
  storage,
  fileFilter: onlyTypes(DOCUMENT_TYPES, 'Chỉ nhận ảnh (jpeg, png, webp, gif) hoặc PDF.'),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

module.exports = { uploadIncidentImages, uploadMedicalFiles };
