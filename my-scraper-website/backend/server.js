// backend/server.js
const express = require('express');
const http = require('http');

// --- START OF DEBUGGING AND CORS CHANGES ---

// Define socketIo variable outside the try-catch to ensure it's in scope
let socketIo;
try {
    // Attempt to require the socket.io module
    socketIo = require('socket.io');
    console.log('DEBUG: socket.io module loaded successfully!');
    console.log('DEBUG: Type of socketIo:', typeof socketIo);
    // Log a substring of the socketIo object to avoid logging the entire large object
    console.log('DEBUG: socketIo object (first 50 chars):', String(socketIo).substring(0, 50));
} catch (error) {
    // If requiring socket.io fails, log the error message
    console.error('ERROR: Failed to require socket.io:', error.message);
    // It's good practice to exit the process if a critical dependency can't be loaded
    // This makes the failure explicit in the deployment logs.
    process.exit(1);
}

const cors = require('cors');
const runMasterScript = require('./master');

const app = express();
const server = http.createServer(app);
<<<<<<< HEAD

// --- REQUIRED CODE CHANGE FOR CORS ---
// This allows your deployed frontend to connect to your backend.
// process.env.FRONTEND_URL will be the value you set on Render (e.g., https://your-frontend-app.onrender.com)
const allowedOrigins = [
    "http://localhost:5173", // Keep for local development
    process.env.FRONTEND_URL // THIS IS WHERE YOUR RENDER FRONTEND URL WILL BE USED
].filter(Boolean); // Filters out any undefined/null entries if FRONTEND_URL is not set locally

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // Or if the origin is in our allowed list
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`CORS Blocked: Origin ${origin} not allowed`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"]
};

// Apply CORS to both Express routes and Socket.IO
app.use(cors(corsOptions)); // Apply to Express routes
const io = socketIo(server, {
    cors: corsOptions // Apply to Socket.IO
});
// --- END OF REQUIRED CODE CHANGE FOR CORS ---

// ... (rest of your server.js code, including socket.io connection logic and /api/scrape endpoint, remains the same)

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
=======

// Define allowed origins dynamically based on environment or multiple static origins
// process.env.FRONTEND_URL will be set by Render in production.
// It falls back to localhost for local development.
const allowedOrigins = [
    "http://localhost:5173", // For local frontend development
    process.env.FRONTEND_URL // This will be your deployed frontend URL on Render
].filter(Boolean); // Filters out any undefined/null entries if FRONTEND_URL is not set

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // Or if the origin is in our allowed list
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`CORS Blocked: Origin ${origin} not allowed`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"]
};

// Apply CORS to both Express routes and Socket.IO
app.use(cors(corsOptions));

// Initialize Socket.IO with the http server and CORS options
// This is the line that previously caused the ReferenceError, now protected by try-catch
const io = socketIo(server, {
    cors: corsOptions
});
// --- END OF DEBUGGING AND CORS CHANGES ---


// Middleware
>>>>>>> f27474f4844d00dac86e562ebceaca7cd8a961c6
app.use(express.json()); // To parse JSON request bodies

const connectedSockets = new Map(); // Store connected sockets by ID

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    connectedSockets.set(socket.id, socket);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        connectedSockets.delete(socket.id);
    });
});

// Scrape endpoint
app.post('/api/scrape', async (req, res) => {
    const { modelName } = req.body;
    const socketId = req.headers['x-socket-id'];

    console.log('--- RECEIVED SCRAPE REQUEST ---');
    console.log('Model Name:', modelName);
    console.log('Socket ID (from header):', socketId);
    console.log('All Headers Received:');
    for (const key in req.headers) {
<<<<<<< HEAD
        console.log(`   ${key}: ${req.headers[key]}`);
=======
        console.log(`  ${key}: ${req.headers[key]}`);
>>>>>>> f27474f4844d00dac86e562ebceaca7cd8a961c6
    }
    console.log('-----------------------------');

    if (!modelName) {
        return res.status(400).json({ error: 'Model name is required' });
    }

    if (!socketId) {
        return res.status(400).json({ error: 'Socket ID is missing from headers.' });
    }

    const clientSocket = connectedSockets.get(socketId);

    if (!clientSocket) {
        console.warn(`Scrape request received for unknown or disconnected socket ID: ${socketId}`);
        return res.status(404).json({ error: 'Client socket not found or disconnected.' });
    }

    // IMPORTANT: Send initial response to frontend that scraping has started
    res.json({ message: 'Scrape request received, initiating scraping process...' });
    console.log(`Scrape request received for model: ${modelName} from socket: ${socketId}. Initiating master script...`);

    // --- NEW: Call the master script to start scraping ---
    try {
        // Pass the modelName and the specific clientSocket for real-time updates
        await runMasterScript(modelName, clientSocket);
        // The runMasterScript should emit 'scrape_complete' or 'scrape_error' itself
    } catch (error) {
        console.error(`Error during scraping for ${modelName}:`, error);
        clientSocket.emit('scrape_error', { message: `Scraping failed for ${modelName}: ${error.message}` });
    }
});
<<<<<<< HEAD
=======

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
>>>>>>> f27474f4844d00dac86e562ebceaca7cd8a961c6
