// scraper.js
const puppeteer = require('puppeteer');
const config = require('./config/config'); // Ensure config.js is accessible


async function scrapePostLinks(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        // Add a small delay after navigation, sometimes useful for dynamic content
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.waitForSelector('.card-list__items', { timeout: 60000 });

        const postLinks = await page.$$eval('.card-list__items article.post-card.post-card--preview a[href*="/post/"]', (links) =>
            links.map((link) => link.href)
        );
        return postLinks;
    } catch (error) {
        console.error(`Error scraping post links from ${url}:`, error);
        return null;
    }
}


async function scrapeImagesFromPost(page, postUrl) {
    await page.goto(postUrl, { waitUntil: 'networkidle2' });
    // Add a small delay after navigation
    await new Promise(resolve => setTimeout(resolve, 500));

    const imageUrls = await page.$$eval('img', (imgs) => {
        return imgs.filter(img => {
            // Check if the image source is valid and not an SVG
            if (!img.src || img.src.endsWith('.svg')) {
                return false;
            }

            // Check if any ancestor is a <header> tag with class "post__header"
            let currentElement = img;
            while (currentElement) {
                // Ensure currentElement is an HTMLElement before checking tagName and classList
                if (currentElement.nodeType === Node.ELEMENT_NODE &&
                    currentElement.tagName === 'HEADER' &&
                    currentElement.classList.contains('post__header')) {
                    return false; // Exclude this image because it's inside a post__header
                }
                currentElement = currentElement.parentElement;
            }
            return true; // Include this image
        }).map(img => img.src);
    });
    return imageUrls;
}

module.exports = { scrapePostLinks, scrapeImagesFromPost };
