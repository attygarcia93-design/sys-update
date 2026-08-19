const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0');

function cleanup() {
    console.clear();
    process.stdout.write('\x1B[2J\x1B[0f');
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
    try { require('child_process').execSync('clear', { stdio: 'inherit' }); } catch(e) {}
});
