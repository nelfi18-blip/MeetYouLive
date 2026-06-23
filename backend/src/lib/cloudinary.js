const { v2: cloudinary } = require("cloudinary");

let configured = false;

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  const err = new Error(`${name} is required to upload profile photos`);
  err.code = "CLOUDINARY_CONFIG_MISSING";
  throw err;
};

const configureCloudinary = () => {
  if (configured) return;
  cloudinary.config({
    cloud_name: getRequiredEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: getRequiredEnv("CLOUDINARY_API_KEY"),
    api_secret: getRequiredEnv("CLOUDINARY_API_SECRET"),
    secure: true,
  });
  configured = true;
};

/**
 * Upload a profile photo buffer to Cloudinary.
 *
 * @param {{buffer?: Buffer}} file Multer memory-storage file containing the image buffer.
 * @param {string} userId Authenticated user ID used in the Cloudinary public ID.
 * @returns {Promise<object>} Cloudinary upload result, including secure_url and public_id.
 * @throws {Error} Missing file buffer, missing Cloudinary configuration, or Cloudinary API failure.
 */
const uploadProfilePhoto = (file, userId) =>
  new Promise((resolve, reject) => {
    if (!file?.buffer?.length) {
      const err = new Error("No profile photo buffer received");
      err.code = "CLOUDINARY_FILE_REQUIRED";
      reject(err);
      return;
    }

    try {
      configureCloudinary();
    } catch (err) {
      reject(err);
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "meetyoulive/profile-photos",
        public_id: `avatar-${userId}-${Date.now()}`,
        resource_type: "image",
        overwrite: false,
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        if (!result?.secure_url) {
          reject(new Error("Cloudinary did not return a secure_url"));
          return;
        }
        resolve(result);
      }
    );

    uploadStream.end(file.buffer);
  });

module.exports = {
  uploadProfilePhoto,
};
