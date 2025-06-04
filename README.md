# Coomer Scraper

A web scraper for coomer.su built with Node.js and Puppeteer.

## Setup

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

To run the scraper:

```bash
npm start
```

- The scraper now prompts the user for an OnlyFans username, dynamically constructs the target URL, and organizes downloaded images into a subdirectory named after the OF model within the `data` directory.
- Detailed console logs have been added to `index.js` to provide real-time feedback on the program's progress.
- SVG files are now excluded from image downloads to prevent unnecessary or problematic content.
- The scraper now launches a Puppeteer browser once for the entire scraping session.
- It navigates to individual posts to download all associated images, rather than just scraping thumbnails from the main page. It also tracks the number of posts scraped using a `POST_SCRAPED` counter.
- The scraper now continuously scrapes posts, updating the target URL with an `o` parameter based on the `POST_SCRAPED` count to move to the next set of posts after every 50 posts.

## Configuration

Edit `config/config.js` to change the target URL, headless mode, and other settings.