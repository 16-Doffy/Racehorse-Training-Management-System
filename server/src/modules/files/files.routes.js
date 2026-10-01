const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { uploadMedicalFiles } = require('../../middlewares/uploadMiddleware');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const { saveFile, findFile, openDownload, isValidSignature } = require('../../utils/fileStore');

/**
 * Shared upload: any signed-in user stores up to 5 files (images or PDF, 10 MB each) and gets back
 * the URLs to put on a record — an avatar, a photo, a document. Field name: `files`.
 */
const uploadFiles = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return fail(res, 'Chưa chọn tệp nào (trường "files").', 400);
  const saved = await Promise.all(files.map((f) => saveFile(f, { uploadedBy: req.user._id, purpose: req.body.purpose || 'general' })));
  return ok(res, saved, 'Files uploaded.');
});

/** Streams a stored file. Needs the signature that came with its URL instead of a login token. */
const getFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidSignature(id, req.query.s)) return fail(res, 'Liên kết tệp không hợp lệ.', 403);
  const file = await findFile(id);
  if (!file) return fail(res, 'Không tìm thấy tệp.', 404);

  const name = encodeURIComponent(file.filename || 'file');
  res.set({
    'Content-Type': file.metadata?.contentType || 'application/octet-stream',
    'Content-Length': file.length,
    // A stored file never changes under the same id.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': `inline; filename*=UTF-8''${name}`,
  });
  openDownload(id)
    .on('error', () => {
      if (!res.headersSent) fail(res, 'Không đọc được tệp.', 500);
      else res.end();
    })
    .pipe(res);
  return undefined;
});

router.post('/uploads', protect, uploadMedicalFiles.array('files', 5), uploadFiles);
router.get('/files/:id', getFile);

module.exports = router;
