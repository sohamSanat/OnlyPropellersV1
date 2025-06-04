// master.js
const main = require('./index'); // Assuming index.js is in the same directory
const readline = require('readline'); // Not strictly needed for web, but kept for clarity
const puppeteer = require('puppeteer');
const config = require('./config/config'); // Ensure config.js is in the parent directory

async function checkNumberOfPages(ofModel, io) {
    io.emit('progress_update', { message: 'Starting to check approximate total posts for the model...' });
    const browser = await puppeteer.launch({ headless: config.headless });
    const page = await browser.newPage();

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

async function runMasterScript(ofModel, io) {
    if (!ofModel) {
        io.emit('progress_update', { type: 'error', message: 'Model username is required for scraping.' });
        return;
    }

    io.emit('progress_update', { message: `Starting scraping for OF Model: ${ofModel}` });

    const totalEstimatedPosts = await checkNumberOfPages(ofModel, io);
    // --- NEW LOG FOR DEBUGGING ---
    console.log(`DEBUG: Total estimated posts returned by checkNumberOfPages: ${totalEstimatedPosts}`);
    io.emit('progress_update', { message: `Estimated total posts for ${ofModel}: ${totalEstimatedPosts}` });

    // --- Emit estimated_time_info to frontend ---
    io.emit('estimated_time_info', { totalEstimatedPosts: totalEstimatedPosts });

    let totalScrapedCount = 0;
    const CHUNK_SIZE = 100; // Represents the chunk size handled by a single call to index.js

    while (totalScrapedCount < totalEstimatedPosts) {
        const currentStartOffset = totalScrapedCount;

        io.emit('progress_update', { message: `\n--- Starting scraping for chunk at offset: ?o=${currentStartOffset} ---` });
        io.emit('progress_update', { message: `Total posts scraped so far: ${totalScrapedCount}` });
        
        // --- IMPORTANT: Pass the 'io' object to the 'main' (index.js) function ---
        const postsScrapedInThisChunk = await main(ofModel, currentStartOffset, io); // Pass io here

        console.log(`DEBUG: index.js returned ${postsScrapedInThisChunk} posts for chunk starting at offset ${currentStartOffset}`);

        if (postsScrapedInThisChunk === 0 && totalScrapedCount > 0) {
            io.emit('progress_update', { message: "index.js scraped 0 posts in this chunk. Likely no more posts or an issue occurred. Stopping." });
            break;
        }
        
        if (postsScrapedInThisChunk === 0 && totalScrapedCount === 0) {
            io.emit('progress_update', { type: 'warning', message: `No posts found for model "${ofModel}" at any offset. Please check the username.` });
            break;
        }

        totalScrapedCount += postsScrapedInThisChunk;

        io.emit('progress_update', { message: `--- Finished chunk. Posts scraped in this chunk: ${postsScrapedInThisChunk}. New total: ${totalScrapedCount} ---` });
        
        // Only wait if there are more posts to scrape
        if (totalScrapedCount < totalEstimatedPosts) {
            io.emit('progress_update', { message: 'Waiting 10 seconds before starting next chunk to reduce bot detection risk...' });
            await new Promise(resolve => setTimeout(resolve, 10000)); 
        }
    }

    io.emit('scrape_complete', { message: `\n--- SCRAPING COMPLETED ---` });
    io.emit('scrape_complete', { message: `Total posts scraped for ${ofModel}: ${totalScrapedCount}` });
}

module.exports = runMasterScript;