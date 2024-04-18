require('dotenv').config();
const WebSocket = require('ws');

const wss = new WebSocket.Server({
    port: process.env.PORT || 8080,
});

const pingMessage = JSON.stringify({
    type: 'ping',
});

const sendMessage = (sessionID, type, data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID) {
            client.send(JSON.stringify({
                type: type,
                data: data,
            }));
        }
    });
};

const pingInterval = setInterval(() => {
    console.log(`active clients: ${wss.clients.size}`);

    wss.clients.forEach((client) => {
        if (client.isAlive === false) {
            console.log(`terminating ${client.sessionID}`);
            return client.terminate();
        }

        client.isAlive = false;
        client.send(pingMessage);
    });
}, 30000);

wss.on('connection', (ws, req) => {
    const url = new URL(`http://localhost${req.url}`);
    ws.sessionID = url.searchParams.get('sessionid');

    // in future when all clients send session id via search param,
    // we can immediately terminate any clients that don't include it

    console.log(`Client connected ${ws.sessionID || ''}`);

    ws.isAlive = true;
    ws.settings = {};

    ws.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage);

        if (message.type === 'pong') {
            ws.isAlive = true;

            return;
        }

        if (message.type !== 'debug') {
            console.log(ws.sessionID, message);
        }

        if (message.type === 'connect') {
            if (!message.sessionID) {
                console.log('No connect session ID provided; dropping message', message);
                return;
            }
            ws.sessionID = message.sessionID;
            return;
        }

        const sessionID = message.sessionID;
        if (!sessionID) {
            console.log('No session ID set, dropping message', message);
            return;
        }

        if (message.type === 'command') {
            sendMessage(sessionID, 'command', message.data);

            return;
        }

        if (message.type === 'debug') {
            sendMessage(sessionID, 'debug', message.data);

            return;
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected ${ws.sessionID}`);
    });
});

wss.on('error', error => {
    console.error('Server error', error);
});

wss.on('close', () => {
    clearInterval(pingInterval);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception', error.stack);
}); 
