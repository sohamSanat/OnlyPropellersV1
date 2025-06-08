// master.js
const puppeteer = require('puppeteer');
const main = require('./index'); // The main scraping logic for a chunk
const config = require('./config/config');
const axios = require('axios');
const cloudinary = require('./cloudinaryConfig');


// checkNumberOfPages now accepts a 'browser' instance
async function checkNumberOfPages(ofModel, browser) { // Added 'browser' here
    console.log(`[Master Debug] checkNumberOfPages: Using provided browser for total post estimation for ${ofModel}...`);
    let page;
    try {
        page = await browser.newPage(); // Create a new page from the existing browser
        page.setDefaultNavigationTimeout(90000); // 90 seconds

        const targetUrl = `https://coomer.su/onlyfans/user/${ofModel}`;
        console.log(`[Master Debug] checkNumberOfPages: Navigating to ${targetUrl} for pagination check.`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Additional delay for dynamic content to load

        console.log(`[Master Debug] checkNumberOfPages: Page loaded. Attempting to find pagination elements.`);

        const totalEstimatedPosts = await page.evaluate(() => {
            let maxOffset = 0;
            // Select all pagination links that have a numerical value for 'o' parameter
            // and are generally part of pagination controls (e.g., in a menu or direct page links)
            const paginationLinks = Array.from(document.querySelectorAll('menu a[href*="/onlyfans/user/"], .pagination .page-item a.page-link'));

            console.log(`[Page Evaluate] Found ${paginationLinks.length} potential pagination links.`);

            paginationLinks.forEach(link => {
                const url = new URL(link.href);
                const offsetStr = url.searchParams.get('o');
                if (offsetStr) {
                    const offset = parseInt(offsetStr, 10);
                    if (!isNaN(offset) && offset > maxOffset) {
                        maxOffset = offset;
                    }
                }
            });

            // If no explicit pagination links with 'o' parameter are found,
            // check if there are any posts on the first page.
            // If so, assume at least 50 posts (the content of the first page).
            // Otherwise, if no posts and no pagination, assume 0.
            if (maxOffset === 0) {
                const postsOnFirstPage = document.querySelectorAll('.card-list__items .card').length;
                console.log(`[Page Evaluate] No 'o' offsets found. Posts on first page: ${postsOnFirstPage}.`);
                return postsOnFirstPage > 0 ? 50 : 0; // Assume 50 if content exists on first page, else 0
            }

            // Coomer.su typically shows 50 posts per page. The 'o' parameter is the offset of the first post.
            // So, if the highest offset is X, it means there's a page starting at X.
            // The total number of posts would then be X + 50 (for the content on that last page).
            return maxOffset + 50;
        });

        console.log(`[Master Debug] checkNumberOfPages: Final estimated total posts: ${totalEstimatedPosts}`);
        return totalEstimatedPosts;

    } catch (error) {
        console.error(`[Master Error] checkNumberOfPages: Failed to estimate total posts for ${ofModel}:`, error.message);
        // Fallback to a reasonable default if estimation fails (e.g., 50 for a single page, or a higher number like 500)
        return 500; // Increased default to encourage more scraping if estimation fails
    } finally {
        if (page) {
            await page.close(); // Close the page, but not the browser
            console.log(`[Master Debug] checkNumberOfPages: Page closed for estimation.`);
        }
    }
}

async function runMasterScript(ofModel, socketId, io) {
    console.log(`[Master Debug] runMasterScript: Starting for model ${ofModel}, socket ID ${socketId}`);
    let totalScrapedCount = 0; // This will track the total number of posts scraped across all chunks
    let browser; // Declare browser here, will be launched once for the entire scrape

    io.to(socketId).emit('progress_update', { message: `Launching browser for ${ofModel}...` });
    console.log(`[Master Debug] runMasterScript: Launching single Puppeteer browser instance.`);

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
        console.log(`[Master Debug] runMasterScript: Browser launched successfully.`);

        io.to(socketId).emit('progress_update', { message: `Estimating total posts for ${ofModel}...` });
        // Pass the launched browser instance to checkNumberOfPages
        const totalEstimatedPosts = await checkNumberOfPages(ofModel, browser);
        io.to(socketId).emit('estimated_time_info', { totalEstimatedPosts: totalEstimatedPosts });
        io.to(socketId).emit('progress_update', { message: `Estimated ${totalEstimatedPosts} posts. Starting scraping process.` });

        console.log(`[Master Debug] runMasterScript: Initial Estimated Posts: ${totalEstimatedPosts}`);

        let consecutiveZeroChunks = 0; // Counter for consecutive chunks returning 0 posts

        // Ensure we loop at least once, even if estimate is 0 (e.g., if we defaulted to 0 posts)
        while (true) {
            const currentStartOffset = totalScrapedCount;
            io.to(socketId).emit('progress_update', { message: `Calling index.js to scrape chunk starting at offset ${currentStartOffset}...` });
            console.log(`[Master Debug] runMasterScript: Total scraped count before chunk: ${totalScrapedCount}. Current offset for index.js: ${currentStartOffset}`);

            let postsScrapedInThisChunk = 0;
            try {
                // Pass the browser instance to index.js's main function
                postsScrapedInThisChunk = await main(ofModel, currentStartOffset, io, cloudinary, axios, browser); // Pass browser
            } catch (e) {
                console.error(`[Master Error] runMasterScript: Error during index.js main call for offset ${currentStartOffset}:`, e.message);
                io.to(socketId).emit('scrape_error', { message: `Backend error during scraping chunk ${currentStartOffset}: ${e.message}. Attempting to continue.` });
                consecutiveZeroChunks++; // Treat a chunk failure as effectively 0 posts for this chunk
                // Do NOT break immediately here. Allow consecutiveZeroChunks to trigger a break.
                // This makes it more resilient to transient errors in a single chunk.
            }

            console.log(`[Master Debug] runMasterScript: index.js returned ${postsScrapedInThisChunk} posts for chunk starting at ${currentStartOffset}`);

            // Logic to handle chunk results
            if (postsScrapedInThisChunk === 0) {
                consecutiveZeroChunks++;
                console.log(`[Master Debug] runMasterScript: postsScrapedInThisChunk is 0. Consecutive zero chunks: ${consecutiveZeroChunks}`);
                // If we get 3 consecutive chunks with 0 posts, it's a strong signal for end of content or a consistent block
                if (consecutiveZeroChunks >= 3) {
                    io.to(socketId).emit('progress_update', { message: `Received ${consecutiveZeroChunks} consecutive empty chunks. Assuming end of content or persistent block. Stopping.` });
                    break;
                }
            } else {
                consecutiveZeroChunks = 0; // Reset counter if posts were found
                totalScrapedCount += postsScrapedInThisChunk;
                io.to(socketId).emit('progress_update', { message: `Total posts scraped so far: ${totalScrapedCount}` });
                console.log(`[Master Debug] runMasterScript: Total scraped count updated to: ${totalScrapedCount}`);
            }

            // Condition 2: If we have scraped enough posts (reached or exceeded estimated total)
            // This break ensures we don't go infinitely if estimate is initially good or was defaulted
            if (totalEstimatedPosts > 0 && totalScrapedCount >= totalEstimatedPosts) {
                console.log(`[Master Debug] runMasterScript: Total scraped count (${totalScrapedCount}) >= Estimated posts (${totalEstimatedPosts}). Breaking loop.`);
                io.to(socketId).emit('progress_update', { message: `Scraped ${totalScrapedCount} posts, reaching or exceeding the estimated ${totalEstimatedPosts} posts. Stopping.` });
                break;
            }

            // Also break if totalScrapedCount has not increased for a while and we're not getting new content
            // This implicitly handled by consecutiveZeroChunks, but good to keep in mind.

            // Add a delay between chunks to avoid overwhelming the server or being detected
            io.to(socketId).emit('progress_update', { message: "Pausing for 10 seconds before next chunk..." });
            await new Promise(resolve => setTimeout(resolve, 10000));
            console.log(`[Master Debug] runMasterScript: Delay for next chunk finished.`);
        }

        // This code is executed only AFTER the while loop has broken
        console.log(`[Master Debug] runMasterScript: While loop finished. Emitting scrape_complete.`);
        io.to(socketId).emit('scrape_complete', { message: `Scraping for ${ofModel} completed! Total posts processed: ${totalScrapedCount}.` });

    } catch (error) {
        console.error(`[Master Error] runMasterScript: Top-level error in master script for ${ofModel}:`, error.message);
        io.to(socketId).emit('scrape_error', { message: `Fatal backend error during scraping: ${error.message}` });
    } finally {
        if (browser) {
            await browser.close(); // Close the single browser instance at the very end
            console.log(`[Master Debug] runMasterScript: Master browser instance closed.`);
        }
    }
}

module.exports = { runMasterScript };
