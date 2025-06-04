const io = socketIo(server, {
    cors: {
        origin: "http://localhost:5173", // <-- This needs to change
        methods: ["GET", "POST"]
    }
});

// Middleware (if you have app.use(cors()) without options, it's also affected)
app.use(cors()); // <-- This also needs to change
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
        console.log(`  ${key}: ${req.headers[key]}`);
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
