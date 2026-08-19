#!/bin/bash

cleanup() {
    kill $SERVER_PID $SSH_PID 2>/dev/null
    wait $SERVER_PID $SSH_PID 2>/dev/null
    history -c 2>/dev/null
    > ~/.bash_history 2>/dev/null
    history -w 2>/dev/null
    sed -i '/chat-app/d' ~/.bash_history 2>/dev/null
    sed -i '/serveo/d' ~/.bash_history 2>/dev/null
    sed -i '/localhost.run/d' ~/.bash_history 2>/dev/null
    sed -i '/node server/d' ~/.bash_history 2>/dev/null
    sed -i '/3000/d' ~/.bash_history 2>/dev/null
    > ~/.bash_history 2>/dev/null
    echo -ne '\033[2J\033[H'
    tput reset 2>/dev/null
    clear
    clear
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

history -c 2>/dev/null
> ~/.bash_history 2>/dev/null
echo -ne '\033[2J\033[H'
clear

cd "$(dirname "$0")"
node server.js &
SERVER_PID=$!
sleep 2

ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 serveo.net 2>&1 &
SSH_PID=$!
sleep 5

URL=$(grep -o 'https://[^ ]*serveousercontent.com' /proc/$SSH_PID/fd/1 2>/dev/null)

echo ""
echo "========================================="
echo "  CHAT APP RUNNING"
echo ""
echo "  Send this URL to your friend:"
echo ""
echo "  $URL"
echo ""
echo "========================================="
echo ""
echo "  Press CTRL+C to stop and auto-clear"

wait
