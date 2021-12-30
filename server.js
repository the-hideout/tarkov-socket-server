require('dotenv').config();
const WebSocket = require('ws');

const wss = new WebSocket.Server({
    port: process.env.PORT || 8080,
});

const pingMessage = JSON.stringify({
    type: 'ping',
});

const sendCommand = (sessionID, command) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.role === 'scanner' && client.sessionID === sessionID) {
            client.send(JSON.stringify({
                type: 'command',
                data: command
            }));
        }
    });
};

const sendMessage = (sessionID, type, data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.role === 'listener' && client.sessionID === sessionID ) {
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

wss.on('connection', (ws) => {
    ws.isAlive = true;

    ws.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage);

        if(message.type === 'pong'){
            ws.isAlive = true;

            return true;
        }

        if(message?.type !== 'debug'){
            console.log(message);
        }

        if(message.type === 'connect'){
            ws.sessionID = message.sessionID;
            ws.role = message.role;
            return true;
        }

        if(message.type === 'command'){
            // if (message.password != process.env.WS_PASSWORD) {
            //     sendMessage(ws.sessionID, 'debug', 'Access denied');
            //     return false;
            // }
            sendCommand(message.sessionID, message.data);

            return true;
        }

        if(message.type === 'debug'){
            sendMessage(message.sessionID, 'debug', message.data);

            return true;
        }
    });
});

wss.on('close', () => {
    clearInterval(pingInterval);
});
