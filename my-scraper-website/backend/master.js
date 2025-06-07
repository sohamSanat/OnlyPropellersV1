// master.js
const main = require('./index'); // Assuming index.js is in the same directory
// const readline = require('readline'); // Not strictly needed for web, but kept for clarity
const puppeteer = require('puppeteer');
const config = require('./config/config'); // Ensure config.js is in the parent directory
const axios = require('axios'); // ADD THIS LINE for downloading images
const cloudinary = require('./cloudinaryConfig'); // ADD THIS LINE for Cloudinary config

// Function to check number of pages/total estimated posts
async function checkNumberOfPages(ofModel, io) { // 'io' is clientSocket
    io.emit('progress_update', { message: 'Starting to check approximate total posts for the model...' });
    const browser = await puppeteer.launch({
        headless: 'new', // Use 'new' for the latest headless mode
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '' // No more specific puppeteer args here to avoid conflicts if you had them
        ]
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000); // 60 seconds timeout for navigation

    page.on('console', msg => {
        console.log(`PUPPETEER PAGE LOG: ${msg.text()}`);
    });

    try {
        const targetUrl = `https://coomer.su/onlyfans/user/${ofModel}`;
        io.emit('progress_update', { message: `Navigating to ${targetUrl} to check post count.` });
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('.card-list__items', { timeout: 60000 });
        io.emit('progress_update', { message: 'Main content loaded. Checking for pagination links...' });

        const maxOffset = await page.evaluate(() => {
            console.log('--- Puppeteer Page Evaluation for Pagination ---');
            const anchorTags = document.querySelectorAll('menu a[href*="/onlyfans/user/"]');
            console.log(`Found ${anchorTags.length} pagination links with href containing "/onlyfans/user/".`);

            let highestOffset = 0;
            // Iterate through all found links to find the highest numerical offset
            anchorTags.forEach(link => {
                const href = link.href;
                const numberMatch = href.match(/\?o=(\d+)/);
                if (numberMatch) {
                    const offset = parseInt(numberMatch[1], 10);
                    // Only consider if the text content is a number (to exclude <, >, etc.)
                    if (!isNaN(parseInt(link.textContent))) {
                        if (offset > highestOffset) {
                            highestOffset = offset;
                            console.log(`Found new highest numerical offset: ${highestOffset} from link: ${link.textContent} (${href})`);
                        }
                    }
                }
            });

            if (highestOffset === 0) {
                // If no numerical offsets found (e.g., only one page or no specific pagination),
                // check if any posts are visible on the page to assume at least 50.
                const postsOnPage = document.querySelectorAll('.card-list__items .card').length;
                if (postsOnPage > 0) {
                    console.log(`No explicit pagination links found, but ${postsOnPage} posts are visible. Assuming base offset 0.`);
                    return 0; // Means only the first page is visible or no pagination numbers
                } else {
                    console.log('No posts found and no pagination links. Estimated 0 posts.');
                    return 0; // Truly no posts
                }
            }
            console.log(`Final highest numerical offset found: ${highestOffset}`);
            console.log('------------------------------------------');
            return highestOffset;
        });

        // Coomer.su displays 50 posts per page.
        // The ?o=X parameter is the offset of the FIRST post on that page.
        // So, if the last page's offset is `maxOffset`, the total posts would be `maxOffset + 50`.
        const totalEstimatedPosts = maxOffset + 50;
        io.emit('progress_update', { message: `Found estimated total posts: ${totalEstimatedPosts}` });
        return totalEstimatedPosts;
    } catch (error) {
        io.emit('progress_update', { type: 'error', message: `Error checking number of pages/total posts: ${error.message}. Returning default 50.` });
        return 50; // Default to 50 if an error occurs during estimation
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Main function to run the scraping process
async function runMasterScript(ofModel, io) { // 'io' here is clientSocket
    if (!ofModel) {
        io.emit('progress_update', { type: 'error', message: 'Model username is required for scraping.' });
        return;
    }

    io.emit('progress_update', { message: `Starting scraping for OF Model: ${ofModel}` });

    const totalEstimatedPosts = await checkNumberOfPages(ofModel, io);
    console.log(`DEBUG: Total estimated posts returned by checkNumberOfPages: ${totalEstimatedPosts}`);
    io.emit('progress_update', { message: `Estimated total posts for ${ofModel}: ${totalEstimatedPosts}` });

    io.emit('estimated_time_info', { totalEstimatedPosts: totalEstimatedPosts });

    let totalScrapedCount = 0;

    // --- REVISED LOOP TERMINATION LOGIC ---
    while (true) { // Loop indefinitely until an explicit break condition is met
        const currentStartOffset = totalScrapedCount;

        io.emit('progress_update', { message: `\n--- Starting scraping for chunk at offset: ?o=${currentStartOffset} ---` });
        io.emit('progress_update', { message: `Total posts scraped so far: ${totalScrapedCount}` });

        // Call index.js to scrape a chunk (up to 100 posts per call)
        const postsScrapedInThisChunk = await main(ofModel, currentStartOffset, io, cloudinary, axios);

        console.log(`DEBUG: index.js returned ${postsScrapedInThisChunk} posts for chunk starting at offset ${currentStartOffset}`);

        // Condition 1: If no posts were found in this chunk
        if (postsScrapedInThisChunk === 0) {
            // Case A: No posts found at all (first page or model has no content)
            if (totalScrapedCount === 0) {
                io.emit('progress_update', { type: 'warning', message: `No posts found for model "${ofModel}" at any offset. Please check the username.` });
            } else {
                // Case B: No posts found on a subsequent page, implying end of content
                io.emit('progress_update', { message: "No more new posts found in this chunk. Assuming scraping is complete." });
            }
            break; // Exit the loop: no new content means we're done
        }

        totalScrapedCount += postsScrapedInThisChunk;

        io.emit('progress_update', { message: `--- Finished chunk. Posts scraped in this chunk: ${postsScrapedInThisChunk}. New total: ${totalScrapedCount} ---` });

        // Condition 2: If we have scraped all or more than the estimated posts, we should stop
        if (totalScrapedCount >= totalEstimatedPosts) {
            io.emit('progress_update', { message: `Scraped ${totalScrapedCount} posts, reaching or exceeding the estimated ${totalEstimatedPosts} posts. Stopping.` });
            break; // Exit the loop when estimate is met or exceeded
        }

        // Optional: Add a delay between chunks to reduce bot detection risk
        io.emit('progress_update', { message: 'Waiting 10 seconds before starting next chunk to reduce bot detection risk...' });
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // --- EMIT scrape_complete HERE, AFTER THE WHILE LOOP HAS NATURALLY FINISHED ---
    io.emit('scrape_complete', { message: `Scraping for ${ofModel} completed! Total posts processed: ${totalScrapedCount}.` });
    // Removed the duplicate scrape_complete emission
}

module.exports = runMasterScript;
