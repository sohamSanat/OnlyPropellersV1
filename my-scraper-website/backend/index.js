const scraper = require('./scraper');
const axios = require('axios');
const cloudinary = require('./cloudinaryConfig');

const MAX_POSTS_PER_CHUNK = 10;

async function main(modelName, startOffset, io, browser, socketId) {
  const page = await browser.newPage();
  let postsProcessed = 0;

  try {
    const postLinks = await scraper.scrapePostLinks(page, modelName, startOffset, MAX_POSTS_PER_CHUNK);

    for (const postUrl of postLinks) {
      const mediaUrls = await scraper.scrapeImagesFromPost(page, postUrl);

      for (const mediaUrl of mediaUrls) {
        try {
          const response = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 15000 });
          const base64 = Buffer.from(response.data, 'binary').toString('base64');
          const uploadResponse = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64}`, {
            folder: `onlyfans_scrapes/${modelName}`,
          });

          io.to(socketId).emit('image_scraped', { url: uploadResponse.secure_url });
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
        }

        await new Promise((r) => setTimeout(r, 500)); // short delay for stability
      }
      postsProcessed++;
    }
  } catch (err) {
    console.error('Error in index.js:', err);
  } finally {
    await page.close();
  }

  return postsProcessed;
}

module.exports = { main };
