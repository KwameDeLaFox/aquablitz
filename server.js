const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for all routes (SPA style)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const gameState = {
    players: new Map(), // Store player positions, rotations, and states
    powerUps: [], // Store active power-ups on the track
    raceState: 'waiting', // waiting, countdown, racing, finished
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Add player to game
    socket.on('playerJoin', (playerData) => {
        gameState.players.set(socket.id, {
            id: socket.id,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            speed: 0,
            isDrifting: false,
            powerUp: null,
            ...playerData
        });
        io.emit('playersList', Array.from(gameState.players.values()));
    });

    // Update player state
    socket.on('playerUpdate', (data) => {
        if (gameState.players.has(socket.id)) {
            gameState.players.set(socket.id, {
                ...gameState.players.get(socket.id),
                ...data
            });
            // Broadcast to all players except sender
            socket.broadcast.emit('playerMove', {
                id: socket.id,
                ...data
            });
        }
    });

    // Handle power-up usage
    socket.on('powerUpUsed', (data) => {
        io.emit('powerUpEffect', {
            id: socket.id,
            type: data.type,
            position: data.position
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        gameState.players.delete(socket.id);
        io.emit('playersList', Array.from(gameState.players.values()));
    });
});

// Start server
const PORT = process.env.PORT || 3000;
module.exports = http; // Export for Vercel
http.listen(PORT, () => {
    console.log(`Aqua Blitz server running on port ${PORT}`);
}); 