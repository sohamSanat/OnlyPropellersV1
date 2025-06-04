// backend/cloudinaryConfig.js
// This file configures the Cloudinary SDK using environment variables.
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with credentials from environment variables.
// These variables MUST be set in your Render backend service's environment settings.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Ensures URLs are HTTPS, which is good practice.
});

// Log for debugging purposes to confirm configuration is loaded.
console.log('Cloudinary Configuration Loaded!');

// Export the configured cloudinary object for use in other files (e.g., master.js, index.js).
module.exports = cloudinary;
