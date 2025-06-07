// index.js
const puppeteer = require('puppeteer');
const { scrapePostLinks, scrapeImagesFromPost } = require('./scraper');
const config = require('./config/config');
const cloudinary = require('./cloudinaryConfig'); // Import the configured Cloudinary object
const axios = require('axios'); // For downloading images

// This function will now take the initial offset for the URL.
// It will scrape up to 100 posts (2 pages) per call.
// It now ACCEPTS an 'io' (socket) object, and new 'cloudinary' and 'axios' objects.
async function main(ofModel, startOffset, io, cloudinary, axios) {
    // Renamed for clarity: this tracks the number of posts for which content was attempted
    let postsProcessedInThisChunk = 0;
    const MAX_POSTS_PER_CHUNK = 100; // Limit to 100 posts for this index.js execution (2 pages)

    io.emit('progress_update', { message: `[Chunk ${startOffset}] Starting new browser session for ${ofModel}...` });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-video-decode',
                '--no-zygote',
                '--single-process'
            ]
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000); // Set a default timeout for navigation

        let currentOffset = startOffset;

        // Loop to get two pages (50 posts each), for a total of 100 posts per call to main
        for (let page_chunk_iteration = 0; page_chunk_iteration < MAX_POSTS_PER_CHUNK / 50; page_chunk_iteration++) {
            // Check if we've already processed enough posts for this chunk
            if (postsProcessedInThisChunk >= MAX_POSTS_PER_CHUNK) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_CHUNK}).` });
                break;
            }

            const currentTargetUrl = `https://coomer.su/onlyfans/user/${ofModel}?o=${currentOffset}`;
            io.emit('progress_update', { message: `[Chunk ${startOffset}] Scraping post links from: ${currentTargetUrl}` });

            if (page_chunk_iteration > 0) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Waiting 3 seconds before loading next page chunk...` });
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const postLinks = await scrapePostLinks(page, currentTargetUrl);

            if (!postLinks || postLinks.length === 0) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] No more post links found on ${currentTargetUrl}. Stopping this chunk.` });
                break; // No more posts on this page
            }

            io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${postLinks.length} post links on this page (offset: ${currentOffset}).` });

            // Process posts found on this specific page (up to 50)
            for (const postLink of postLinks) {
                if (postsProcessedInThisChunk >= MAX_POSTS_PER_CHUNK) {
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_CHUNK}). Exiting post loop.` });
                    break;
                }

                io.emit('progress_update', { message: `[Chunk ${startOffset}] Entering post: ${postLink}` });
                let imageUrls = [];
                try {
                    imageUrls = await scrapeImagesFromPost(page, postLink);
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${imageUrls.length} images/videos in post.` });
                } catch (scrapeError) {
                    console.error(`[Chunk ${startOffset}] Error scraping images from post ${postLink}:`, scrapeError.message);
                    io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to scrape images from post ${postLink}: ${scrapeError.message}` });
                    // Continue to next post even if image scraping fails for one post
                }

                // Increment postsProcessedInThisChunk here, for each post visited
                postsProcessedInThisChunk++;

                // Process found media (download and upload)
                for (const imageUrl of imageUrls) {
                    try {
                        const filename = new URL(imageUrl).pathname.split('/').pop();
                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Processing media: ${filename} from ${imageUrl}` });

                        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                        const mediaBuffer = Buffer.from(response.data);
                        const mimeType = response.headers['content-type'];
                        let resourceType = 'raw';

                        if (mimeType && mimeType.startsWith('image/')) {
                            resourceType = 'image';
                        } else if (mimeType && mimeType.startsWith('video/')) {
                            resourceType = 'video';
                        }

                        const uploadResult = await cloudinary.uploader.upload(`data:${mimeType};base64,${mediaBuffer.toString('base64')}`, {
                            folder: `onlyfans_scrapes/${ofModel}`,
                            resource_type: resourceType,
                            public_id: `${ofModel}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
                        });

                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Uploaded media: ${uploadResult.secure_url}` });
                        io.emit('image_scraped', {
                            imageUrl: uploadResult.secure_url,
                            modelName: ofModel,
                            originalUrl: imageUrl,
                        });

                    } catch (uploadError) {
                        console.error(`[Chunk ${startOffset}] Error processing media ${imageUrl}:`, uploadError.message);
                        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to process media ${imageUrl}: ${uploadError.message}` });
                    }
                }
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Posts processed in current chunk: ${postsProcessedInThisChunk}` });
            }
            currentOffset += 50; // Increment the offset for the next 50 posts (next page)
        }
    } catch (error) {
        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] An error occurred during scraping: ${error.message}` });
        console.error(`[Chunk ${startOffset}] Unhandled error in index.js:`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            io.emit('progress_update', { message: `[Chunk ${startOffset}] Browser closed. Processed ${postsProcessedInThisChunk} posts in this session.` });
        }
    }

    // Return the number of posts processed in this specific chunk.
    return postsProcessedInThisChunk;
}

module.exports = main;
