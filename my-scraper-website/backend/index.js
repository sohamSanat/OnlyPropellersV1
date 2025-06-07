// index.js
const puppeteer = require('puppeteer');
const { scrapePostLinks, scrapeImagesFromPost } = require('./scraper');
const config = require('./config/config');
const cloudinary = require('./cloudinaryConfig');
const axios = require('axios');

// This function will now take the initial offset for the URL.
// It will scrape up to 100 posts (2 pages) per call.
// It now ACCEPTS an 'io' (socket) object, and new 'cloudinary' and 'axios' objects.
async function main(ofModel, startOffset, io, cloudinary, axios) {
    let postsProcessedInThisChunk = 0;
    const MAX_POSTS_PER_CHUNK = 100;

    io.emit('progress_update', { message: `[Chunk ${startOffset}] Starting new browser session for ${ofModel}...` });
    console.log(`[Index Debug] Chunk ${startOffset}: Initiating Puppeteer browser.`); // Debugging

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new', // Use 'new' for the latest headless mode
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Critical for Render/Docker environments
                '--disable-accelerated-video-decode',
                '--no-zygote',
                '--single-process' // Helps with memory and stability
            ]
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(120000); // Increased default timeout to 120 seconds (2 minutes) for page operations
        console.log(`[Index Debug] Chunk ${startOffset}: Puppeteer browser launched, page opened.`); // Debugging

        let currentOffset = startOffset;

        for (let page_chunk_iteration = 0; page_chunk_iteration < MAX_POSTS_PER_CHUNK / 50; page_chunk_iteration++) {
            if (postsProcessedInThisChunk >= MAX_POSTS_PER_CHUNK) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_CHUNK}).` });
                console.log(`[Index Debug] Chunk ${startOffset}: Max posts reached for this main() call.`); // Debugging
                break;
            }

            const currentTargetUrl = `https://coomer.su/onlyfans/user/${ofModel}?o=${currentOffset}`;
            io.emit('progress_update', { message: `[Chunk ${startOffset}] Scraping post links from: ${currentTargetUrl}` });
            console.log(`[Index Debug] Chunk ${startOffset}: Scraping post links from: ${currentTargetUrl}`); // Debugging

            if (page_chunk_iteration > 0) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Waiting 3 seconds before loading next page chunk...` });
                console.log(`[Index Debug] Chunk ${startOffset}: Delaying for next page chunk.`); // Debugging
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const postLinks = await scrapePostLinks(page, currentTargetUrl);

            if (!postLinks || postLinks.length === 0) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] No more post links found on ${currentTargetUrl}. Stopping this chunk.` });
                console.log(`[Index Debug] Chunk ${startOffset}: No more post links found. Breaking.`); // Debugging
                break;
            }

            io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${postLinks.length} post links on this page (offset: ${currentOffset}).` });
            console.log(`[Index Debug] Chunk ${startOffset}: Found ${postLinks.length} post links.`); // Debugging

            for (const postLink of postLinks) {
                if (postsProcessedInThisChunk >= MAX_POSTS_PER_CHUNK) {
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_CHUNK}). Exiting post loop.` });
                    console.log(`[Index Debug] Chunk ${startOffset}: Max posts reached within post loop. Breaking.`); // Debugging
                    break;
                }

                io.emit('progress_update', { message: `[Chunk ${startOffset}] Entering post: ${postLink}` });
                console.log(`[Index Debug] Chunk ${startOffset}: Processing post: ${postLink}`); // Debugging

                let imageUrls = [];
                try {
                    imageUrls = await scrapeImagesFromPost(page, postLink);
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${imageUrls.length} images/videos in post.` });
                    console.log(`[Index Debug] Chunk ${startOffset}: Found ${imageUrls.length} media items in post.`); // Debugging
                } catch (scrapeError) {
                    console.error(`[Index Error] Chunk ${startOffset}: Error scraping images from post ${postLink}:`, scrapeError.message);
                    io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to scrape images from post ${postLink}: ${scrapeError.message}` });
                    // Continue to next post even if image scraping fails for one post
                }

                postsProcessedInThisChunk++; // Increment for each post visited

                for (const imageUrl of imageUrls) {
                    try {
                        const filename = new URL(imageUrl).pathname.split('/').pop();
                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Processing media: ${filename} from ${imageUrl}` });
                        console.log(`[Index Debug] Chunk ${startOffset}: Downloading and uploading media: ${filename}`); // Debugging

                        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 }); // Added timeout for axios download
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
                        console.log(`[Index Debug] Chunk ${startOffset}: Media uploaded: ${uploadResult.secure_url}`); // Debugging
                        io.emit('image_scraped', {
                            imageUrl: uploadResult.secure_url,
                            modelName: ofModel,
                            originalUrl: imageUrl,
                        });

                    } catch (uploadError) {
                        console.error(`[Index Error] Chunk ${startOffset}: Error processing media ${imageUrl}:`, uploadError.message);
                        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to process media ${imageUrl}: ${uploadError.message}` });
                    }
                }
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Posts processed in current chunk: ${postsProcessedInThisChunk}` });
            }
            currentOffset += 50; // Increment the offset for the next 50 posts (next page)
        }
    } catch (error) {
        console.error(`[Index Error] Chunk ${startOffset}: An unhandled error occurred during scraping:`, error.message);
        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] An error occurred during scraping: ${error.message}` });
        throw error; // Re-throw to be caught by master.js
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[Index Debug] Chunk ${startOffset}: Browser closed. Processed ${postsProcessedInThisChunk} posts in this session.`); // Debugging
        }
    }

    return postsProcessedInThisChunk;
}

module.exports = main;
