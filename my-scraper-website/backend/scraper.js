// scraper.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch').default; // .default for CommonJS import
const config = require('./config/config');


async function downloadImage(imageUrl, downloadPath, modelName) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const buffer = await response.buffer();
        const downloadsPath = path.join(require('os').homedir(), 'Downloads', 'OnlyFans Hacker', modelName);
        if (!fs.existsSync(downloadsPath)) {
            fs.mkdirSync(downloadsPath, { recursive: true });
        }
        const fullDownloadPath = path.join(downloadsPath, path.basename(downloadPath));
        fs.writeFileSync(fullDownloadPath, buffer);
        console.log(`Downloaded: ${imageUrl} to ${fullDownloadPath}`); // Log full path for clarity
    } catch (error) {
        console.error(`Error downloading ${imageUrl}:`, error.message);
    }
}


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
        console.error(`Error scraping ${url}:`, error);
        return null;
    }
}


async function scrapeImagesFromPost(page, postUrl) {
    await page.goto(postUrl, { waitUntil: 'networkidle2' });
    // Add a small delay after navigation
    await new Promise(resolve => setTimeout(resolve, 500)); 
    const imageUrls = await page.$$eval('img', (imgs) =>
        imgs.map((img) => img.src).filter((src) => src && !src.endsWith('.svg'))
    );
    return imageUrls;
}

module.exports = { scrapePostLinks, downloadImage, scrapeImagesFromPost };