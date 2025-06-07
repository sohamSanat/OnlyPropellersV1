// master.js
const puppeteer = require('puppeteer');
const main = require('./index'); // The main scraping logic for a chunk
const config = require('./config/config');
const axios = require('axios');
const cloudinary = require('./cloudinaryConfig');


async function checkNumberOfPages(ofModel) {
    console.log(`[Master Debug] checkNumberOfPages: Estimating total posts for ${ofModel}...`);
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

        await page.goto(`https://coomer.su/onlyfans/user/${ofModel}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log(`[Master Debug] checkNumberOfPages: Page loaded for estimation.`);

        const paginationLinks = await page.$$eval('.pagination .page-item a.page-link', (links) => {
            const offsets = links
                .map(link => {
                    const url = new URL(link.href);
                    return parseInt(url.searchParams.get('o'), 10);
                })
                .filter(offset => !isNaN(offset)); // Filter out NaN values
            return offsets;
        });

        let maxOffset = 0;
        if (paginationLinks.length > 0) {
            maxOffset = Math.max(...paginationLinks);
            console.log(`[Master Debug] checkNumberOfPages: Found max pagination offset: ${maxOffset}`);
        } else {
            console.log(`[Master Debug] checkNumberOfPages: No pagination links found. Assuming single page or first 50 posts.`);
        }

        // Return a slightly higher estimate than the last page's offset
        // Assuming 50 posts per page, add 50 to cover the last page's content
        const estimated = maxOffset + 50;
        console.log(`[Master Debug] checkNumberOfPages: Estimated total posts: ${estimated}`);
        return estimated;
    } catch (error) {
        console.error(`[Master Error] checkNumberOfPages: Error checking number of pages for ${ofModel}:`, error.message);
        return 50; // Default to 50 if an error occurs to at least scrape the first page
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[Master Debug] checkNumberOfPages: Browser closed for estimation.`);
        }
    }
}

async function runMasterScript(ofModel, socketId, io) {
    console.log(`[Master Debug] runMasterScript: Starting for model ${ofModel}, socket ID ${socketId}`);
    let totalScrapedCount = 0; // This will track the total number of posts scraped across all chunks

    io.to(socketId).emit('progress_update', { message: `Estimating total posts for ${ofModel}...` });

    const totalEstimatedPosts = await checkNumberOfPages(ofModel);
    io.to(socketId).emit('estimated_time_info', { totalEstimatedPosts: totalEstimatedPosts });
    io.to(socketId).emit('progress_update', { message: `Estimated ${totalEstimatedPosts} posts. Starting scraping process.` });

    console.log(`[Master Debug] runMasterScript: Initial Estimated Posts: ${totalEstimatedPosts}`);

    while (true) { // Loop indefinitely until an explicit break condition is met
        const currentStartOffset = totalScrapedCount;
        io.to(socketId).emit('progress_update', { message: `Calling index.js to scrape chunk starting at offset ${currentStartOffset}...` });
        console.log(`[Master Debug] runMasterScript: Total scraped count before chunk: ${totalScrapedCount}. Current offset for index.js: ${currentStartOffset}`);

        // Call index.js to scrape a chunk (up to 100 posts per call)
        let postsScrapedInThisChunk = 0;
        try {
            postsScrapedInThisChunk = await main(ofModel, currentStartOffset, io, cloudinary, axios);
        } catch (e) {
            console.error(`[Master Error] runMasterScript: Error during index.js main call for offset ${currentStartOffset}:`, e.message);
            io.to(socketId).emit('scrape_error', { message: `Backend error during scraping chunk ${currentStartOffset}: ${e.message}` });
            break; // Break on critical error
        }


        console.log(`[Master Debug] runMasterScript: index.js returned ${postsScrapedInThisChunk} posts for chunk starting at ${currentStartOffset}`);

        // Condition 1: If no posts were found in this chunk
        if (postsScrapedInThisChunk === 0) {
            console.log(`[Master Debug] runMasterScript: postsScrapedInThisChunk is 0.`);
            // Case A: No posts found at all (first page or model has no content)
            if (totalScrapedCount === 0) {
                io.to(socketId).emit('progress_update', { type: 'warning', message: `No posts found for model "${ofModel}" at any offset. Please check the username.` });
            } else {
                // Case B: No posts found on a subsequent page, implying end of content
                io.to(socketId).emit('progress_update', { message: "No more new posts found in this chunk. Assuming scraping is complete." });
            }
            break; // Exit the loop: no new content means we're done
        }

        totalScrapedCount += postsScrapedInThisChunk;
        io.to(socketId).emit('progress_update', { message: `Total posts scraped so far: ${totalScrapedCount}` });
        console.log(`[Master Debug] runMasterScript: Total scraped count updated to: ${totalScrapedCount}`);

        // Condition 2: If we have scraped enough posts (reached or exceeded estimated total)
        if (totalScrapedCount >= totalEstimatedPosts) {
            console.log(`[Master Debug] runMasterScript: Total scraped count (${totalScrapedCount}) >= Estimated posts (${totalEstimatedPosts}). Breaking loop.`);
            io.to(socketId).emit('progress_update', { message: `Scraped ${totalScrapedCount} posts, reaching or exceeding the estimated ${totalEstimatedPosts} posts. Stopping.` });
            break; // Exit the loop: we've scraped all estimated content
        }

        // Add a delay between chunks to avoid overwhelming the server or being detected
        io.to(socketId).emit('progress_update', { message: "Pausing for 10 seconds before next chunk..." });
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.log(`[Master Debug] runMasterScript: Delay for next chunk finished.`);
    }

    // This code is executed only AFTER the while loop has broken
    console.log(`[Master Debug] runMasterScript: While loop finished. Emitting scrape_complete.`);
    io.to(socketId).emit('scrape_complete', { message: `Scraping for ${ofModel} completed! Total posts processed: ${totalScrapedCount}.` });
}

module.exports = { runMasterScript };
