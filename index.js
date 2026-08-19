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

const onlineUsers = new Map();
const sessions = new Map();
const messages = [];
const MESSAGE_TTL = 5 * 60 * 1000;
const SESSION_TTL = 10 * 60 * 1000;

function cleanOldMessages() {
    const cutoff = Date.now() - MESSAGE_TTL;
    while (messages.length > 0 && messages[0].timestamp < cutoff) {
        messages.shift();
    }
}

function cleanOldSessions() {
    const cutoff = Date.now() - SESSION_TTL;
    for (const [id, session] of sessions) {
        if (session.lastSeen < cutoff) {
            sessions.delete(id);
            for (const [sid, data] of onlineUsers) {
                if (data.sessionId === id) {
                    onlineUsers.delete(sid);
                }
            }
        }
    }
}

function broadcastUserList() {
    const names = [];
    const seen = new Set();
    for (const [, data] of onlineUsers) {
        if (!seen.has(data.username)) {
            seen.add(data.username);
            names.push(data.username);
        }
    }
    io.emit('user list', names);
}

setInterval(() => { cleanOldMessages(); cleanOldSessions(); broadcastUserList(); }, 30000);

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    cleanOldMessages();
    socket.emit('message history', messages);

    socket.on('check session', (sessionId) => {
        const session = sessions.get(sessionId);
        if (session && (Date.now() - session.lastSeen < SESSION_TTL)) {
            for (const [sid, data] of onlineUsers) {
                if (data.sessionId === sessionId && sid !== socket.id) {
                    const oldSocket = io.sockets.sockets.get(sid);
                    if (oldSocket) oldSocket.disconnect(true);
                    onlineUsers.delete(sid);
                    break;
                }
            }
            session.lastSeen = Date.now();
            onlineUsers.set(socket.id, { username: session.username, sessionId });
            socket.emit('session ok', session.username);
            broadcastUserList();
            console.log(`${session.username} reconnected`);
        } else {
            sessions.delete(sessionId);
            for (const [sid, data] of onlineUsers) {
                if (data.sessionId === sessionId) {
                    onlineUsers.delete(sid);
                    break;
                }
            }
            socket.emit('session expired');
        }
    });

    socket.on('set username', (username) => {
        for (const [sid, data] of onlineUsers) {
            if (data.username === username && sid !== socket.id) {
                const oldSocket = io.sockets.sockets.get(sid);
                if (oldSocket) oldSocket.disconnect(true);
                onlineUsers.delete(sid);
                break;
            }
        }
        const sessionId = socket.id;
        sessions.set(sessionId, { username, lastSeen: Date.now() });
        onlineUsers.set(socket.id, { username, sessionId });
        socket.emit('username ok', username);
        broadcastUserList();
        console.log(`${username} connected`);
    });

    socket.on('chat message', (data) => {
        messages.push({ ...data, timestamp: Date.now() });
        io.emit('chat message', data);
    });

    socket.on('clear messages', () => {
        messages.length = 0;
        io.emit('clear messages');
    });

    socket.on('heartbeat', () => {
        const data = onlineUsers.get(socket.id);
        if (data && sessions.has(data.sessionId)) {
            sessions.get(data.sessionId).lastSeen = Date.now();
        }
    });

    socket.on('disconnect', () => {
        const data = onlineUsers.get(socket.id);
        if (data) {
            console.log(`${data.username} disconnected`);
            onlineUsers.delete(socket.id);
            broadcastUserList();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
