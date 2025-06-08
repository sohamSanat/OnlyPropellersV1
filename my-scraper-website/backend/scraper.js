// scraper.js
// Removed puppeteer import as it's now passed from master.js and index.js
const config = require('./config/config'); // Ensure config.js is accessible


async function scrapePostLinks(page, url) {
    console.log(`[Scraper Debug] scrapePostLinks: Using provided page to navigate to ${url}`);
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }); // Increased timeout to 90 seconds
        console.log(`[Scraper Debug] scrapePostLinks: Page loaded for ${url}.`);

        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased from 500ms to 1500ms

        await page.waitForSelector('.card-list__items', { timeout: 60000 }); // Still 60s for selector
        console.log(`[Scraper Debug] scrapePostLinks: .card-list__items selector found.`);

        const postLinks = await page.$$eval('.card-list__items article.post-card.post-card--preview a[href*="/post/"]', (links) => {
            const extractedLinks = links.map((link) => link.href);
            console.log(`[Page Evaluate] Found ${extractedLinks.length} potential post links.`); // This logs in Puppeteer's console
            return extractedLinks;
        });

        console.log(`[Scraper Debug] scrapePostLinks: Extracted ${postLinks.length} post links from ${url}`);
        return postLinks;
    } catch (error) {
        console.error(`[Scraper Error] scrapePostLinks: Error scraping ${url}:`, error.message);
        return []; // Return empty array on error to prevent breaking main loop
    }
}


async function scrapeImagesFromPost(page, postUrl) {
    console.log(`[Scraper Debug] scrapeImagesFromPost: Using provided page to navigate to post ${postUrl}`);
    try {
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 90000 }); // Increased timeout
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay

        const imageUrls = await page.$$eval('img', (imgs) => {
            // Note: Node.ELEMENT_NODE is used here, ensure 'puppeteer' module is imported if needed for 'Node' global.
            // If `Node` is not defined, you might need `const { Node } = require('puppeteer');` at top of scraper.js
            // Or just check `currentElement.nodeType === 1`
            const filteredUrls = imgs.filter(img => {
                if (!img.src || img.src.endsWith('.svg')) {
                    return false;
                }

                let currentElement = img;
                while (currentElement) {
                    if (currentElement.nodeType === 1 && // Node.ELEMENT_NODE is 1
                        currentElement.tagName === 'HEADER' &&
                        currentElement.classList.contains('post__header')) {
                        return false;
                    }
                    currentElement = currentElement.parentElement;
                }
                return true;
            }).map(img => img.src);
            console.log(`[Page Evaluate] Found ${filteredUrls.length} image/video URLs in post.`);
            return filteredUrls;
        });

        console.log(`[Scraper Debug] scrapeImagesFromPost: Extracted ${imageUrls.length} image/video URLs from ${postUrl}`);
        return imageUrls;
    } catch (error) {
        console.error(`[Scraper Error] scrapeImagesFromPost: Error scraping images from ${postUrl}:`, error.message);
        return []; // If an error occurs here, return an empty array
    }
}

// Only export the functions that are actively used by master.js/index.js
module.exports = { scrapePostLinks, scrapeImagesFromPost };
