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
const sessions = new Map();
const disconnectTimers = new Map();
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
        }
    }
}

setInterval(cleanOldMessages, 30000);
setInterval(cleanOldSessions, 30000);

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    cleanOldMessages();
    socket.emit('message history', messages);

    socket.on('check session', (sessionId) => {
        const session = sessions.get(sessionId);
        if (session && (Date.now() - session.lastSeen < SESSION_TTL)) {
            if (disconnectTimers.has(session.username)) {
                clearTimeout(disconnectTimers.get(session.username));
                disconnectTimers.delete(session.username);
            }
            for (const [sid, name] of users.entries()) {
                if (name === session.username && sid !== socket.id) {
                    users.delete(sid);
                    sessions.delete(sid);
                    break;
                }
            }
            session.lastSeen = Date.now();
            users.set(socket.id, session.username);
            sessions.set(socket.id, { username: session.username, lastSeen: Date.now() });
            socket.emit('session ok', session.username);
            io.emit('user list', Array.from(users.values()));
            console.log(`${session.username} reconnected via session`);
        } else {
            sessions.delete(sessionId);
            socket.emit('session expired');
        }
    });

    socket.on('set username', (username) => {
        if (users.has(socket.id)) {
            socket.emit('username ok', username);
            return;
        }
        for (const [sid, name] of users.entries()) {
            if (name === username && sid !== socket.id) {
                users.delete(sid);
                sessions.delete(sid);
                break;
            }
        }
        if (disconnectTimers.has(username)) {
            clearTimeout(disconnectTimers.get(username));
            disconnectTimers.delete(username);
        }
        users.set(socket.id, username);
        sessions.set(socket.id, { username, lastSeen: Date.now() });
        socket.emit('username ok', username);
        io.emit('user list', Array.from(users.values()));
        console.log(`${username} connected`);
    });

    socket.on('chat message', (data) => {
        const msgData = { ...data, timestamp: Date.now() };
        messages.push(msgData);
        io.emit('chat message', data);
    });

    socket.on('clear messages', () => {
        messages.length = 0;
        io.emit('clear messages');
    });

    socket.on('heartbeat', () => {
        const username = users.get(socket.id);
        if (username) {
            if (sessions.has(socket.id)) {
                sessions.get(socket.id).lastSeen = Date.now();
            }
            if (disconnectTimers.has(username)) {
                clearTimeout(disconnectTimers.get(username));
                disconnectTimers.delete(username);
            }
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
                        sessions.delete(sid);
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
