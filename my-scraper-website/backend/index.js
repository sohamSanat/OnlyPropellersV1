// index.js
const puppeteer = require('puppeteer');
// REMOVE downloadImage from here as we'll handle it directly with axios
const { scrapePostLinks, scrapeImagesFromPost } = require('./scraper');
const config = require('./config/config');
// REMOVE fs and path as we are no longer saving locally
// const fs = require('fs');
// const path = require('path');

// This function will now take the initial offset for the URL.
// It will scrape up to 100 posts (2 pages) per call.
// It now ACCEPTS an 'io' (socket) object, and new 'cloudinary' and 'axios' objects.
async function main(ofModel, startOffset, io, cloudinary, axios) { // ADD cloudinary, axios here
    let POSTS_SCRAPED_IN_THIS_RUN = 0; // Track posts scraped in *this specific run*
    const MAX_POSTS_PER_RUN = 100; // Limit to 100 posts per index.js execution

    // Use io.emit directly now for progress updates
    io.emit('progress_update', { message: `[Chunk ${startOffset}] Starting new browser session for ${ofModel}...` });

    let browser; // Declare browser outside try for finally block access
    try {
        browser = await puppeteer.launch({
            headless: config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Recommended for Docker/server environments
                '--disable-accelerated-video-decode',
                '--no-zygote',
                '--single-process' // Often helps with memory and stability in constrained environments
            ]
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000); // Set a default timeout for navigation

        let currentOffset = startOffset; // Use the provided startOffset

        // Loop to get two pages (50 posts each), for a total of 100 posts per call to main
        for (let page_chunk_iteration = 0; page_chunk_iteration < MAX_POSTS_PER_RUN / 50; page_chunk_iteration++) {
            if (POSTS_SCRAPED_IN_THIS_RUN >= MAX_POSTS_PER_RUN) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_RUN}).` });
                break; // Stop if 100 posts are scraped within this run
            }

            // Construct the URL using the currentOffset
            const currentTargetUrl = `https://coomer.su/onlyfans/user/${ofModel}?o=${currentOffset}`;
            io.emit('progress_update', { message: `[Chunk ${startOffset}] Scraping post links from: ${currentTargetUrl}` });

            // Add a delay before scraping each chunk of 50 posts (after the first page)
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
                if (POSTS_SCRAPED_IN_THIS_RUN >= MAX_POSTS_PER_RUN) {
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_RUN}). Exiting post loop.` });
                    break;
                }

                io.emit('progress_update', { message: `[Chunk ${startOffset}] Entering post: ${postLink}` });
                const imageUrls = await scrapeImagesFromPost(page, postLink);
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${imageUrls.length} images/videos in post.` });

                for (const imageUrl of imageUrls) {
                    try {
                        const filename = new URL(imageUrl).pathname.split('/').pop(); // Get filename from URL
                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Processing: ${filename} from ${imageUrl}` });

                        // --- NEW: Download image/video and Upload to Cloudinary ---
                        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                        const mediaBuffer = Buffer.from(response.data);
                        const mimeType = response.headers['content-type'];
                        let resourceType = 'raw'; // Default for unknown or unsupported types

                        if (mimeType.startsWith('image/')) {
                            resourceType = 'image';
                        } else if (mimeType.startsWith('video/')) {
                            resourceType = 'video';
                        }

                        const uploadResult = await cloudinary.uploader.upload(`data:${mimeType};base64,${mediaBuffer.toString('base64')}`, {
                            folder: `onlyfans_scrapes/${ofModel}`, // Organize files by model
                            resource_type: resourceType,
                            // Optional: Generate a unique public ID to avoid overwrites
                            public_id: `${ofModel}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
                        });

                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Uploaded to Cloudinary: ${uploadResult.secure_url}` });
                        io.emit('image_scraped', {
                            imageUrl: uploadResult.secure_url,
                            modelName: ofModel,
                            originalUrl: imageUrl,
                            // You can add more data here if scraped from the postLink
                        });
                        // --- END NEW LOGIC ---

                    } catch (error) {
                        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to process ${imageUrl}: ${error.message}` });
                        console.error(`[Chunk ${startOffset}] Failed to process ${imageUrl}:`, error);
                    }
                }
                POSTS_SCRAPED_IN_THIS_RUN++;
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Posts scraped in current run: ${POSTS_SCRAPED_IN_THIS_RUN}` });
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
            io.emit('progress_update', { message: `[Chunk ${startOffset}] Browser closed. Scraped ${POSTS_SCRAPED_IN_THIS_RUN} posts in this session.` });
        }
    }

    // Return the number of posts scraped in this specific run.
    return POSTS_SCRAPED_IN_THIS_RUN;
}

// The if (require.main === module) block is no longer necessary as master.js directly calls this.
// Ensure module.exports is present and uncommented
module.exports = main;
