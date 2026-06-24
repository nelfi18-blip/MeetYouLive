const multer = require("multer");

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error("Solo se permiten imágenes (JPEG, PNG, WebP, GIF)");
    err.code = "UNSUPPORTED_MEDIA_TYPE";
    err.status = 415;
    cb(err, false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;
