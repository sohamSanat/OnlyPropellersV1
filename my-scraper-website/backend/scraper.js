// scraper.js
const puppeteer = require('puppeteer'); // Still needed for Node.ELEMENT_NODE
const config = require('./config/config');


// scrapePostLinks now accepts a 'page' object
async function scrapePostLinks(page, url) {
    console.log(`[Scraper Debug] scrapePostLinks: Using provided page to navigate to ${url}`);
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
        console.log(`[Scraper Debug] scrapePostLinks: Page loaded for ${url}.`);

        await new Promise(resolve => setTimeout(resolve, 1500));

        await page.waitForSelector('.card-list__items', { timeout: 60000 });
        console.log(`[Scraper Debug] scrapePostLinks: .card-list__items selector found.`);

        const postLinks = await page.$$eval('.card-list__items article.post-card.post-card--preview a[href*="/post/"]', (links) => {
            const extractedLinks = links.map((link) => link.href);
            console.log(`[Page Evaluate] Found ${extractedLinks.length} potential post links.`);
            return extractedLinks;
        });

        console.log(`[Scraper Debug] scrapePostLinks: Extracted ${postLinks.length} post links from ${url}`);
        return postLinks;
    } catch (error) {
        console.error(`[Scraper Error] scrapePostLinks: Error scraping ${url}:`, error.message);
        return []; // Return empty array on error
    }
}


// scrapeImagesFromPost now accepts a 'page' object
async function scrapeImagesFromPost(page, postUrl) {
    console.log(`[Scraper Debug] scrapeImagesFromPost: Using provided page to navigate to post ${postUrl}`);
    try {
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 90000 });
        await new Promise(resolve => setTimeout(resolve, 1500));

        const imageUrls = await page.$$eval('img', (imgs) => {
            const filteredUrls = imgs.filter(img => {
                if (!img.src || img.src.endsWith('.svg')) {
                    return false;
                }

                let currentElement = img;
                while (currentElement) {
                    if (currentElement.nodeType === Node.ELEMENT_NODE &&
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
        return [];
    }
}

// Export functions that now accept a page argument
module.exports = { scrapePostLinks, scrapeImagesFromPost };
