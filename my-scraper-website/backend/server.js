const puppeteer = require('puppeteer');
const index = require('./index');
const checkNumberOfPages = require('./checkNumberOfPages');

async function runMasterScript(modelName, socketId, io) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    // First estimate total posts and estimated time
    const totalEstimatedPosts = await checkNumberOfPages(modelName, browser);

    // Emit estimated time info to frontend
    io.to(socketId).emit('estimated_time_info', {
      totalEstimatedPosts,
      estimatedTimeSeconds: totalEstimatedPosts * 2, // For example, 2 seconds per post, adjust as needed
    });

    let totalScrapedCount = 0;
    let consecutiveZeroCount = 0;
    const MAX_CONSECUTIVE_ZERO = 3;
    const CHUNK_SIZE = 10;
    let startOffset = 0;

    while (true) {
      const postsScraped = await index.main(modelName, startOffset, io, browser);

      if (postsScraped === 0) {
        consecutiveZeroCount++;
        if (consecutiveZeroCount >= MAX_CONSECUTIVE_ZERO) {
          break;
        }
      } else {
        consecutiveZeroCount = 0;
      }

      totalScrapedCount += postsScraped;
      startOffset += CHUNK_SIZE;

      // If scraped enough posts, break
      if (totalScrapedCount >= totalEstimatedPosts) {
        break;
      }

      // Wait 10 seconds before next chunk
      await new Promise(res => setTimeout(res, 10000));
    }

    io.to(socketId).emit('scrape_complete');
  } catch (err) {
    io.to(socketId).emit('scrape_error', { message: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = runMasterScript;
