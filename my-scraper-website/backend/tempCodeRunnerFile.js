// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:5173", // Frontend URL
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
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
    const socketId = req.headers['x-socket-id']; // This is what we're testing

    console.log('--- RECEIVED SCRAPE REQUEST ---');
    console.log('Model Name:', modelName);
    console.log('Socket ID (from header):', socketId); // Current log
    console.log('All Headers Received:');
    // Log ALL received headers
    for (const key in req.headers) {
        console.log(`  ${key}: ${req.headers[key]}`);
    }
    console.log('-----------------------------');

    if (!modelName) {
        return res.status(400).json({ error: 'Model name is required' });
    }

    if (!socketId) {
        // This is the error we're consistently getting
        return res.status(400).json({ error: 'Socket ID is missing from headers.' });
    }

    const clientSocket = connectedSockets.get(socketId);

    if (!clientSocket) {
        console.warn(`Scrape request received for unknown or disconnected socket ID: ${socketId}`);
        return res.status(404).json({ error: 'Client socket not found or disconnected.' });
    }

    // Simulate scraping process
    clientSocket.emit('estimated_time_info', { totalEstimatedPosts: 100 }); // Example data
    console.log(`Scrape request received for model: ${modelName} from socket: ${socketId}`);
    clientSocket.emit('scrape_complete', { message: `Scraping for ${modelName} completed.` });

    // Send an immediate response to the frontend that the scrape process has started
    res.json({ message: 'Scrape request received, processing...' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});