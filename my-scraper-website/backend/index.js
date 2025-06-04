// index.js
const puppeteer = require('puppeteer');
const { scrapePostLinks, downloadImage, scrapeImagesFromPost } = require('./scraper');
const config = require('./config/config');
const fs = require('fs');
const path = require('path');

// This function will now take the initial offset for the URL.
// It will scrape up to 100 posts (2 pages) per call.
// It now ACCEPTS an 'io' (socket) object for real-time updates.
async function main(ofModel, startOffset, io) { // Added 'io' here
    let POSTS_SCRAPED_IN_THIS_RUN = 0; // Track posts scraped in *this specific run*
    const MAX_POSTS_PER_RUN = 100; // Limit to 100 posts per index.js execution

    // Use io.emit directly now for progress updates
    io.emit('progress_update', { message: `[Chunk ${startOffset}] Starting new browser session for ${ofModel}...` });

    let browser; // Declare browser outside try for finally block access
    try {
        browser = await puppeteer.launch({ headless: config.headless });
        const page = await browser.newPage();

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
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Found ${imageUrls.length} images in post.` });

                for (const imageUrl of imageUrls) {
                    try {
                        const filename = path.basename(new URL(imageUrl).pathname);
                        const downloadPath = path.join(filename);
                        // downloadImage itself logs messages. If it needs to emit to frontend,
                        // you would need to modify `scraper.js` to accept `io` and pass it here.
                        await downloadImage(imageUrl, downloadPath, ofModel);
                        io.emit('progress_update', { message: `[Chunk ${startOffset}] Downloaded: ${filename}` });
                    } catch (error) {
                        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] Failed to download ${imageUrl}: ${error.message}` });
                    }
                }
                POSTS_SCRAPED_IN_THIS_RUN++;
                io.emit('progress_update', { message: `[Chunk ${startOffset}] Posts scraped in current run: ${POSTS_SCRAPED_IN_THIS_RUN}` });
            }
            currentOffset += 50; // Increment the offset for the next 50 posts (next page)
        }
    } catch (error) {
        io.emit('progress_update', { type: 'error', message: `[Chunk ${startOffset}] An error occurred during scraping: ${error.message}` });
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

// Since master.js is importing this file as a module, the `if (require.main === module)` block
// is no longer necessary and should be removed or commented out to avoid confusion.
/*
if (require.main === module) {
    // Retrieve arguments passed from the command line
    const ofModel = process.argv[2]; // First argument after script name (e.g., 'node index.js modelName')
    const startOffset = parseInt(process.argv[3], 10); // Second argument

    if (!ofModel || isNaN(startOffset)) {
        sendProgress('error', 'Usage: node index.js <ofModel> <startOffset>');
        process.exit(1); // Exit with error if arguments are missing
    }

    main(ofModel, startOffset)
        .then(() => process.exit(0)) // Exit successfully
        .catch(err => {
            sendProgress('error', `Unhandled error in index.js child process: ${err.message}`);
            process.exit(1); // Exit with error if an unhandled exception occurs
        });
} else {
    // If index.js is imported as a module (e.g., for local testing or old master.js)
    module.exports = main;
}
*/
module.exports = main; // Ensure this is present and uncommented