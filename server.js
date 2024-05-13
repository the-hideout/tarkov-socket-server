require('dotenv').config();
const WebSocket = require('ws');

const wss = new WebSocket.Server({
    port: process.env.PORT || 8080,
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
        // if ping is pending from last tick, no response was received
        // so we terminate the connection
        if (client.pingPending === true) {
            console.log(`terminating ${client.sessionID}`);
            return client.terminate();
        }

        client.pingPending = true;
        client.send(JSON.stringify({
            type: 'ping',
        }));
    });
}, 30000);

wss.on('connection', (ws, req) => {
    const url = new URL(`http://localhost${req.url}`);
    ws.sessionID = url.searchParams.get('sessionid');

    if (!ws.sessionID) {
        console.log('Terminating connecting client missing sessionID');
        ws.terminate();
        return;
    }

    console.log(`Client connected ${ws.sessionID}`);

    ws.pingPending = false;
    ws.settings = {};

    ws.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage);

        if (message.type === 'pong') {
            ws.pingPending = false;

            return;
        }

        if (message.type !== 'debug') {
            console.log(ws.sessionID, message);
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
