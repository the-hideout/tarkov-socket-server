import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
    port: process.env.PORT || 8080,
});

const sendMessage = (sessionID, type, data) => {
    wss.clients.forEach((client) => {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }
        if (client.sessionID !== sessionID) {
            return;
        }
        client.send(JSON.stringify({
            type: type,
            data: data,
        }));
    });
};

const pingInterval = setInterval(() => {
    console.log(`active clients: ${wss.clients.size}`);

    wss.clients.forEach((client) => {
        // if ping is pending from last tick, no response was received
        // so we terminate the connection
        if (client.isAlive === false) {
            console.log(`terminating ${client.sessionID} ${client.remoteAddress}`);
            client.terminate();
            return;
        }

        client.isAlive = false;
        if (client.nativePing) {
            client.ping();
            return;
        }
        client.send(JSON.stringify({
            type: 'ping',
        }));
    });
}, 30000);

wss.on('connection', (ws, req) => {
    const url = new URL(`http://localhost${req.url}`);
    ws.sessionID = url.searchParams.get('sessionid');
    ws.remoteAddress = req.headers['cf-connecting-ip']
        ?? req.headers['x-forwarded-for']
        ?? req.socket.remoteAddress;

    if (!ws.sessionID) {
        //console.log('Terminating connecting client missing sessionID');
        ws.terminate();
        return;
    }

    /*if (!req.headers.origin) {
        ws.terminate();
        return;
    }*/

    if (!req.headers.origin?.startsWith('http')) {
        ws.nativePing = true;
    }

    console.log(`Client connected ${ws.sessionID} from ${req.headers.origin}`);

    ws.isAlive = true;
    ws.settings = {};

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (rawMessage) => {
        let message;
        try {
            message = JSON.parse(rawMessage);
        } catch (error) {
            console.error(`Error parsing message ${ws.sessionID} ${ws.remoteAddress}`, rawMessage.toString());
            return;
        }

        if (message.type === 'pong') {
            ws.isAlive = true;
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

        console.warn(`Unrecognized message type ${ws.sessionID} ${ws.remoteAddress}`, message);
    });

    ws.on('error', (error) => {
        console.error(`Client error ${ws.sessionID} ${ws.remoteAddress}`, error.stack);
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
