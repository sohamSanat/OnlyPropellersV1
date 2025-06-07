// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { runMasterScript } = require('./master'); // CHANGED: Added destructuring { runMasterScript }


const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const allowedOrigins = [
    "http://localhost:5173",
    process.env.FRONTEND_URL
].filter(Boolean);

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

app.use(cors(corsOptions));
const io = socketIo(server, {
    cors: corsOptions
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});

app.use(express.json());

const connectedSockets = new Map();

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    connectedSockets.set(socket.id, socket);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        connectedSockets.delete(socket.id);
    });
});

app.post('/api/scrape', async (req, res) => {
    const { modelName } = req.body;
    const socketId = req.headers['x-socket-id'];

    console.log('--- RECEIVED SCRAPE REQUEST ---');
    console.log('Model Name:', modelName);
    console.log('Socket ID (from header):', socketId);
    console.log('All Headers Received:');
    for (const key in req.headers) {
        console.log(`   ${key}: ${req.headers[key]}`);
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

    res.json({ message: 'Scrape request received, initiating scraping process...' });
    console.log(`Scrape request received for model: ${modelName} from socket: ${socketId}. Initiating master script...`);

    try {
        // Pass the modelName, specific clientSocket's ID, and the io object
        await runMasterScript(modelName, socketId, io); // Pass socketId and io
    } catch (error) {
        console.error(`Error during scraping for ${modelName}:`, error);
        clientSocket.emit('scrape_error', { message: `Scraping failed for ${modelName}: ${error.message}` });
    }
});
