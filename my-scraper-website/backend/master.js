// master.js
const puppeteer = require('puppeteer');
const main = require('./index'); // The main scraping logic for a chunk
const config = require('./config/config');
const axios = require('axios');
const cloudinary = require('./cloudinaryConfig');
const { scrapePostLinks } = require('./scraper'); // Import only what's needed from scraper

// checkNumberOfPages now accepts a 'browser' instance
async function checkNumberOfPages(ofModel, browser) { // Added 'browser' here
    console.log(`[Master Debug] checkNumberOfPages: Using provided browser for total post estimation for ${ofModel}...`);
    let page;
    try {
        page = await browser.newPage(); // Create a new page from the existing browser
        page.setDefaultNavigationTimeout(90000);

        const targetUrl = `https://coomer.su/onlyfans/user/${ofModel}`;
        console.log(`[Master Debug] checkNumberOfPages: Navigating to ${targetUrl} for pagination check.`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log(`[Master Debug] checkNumberOfPages: Page loaded. Attempting to find pagination elements.`);

        const totalEstimatedPosts = await page.evaluate(() => {
            let maxOffset = 0;
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

            if (maxOffset === 0) {
                const postsOnFirstPage = document.querySelectorAll('.card-list__items .card').length;
                console.log(`[Page Evaluate] No 'o' offsets found. Posts on first page: ${postsOnFirstPage}.`);
                return postsOnFirstPage > 0 ? 50 : 0;
            }

            return maxOffset + 50;
        });

        console.log(`[Master Debug] checkNumberOfPages: Final estimated total posts: ${totalEstimatedPosts}`);
        return totalEstimatedPosts;

    } catch (error) {
        console.error(`[Master Error] checkNumberOfPages: Failed to estimate total posts for ${ofModel}:`, error.message);
        return 500;
    } finally {
        if (page) {
            await page.close(); // Close the page, but not the browser
            console.log(`[Master Debug] checkNumberOfPages: Page closed for estimation.`);
        }
    }
}

async function runMasterScript(ofModel, socketId, io) {
    console.log(`[Master Debug] runMasterScript: Starting for model ${ofModel}, socket ID ${socketId}`);
    let totalScrapedCount = 0;
    let browser; // Declare browser here, will be launched once

    io.to(socketId).emit('progress_update', { message: `Launching browser for ${ofModel}...` });
    console.log(`[Master Debug] runMasterScript: Launching single Puppeteer browser instance.`);

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-video-decode',
                '--no-zygote',
                '--single-process'
            ]
        });
        console.log(`[Master Debug] runMasterScript: Browser launched successfully.`);

        io.to(socketId).emit('progress_update', { message: `Estimating total posts for ${ofModel}...` });
        // Pass the launched browser instance to checkNumberOfPages
        const totalEstimatedPosts = await checkNumberOfPages(ofModel, browser);
        io.to(socketId).emit('estimated_time_info', { totalEstimatedPosts: totalEstimatedPosts });
        io.to(socketId).emit('progress_update', { message: `Estimated ${totalEstimatedPosts} posts. Starting scraping process.` });

        console.log(`[Master Debug] runMasterScript: Initial Estimated Posts: ${totalEstimatedPosts}`);

        let consecutiveZeroChunks = 0;

        while (true) {
            const currentStartOffset = totalScrapedCount;
            io.to(socketId).emit('progress_update', { message: `Calling index.js to scrape chunk starting at offset ${currentStartOffset}...` });
            console.log(`[Master Debug] runMasterScript: Total scraped count before chunk: ${totalScrapedCount}. Current offset for index.js: ${currentStartOffset}`);

            let postsScrapedInThisChunk = 0;
            try {
                // Pass the browser instance to index.js's main function
                postsScrapedInThisChunk = await main(ofModel, currentStartOffset, io, cloudinary, axios, browser);
            } catch (e) {
                console.error(`[Master Error] runMasterScript: Error during index.js main call for offset ${currentStartOffset}:`, e.message);
                io.to(socketId).emit('scrape_error', { message: `Backend error during scraping chunk ${currentStartOffset}: ${e.message}` });
                consecutiveZeroChunks++;
                // Do not break immediately here. Allow consecutiveZeroChunks to trigger a break.
                // This makes it more resilient to transient errors in a single chunk.
            }

            console.log(`[Master Debug] runMasterScript: index.js returned ${postsScrapedInThisChunk} posts for chunk starting at ${currentStartOffset}`);

            if (postsScrapedInThisChunk === 0) {
                consecutiveZeroChunks++;
                console.log(`[Master Debug] runMasterScript: postsScrapedInThisChunk is 0. Consecutive zero chunks: ${consecutiveZeroChunks}`);
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

            if (totalEstimatedPosts > 0 && totalScrapedCount >= totalEstimatedPosts) {
                console.log(`[Master Debug] runMasterScript: Total scraped count (${totalScrapedCount}) >= Estimated posts (${totalEstimatedPosts}). Breaking loop.`);
                io.to(socketId).emit('progress_update', { message: `Scraped ${totalScrapedCount} posts, reaching or exceeding the estimated ${totalEstimatedPosts} posts. Stopping.` });
                break;
            }

            io.to(socketId).emit('progress_update', { message: "Pausing for 10 seconds before next chunk..." });
            await new Promise(resolve => setTimeout(resolve, 10000));
            console.log(`[Master Debug] runMasterScript: Delay for next chunk finished.`);
        }

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
