const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 30000,
    pingInterval: 10000
});

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
const disconnectTimers = new Map();

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('set username', (username) => {
        if (users.has(socket.id)) {
            socket.emit('username ok', username);
            return;
        }
        const existingUsers = Array.from(users.values());
        if (existingUsers.includes(username)) {
            socket.emit('username taken', username);
            return;
        }
        for (const [uname] of disconnectTimers) {
            if (uname === username) {
                socket.emit('username taken', username);
                return;
            }
        }
        if (disconnectTimers.has(username)) {
            clearTimeout(disconnectTimers.get(username));
            disconnectTimers.delete(username);
        }
        users.set(socket.id, username);
        socket.emit('username ok', username);
        io.emit('user list', Array.from(users.values()));
        console.log(`${username} connected`);
    });

    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    socket.on('heartbeat', () => {
        const username = users.get(socket.id);
        if (username && disconnectTimers.has(username)) {
            clearTimeout(disconnectTimers.get(username));
            disconnectTimers.delete(username);
        }
    });

    socket.on('disconnect', () => {
        const username = users.get(socket.id);
        if (username) {
            console.log(`${username} disconnected, waiting 15s...`);
            const timer = setTimeout(() => {
                for (const [sid, name] of users.entries()) {
                    if (name === username) {
                        users.delete(sid);
                        break;
                    }
                }
                disconnectTimers.delete(username);
                io.emit('user list', Array.from(users.values()));
                console.log(`${username} removed from online list`);
            }, 15000);
            disconnectTimers.set(username, timer);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
