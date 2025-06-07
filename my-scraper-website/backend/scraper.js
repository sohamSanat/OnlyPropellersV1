// scraper.js
const puppeteer = require('puppeteer');
const config = require('./config/config');


async function scrapePostLinks(page, url) {
    console.log(`[Scraper Debug] scrapePostLinks: Navigating to ${url}`); // Debugging
    try {
        // Change to 'networkidle2' for more robust page loading, waiting for network to be quiet
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }); // Increased timeout to 90 seconds
        console.log(`[Scraper Debug] scrapePostLinks: Page loaded for ${url}.`); // Debugging

        // Add a slightly longer delay after navigation before checking selector
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased from 500ms to 1500ms

        // Wait for the main content wrapper
        await page.waitForSelector('.card-list__items', { timeout: 60000 }); // Still 60s for selector
        console.log(`[Scraper Debug] scrapePostLinks: .card-list__items selector found.`); // Debugging

        const postLinks = await page.$$eval('.card-list__items article.post-card.post-card--preview a[href*="/post/"]', (links) => {
            const extractedLinks = links.map((link) => link.href);
            console.log(`[Page Evaluate] Found ${extractedLinks.length} potential post links.`); // This logs in Puppeteer's console
            return extractedLinks;
        });

        console.log(`[Scraper Debug] scrapePostLinks: Extracted ${postLinks.length} post links from ${url}`); // Debugging
        return postLinks;
    } catch (error) {
        console.error(`[Scraper Error] scrapePostLinks: Error scraping ${url}:`, error.message); // More detailed error
        return null; // Return null on error to indicate failure
    }
}


async function scrapeImagesFromPost(page, postUrl) {
    console.log(`[Scraper Debug] scrapeImagesFromPost: Navigating to post ${postUrl}`); // Debugging
    try {
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 90000 }); // Increased timeout
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay

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
            console.log(`[Page Evaluate] Found ${filteredUrls.length} image/video URLs in post.`); // Logs in Puppeteer's console
            return filteredUrls;
        });

        console.log(`[Scraper Debug] scrapeImagesFromPost: Extracted ${imageUrls.length} image/video URLs from ${postUrl}`); // Debugging
        return imageUrls;
    } catch (error) {
        console.error(`[Scraper Error] scrapeImagesFromPost: Error scraping images from ${postUrl}:`, error.message); // More detailed error
        // If an error occurs here, return an empty array so master.js doesn't break due to null/undefined
        return [];
    }
}

module.exports = { scrapePostLinks, scrapeImagesFromPost };
