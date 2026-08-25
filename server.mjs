import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
    port: process.env.PORT || 8080,
});

// track clients by session id
const sessionClients = new Map();

function addToSession(ws) {
    if (!sessionClients.has(ws.sessionID)) {
        sessionClients.set(ws.sessionID, new Set());
    }
    sessionClients.get(ws.sessionID).add(ws);
}

function removeFromSession(ws) {
    const set = sessionClients.get(ws.sessionID);
    if (!set) {
        return;
    }
    set.delete(ws);
    if (set.size === 0) {
        sessionClients.delete(ws.sessionID); // important: prune empty entries
    }
}

const sendMessage = (sessionID, type, data) => {
    const clients = sessionClients.get(sessionID);
    if (!clients) return;
    const payload = JSON.stringify({ type, data });
    clients.forEach((client) => {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }
        client.send(payload);
    });
};

const pingInterval = setInterval(() => {
    console.log(`active clients: ${wss.clients.size}`);
    const liveSessions = new Set();

    wss.clients.forEach((client) => {
        // if ping is pending from last tick, no response was received
        // so we terminate the connection
        if (client.isAlive === false) {
            console.log(`terminating ${client.sessionID} ${client.remoteAddress}${client.origin ? ` via ${client.origin}` : ''}`);
            client.terminate();
            return;
        }
        liveSessions.add(client);
        client.isAlive = false;
        if (client.nativePing) {
            client.ping();
            return;
        } else {
            client.send(JSON.stringify({
                type: 'ping',
            }));
        }
        // prune anything in sessionClients that's no longer in wss.clients
        for (const [sessionID, clientSet] of sessionClients) {
            for (const client of clientSet) {
                if (!liveSessions.has(client)) {
                    clientSet.delete(client);
                }
            }
            if (clientSet.size === 0) {
                sessionClients.delete(sessionID);
            }
        }
    });
}, 30000);

wss.on('connection', (ws, req) => {
    const url = new URL(`http://localhost${req.url}`);
    ws.sessionID = url.searchParams.get('sessionid');
    ws.remoteAddress = req.headers['cf-connecting-ip']
        ?? req.headers['x-forwarded-for']
        ?? req.socket.remoteAddress;
    ws.origin = req.headers.origin;
    if (!ws.sessionID) {
        //console.log('Terminating connecting client missing sessionID');
        ws.terminate();
        return;
    }

    if (process.env.REQUIRE_ORIGIN === 'true' && !req.headers.origin) {
        ws.terminate();
        return;
    }

    if (!req.headers.origin?.startsWith('http')) {
        ws.nativePing = true;
    }
    addToSession(ws);
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
            console.error(`Error parsing message ${ws.sessionID} ${ws.remoteAddress}`, stringMessage);
            return;
        }
        let stringMessage = JSON.stringify(message);


        if (message.type === 'pong') {
            ws.isAlive = true;
            return;
        }

        /*if (message.type !== 'debug') {
            console.log(`${ws.sessionID} sent: ${stringMessage}`);
        }*/

        const sessionID = message.sessionID;
        if (!sessionID) {
            console.warn(`${ws.sessionID}, sent missing sessionID: ${stringMessage}`);
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

        console.warn(`Unrecognized message type ${ws.sessionID} ${ws.remoteAddress}: ${stringMessage}`);
    });

    ws.on('error', (error) => {
        removeFromSession(ws);
        ws.terminate();
        console.error(`Client error ${ws.sessionID} ${ws.remoteAddress}`, error.stack);
    });

    ws.on('close', () => {
        removeFromSession(ws);
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
