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
        if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && (client.role === 'remote' || client.role === 'scanner')) {
            client.send(JSON.stringify({
                type: 'command',
                data: command
            }));
        }
    });
};

const sendMessage = (sessionID, type, data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && (client.role === 'remote' || client.role === 'listener') ) {
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
    ws.settings = {};

    ws.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage);

        if (message.type === 'pong') {
            ws.isAlive = true;

            return;
        }

        if (message.type !== 'debug') {
            console.log(message);
        }

        if (message.type === 'connect') {
            if (!message.sessionID) {
                console.log('No connect session ID provided; dropping message', message);
                return;
            }
            ws.sessionID = message.sessionID;
            ws.role = message.role || 'remote';

            if (message.role === 'listener') {
                let values = false;
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client.sessionID === ws.sessionID && client.role === 'scanner' ) {
                        values = client.settings;
                    }
                });
                if (values) {
                    ws.send(JSON.stringify({
                        type: 'scannerValues',
                        data: values
                    }));
                }
                sendCommand(ws.sessionID, 'log-history');
            }
            return;
        }

        const sessionID = message.sessionID || ws.sessionID;
        if (!sessionID) {
            console.log('No session ID set, dropping message', message);
            return;
        }

        if (message.type === 'command') {
            if (ws.role !== 'remote' && message.password != process.env.WS_PASSWORD) {
                sendMessage(sessionID, 'debug', 'Access denied');
                return;
            }
            sendCommand(sessionID, message.data);

            return;
        }

        if (message.type === 'debug') {
            sendMessage(sessionID, 'debug', message.data);

            return;
        }

        if (message.type === 'setValues') {
            let values = false;
            if (ws.role === 'scanner') {
                ws.settings = {
                    ...ws.settings,
                    ...message.data
                };
                values = ws.settings;
            } else {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && client.role === 'scanner' ) {
                        client.settings = {
                            ...client.settings,
                            ...message.data
                        };
                        values = client.settings;
                    }
                });
            }
            if (!values) {
                console.log(`Could not find ${sessionID} scanner to set values`);
                return;
            }
            console.log(`${sessionID} (${ws.role}): set values ${JSON.stringify(message.data, null, 4)}`);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && client.role === 'listener' ) {
                    client.send(JSON.stringify({
                        type: 'scannerValues',
                        data: values
                    }));
                    console.log(`sent scannerValues message to ${sessionID} listener`);
                }
            });

            return;
        }

        if (message.type === 'getValue') {
            let theValue = false;
            if (ws.role === 'scanner') {
                theValue = ws.settings[message.data.name];
            } else {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && client.role === 'scanner' ) {
                        theValue = client.settings[message.data.name];
                    }
                });
            }
            ws.send(JSON.stringify({
                type: 'scannerValue',
                data: theValue,
            }));
            console.log(`${sessionID} (${ws.role}): sent ${message.data.name} value ${theValue}`);

            return;
        }

        if (message.type === 'getValues') {
            let theValues = false;
            if (ws.role === 'scanner') {
                theValues = ws.settings;
            } else {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && client.role === 'scanner' ) {
                        theValues = client.settings;
                    }
                });
            }
            ws.send(JSON.stringify({
                type: 'scannerValues',
                data: theValues,
            }));
            console.log(`${sessionID} (${ws.role}): sent values ${theValues}`);

            return;
        }

        if (message.type === 'logHistory') {
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID && client.role === 'listener' ) {
                    client.send(JSON.stringify({
                        type: 'logHistory',
                        data: message.data
                    }));
                }
            });
        }
    });
});

wss.on('close', () => {
    clearInterval(pingInterval);
});
