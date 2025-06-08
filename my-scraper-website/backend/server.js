// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { runMasterScript } = require('./master'); // Corrected import: using destructuring for runMasterScript


// --- GLOBAL UNCAUGHT EXCEPTION HANDLERS (CRITICAL FOR DEBUGGING CRASHES) ---
process.on('uncaughtException', (err) => {
    console.error('--- FATAL UNCAUGHT EXCEPTION ---');
    console.error('An uncaught exception occurred. This is a severe error and likely caused a process crash.');
    console.error('Error:', err);
    console.error('Stack:', err.stack);
    // In a production app, you might send this to an error monitoring service.
    // For debugging, we log it and let the process exit so Render restarts it.
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('--- FATAL UNHANDLED REJECTION ---');
    console.error('An unhandled promise rejection occurred. This is also a severe error and likely caused a process crash.');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
});
// --- END GLOBAL UNCAUGHT EXCEPTION HANDLERS ---


const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const allowedOrigins = [
    "http://localhost:5173", // Keep for local development
    process.env.FRONTEND_URL // THIS IS WHERE YOUR RENDER FRONTEND URL WILL BE USED
].filter(Boolean); // Filters out any undefined/null entries if FRONTEND_URL is not set locally

const corsOptions = {
    origin: function (origin, callback) {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});

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

    res.json({ message: 'Scrape request received, initiating scraping process...' });
    console.log(`Scrape request received for model: ${modelName} from socket: ${socketId}. Initiating master script...`);

    try {
        // Pass the modelName, specific clientSocket's ID, and the io object
        // The master script will manage Puppeteer browser instance(s)
        await runMasterScript(modelName, socketId, io);
    } catch (error) {
        console.error(`Error during scraping for ${modelName} in /api/scrape endpoint:`, error);
        clientSocket.emit('scrape_error', { message: `Scraping failed for ${modelName}: ${error.message}` });
    }
});
