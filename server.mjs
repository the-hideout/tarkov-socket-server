import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
    port: process.env.PORT || 8080,
});

const originFilters = JSON.parse(process.env.ORIGIN_FILTER ?? '[]').map(str => new RegExp(str));


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
    console.info(`active clients: ${wss.clients.size}`);

    wss.clients.forEach((client) => {
        // if ping is pending from last tick, no response was received
        // so we terminate the connection
        if (client.isAlive === false) {
            console.warn(`Terminating ${client.sessionID} ${client.remoteAddress}${client.origin ? ` via ${client.origin}` : ''}`);
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
    ws.origin = req.headers.origin;
    if (!ws.sessionID) {
        console.warn(`Terminated connection to ${req.headers.host} missing sessionID: ${ws.sessionID} from ${ws.remoteAddress}`);
        ws.terminate();
        return;
    }

    if (process.env.REQUIRE_ORIGIN === 'true' && !req.headers.origin) {
        ws.terminate();
        console.warn(`Terminated connection to ${req.headers.host} missing origin header: ${ws.sessionID} from ${ws.remoteAddress}`);
        return;
    }

    if (ws.origin) {
        for (const rx of originFilters) {
            if (!ws.origin.match(rx)) {
                continue;
            }
            ws.terminate();
            console.warn(`Terminated connection to ${req.headers.host} filtered origin ${rx}: ${ws.sessionID} from ${ws.remoteAddress}`);
            return;
        }
    }

    if (process.env.FORCE_HOST && req.headers.host !== process.env.FORCE_HOST) {
        ws.terminate();
        console.warn(`Terminated connection to invalid host ${req.headers.host}: ${ws.sessionID} from ${ws.remoteAddress}`);
        return;
    }

    if (!req.headers.origin?.startsWith('http')) {
        ws.nativePing = true;
    }

    console.info(`Client connected ${req.headers.host} ${ws.sessionID} from ${ws.remoteAddress} ${ws.origin}`);

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
            console.error(`Error parsing message ${ws.sessionID} ${ws.remoteAddress}: ${rawMessage.toString()}`);
            return;
        }
        let stringMessage = JSON.stringify(message);

        if (message.type === 'pong') {
            ws.isAlive = true;
            return;
        }

        console.debug(`${ws.sessionID} sent: ${stringMessage}`);

        const sessionID = message.sessionID;
        if (!sessionID) {
            console.warn(`${ws.sessionID} ${ws.remoteAddress}, sent missing sessionID: ${stringMessage}`);
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
        console.error(`Client error ${ws.sessionID} ${ws.remoteAddress}`, error.stack);
    });

    ws.on('close', () => {
        console.info(`Client disconnected ${ws.sessionID}`);
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
