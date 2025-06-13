// index.js
const { scrapePostLinks, scrapeImagesFromPost } = require('./scraper');
const config = require('./config/config');
const cloudinary = require('./cloudinaryConfig');
const axios = require('axios');

// The main function now accepts 'browser' as it will be launched and managed by master.js
async function main(ofModel, startOffset, io, cloudinary, axios, browser) { // Added 'browser' here
    let postsProcessedInThisChunk = 0; // Tracks posts for which content was attempted
    const MAX_POSTS_PER_CHUNK = 10; // <<<< CRITICAL CHANGE: REDUCED CHUNK SIZE FOR OOM FIX <<<<

    io.emit('progress_update', { message: `[Chunk ${startOffset}] Using existing browser session for ${ofModel}...` });
    console.log(`[Index Debug] Chunk ${startOffset}: Using provided browser instance.`);

    let page; // Declare page here, will be created and closed per chunk
    try {
        page = await browser.newPage(); // Create a new page from the existing browser instance
        page.setDefaultNavigationTimeout(120000); // Increased default timeout to 120 seconds (2 minutes)
        console.log(`[Index Debug] Chunk ${startOffset}: New page opened from browser.`);

        let currentOffset = startOffset;

        // Loop to get pages, but constrained by MAX_POSTS_PER_CHUNK
        // If MAX_POSTS_PER_CHUNK is 10, this loop will run at most twice (50 posts/page),
        // but the inner loop will break after 10 posts.
        for (let page_chunk_iteration = 0; page_chunk_iteration < Math.ceil(MAX_POSTS_PER_CHUNK / 50) || 1; page_chunk_iteration++) {
            if (postsProcessedInThisChunk >= MAX_POSTS_PER_CHUNK) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_CHUNK}).` });
                console.log(`[Index Debug] Chunk ${startOffset}: Max posts reached for this main() call. Breaking.`);
                break;
            }

            const currentTargetUrl = `https://coomer.su/onlyfans/user/${ofModel}?o=${currentOffset}`;
            io.emit('progress_update', { message: `[Chunk ${startOffset}] Scraping post links from: ${currentTargetUrl}` });
            console.log(`[Index Debug] Chunk ${startOffset}: Scraping post links from: ${currentTargetUrl}`);

            if (page_chunk_iteration > 0) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Waiting 3 seconds before loading next page chunk...` });
                console.log(`[Index Debug] Chunk ${startOffset}: Delaying for next page chunk.`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // Pass the 'page' object to scraper.js functions
            const postLinks = await scrapePostLinks(page, currentTargetUrl);

            if (!postLinks || postLinks.length === 0) {
                io.emit('progress_update', { message: `[Chunk ${startOffset}] No more post links found on ${currentTargetUrl}. Stopping this chunk.` });
                console.log(`[Index Debug] Chunk ${startOffset}: No more post links found. Breaking.`);
                break;
            }

            io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${postLinks.length} post links on this page (offset: ${currentOffset}).` });
            console.log(`[Index Debug] Chunk ${startOffset}: Found ${postLinks.length} post links.`);

            for (const postLink of postLinks) {
                if (postsProcessedInThisChunk >= MAX_POSTS_PER_CHUNK) {
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Reached maximum posts for this run (${MAX_POSTS_PER_CHUNK}). Exiting post loop.` });
                    console.log(`[Index Debug] Chunk ${startOffset}: Max posts reached within post loop. Breaking.`);
                    break;
                }

                io.emit('progress_update', { message: `[Chunk ${startOffset}] Entering post: ${postLink}` });
                console.log(`[Index Debug] Chunk ${startOffset}: Processing post: ${postLink}`);

                let imageUrls = [];
                try {
                    // Pass the 'page' object to scrapeImagesFromPost
                    imageUrls = await scrapeImagesFromPost(page, postLink);
                    io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${imageUrls.length} images/videos in post.` });
                    console.log(`[Index Debug] Chunk ${startOffset}: Found ${imageUrls.length} media items in post.`);
                } catch (scrapeError) {
                    console.error(`[Index Error] Chunk ${startOffset}: Error scraping images from post ${postLink}:`, scrapeError.message);
                    io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to scrape images from post ${postLink}: ${scrapeError.message}` });
                }

                postsProcessedInThisChunk++; // Increment for each post visited

                for (let i = 0; i < imageUrls.length; i++) {
                    const imageUrl = imageUrls[i];
                    let mediaBuffer = null;

                    try {
                        const filename = new URL(imageUrl).pathname.split('/').pop();
                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Processing media: ${filename} from ${imageUrl}` });
                        console.log(`[Index Debug] Chunk ${startOffset}: Downloading and uploading media: ${filename}`);

                        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
                        mediaBuffer = Buffer.from(response.data);
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
                        console.log(`[Index Debug] Chunk ${startOffset}: Media uploaded: ${uploadResult.secure_url}`);
                        io.emit('image_scraped', {
                            imageUrl: uploadResult.secure_url,
                            modelName: ofModel,
                            originalUrl: imageUrl,
                        });

                    } catch (uploadError) {
                        console.error(`[Index Error] Chunk ${startOffset}: Error processing media ${imageUrl}:`, uploadError.message);
                        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to process media ${imageUrl}: ${uploadError.message}` });
                    } finally {
                        mediaBuffer = null;
                        if (global.gc) {
                            try {
                                global.gc();
                                console.log(`[Index Debug] Chunk ${startOffset}: Global GC called.`);
                            } catch (gcErr) {
                                console.warn(`[Index Debug] Error calling global.gc(): ${gcErr.message}`);
                            }
                        }
                    }

                    // Add a short delay between processing each individual image/video
                    if (i < imageUrls.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        console.log(`[Index Debug] Chunk ${startOffset}: Short delay after media processing.`);
                    }
                }
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Posts processed in current chunk: ${postsProcessedInThisChunk}` });
            }
            currentOffset += 50;
        }
    } catch (error) {
        console.error(`[Index Error] Chunk ${startOffset}: An unhandled error occurred during scraping:`, error.message);
        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] An error occurred during scraping: ${error.message}` });
        throw error;
    } finally {
        if (page) {
            await page.close();
            console.log(`[Index Debug] Chunk ${startOffset}: Page closed.`);
        }
    }

    return postsProcessedInThisChunk;
}

module.exports = main;
