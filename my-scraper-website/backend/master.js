const puppeteer = require('puppeteer');
const index = require('./index');
const checkNumberOfPages = require('./checkNumberOfPages');

async function runMasterScript(modelName, socketId, io) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });

    const totalEstimatedPosts = await checkNumberOfPages(modelName, browser);

    io.to(socketId).emit('estimated_time_info', {
      totalEstimatedPosts,
      estimatedTimeSeconds: totalEstimatedPosts * 2, // Adjust multiplier as needed
    });

    let totalScrapedCount = 0;
    let consecutiveZeroCount = 0;
    const MAX_CONSECUTIVE_ZERO = 3;
    const CHUNK_SIZE = 10;
    let startOffset = 0;

    while (true) {
      const postsScraped = await index.main(modelName, startOffset, io, browser, socketId);

      if (postsScraped === 0) {
        consecutiveZeroCount++;
        if (consecutiveZeroCount >= MAX_CONSECUTIVE_ZERO) break;
      } else {
        consecutiveZeroCount = 0;
      }

      totalScrapedCount += postsScraped;
      startOffset += CHUNK_SIZE;

      if (totalScrapedCount >= totalEstimatedPosts) break;

      await new Promise((r) => setTimeout(r, 10000)); // 10 seconds delay
    }

    io.to(socketId).emit('scrape_complete');
  } catch (err) {
    io.to(socketId).emit('scrape_error', { message: err.message });
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = runMasterScript;
