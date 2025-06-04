// cli-runner.js

const runMasterScript = require('./master'); // Assuming master.js is in the same directory
const readline = require('readline'); // Used for getting input from the command line

// Create a dummy/mock Socket.IO 'io' object
// This object will have the 'emit' method that your master.js and index.js expect.
// Instead of sending data over a WebSocket, it will just console.log it.
const mockIo = {
    emit: (eventName, data) => {
        // You can filter based on eventName if you want, e.g., only log 'progress_update'
        if (eventName === 'progress_update') {
            console.log(`[PROGRESS] ${data.message}`);
        } else if (eventName === 'scrape_complete') {
            console.log(`[COMPLETE] ${data.message}`);
        } else if (eventName === 'scrape_error') {
            console.error(`[ERROR] ${data.message}`);
        } else {
            console.log(`[${eventName.toUpperCase()}]`, data);
        }
    }
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter OF model username to scrape: ', async (modelName) => {
    if (!modelName.trim()) {
        console.error('Model name cannot be empty. Exiting.');
        rl.close();
        return;
    }

    console.log(`\nStarting scrape for: ${modelName} (CLI mode)\n`);
    try {
        // Call your master script, passing the modelName and the mockIo object
        await runMasterScript(modelName.trim(), mockIo);
        console.log('\nCLI Scraper Finished.');
    } catch (error) {
        console.error('An unhandled error occurred in the CLI runner:', error);
    } finally {
        rl.close();
    }
});

// Handle graceful exit if process is interrupted
process.on('SIGINT', () => {
    console.log('\nCLI Scraper interrupted. Exiting.');
    rl.close();
    process.exit();
});