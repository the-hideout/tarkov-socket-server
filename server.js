const WebSocket = require('ws');

const wss = new WebSocket.Server({
    port: process.env.PORT || 8080,
});

const sendCommand = (sessionID, command) => {
    wss.clients.forEach((client) => {        
        if (client.readyState === WebSocket.OPEN && client.sessionID === sessionID ) {
            client.send(JSON.stringify({
                type: 'command',
                data: command,
            }));
        }
    });
};

const pingInterval = setInterval(() => {
    wss.clients.forEach((client) => {
        if (client.isAlive === false) {
            return client.terminate();
        }

        client.isAlive = false;
        client.send(JSON.stringify({type: 'ping'}));
    });
}, 5000);
 
wss.on('connection', (ws) => {
    ws.isAlive = true;
    
    ws.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage);
        
        
        if(message.type === 'pong'){
            ws.isAlive = true;
            
            return true;
        }
        
        console.log(message);
        
        if(message.type === 'connect'){
            ws.sessionID = message.sessionID;
            
            return true;
        }
        
        if(message.type === 'command'){
            sendCommand(message.sessionID, message.data);
            
            return true;
        }
    });
});

wss.on('close', function close() {
    clearInterval(pingInterval);
});
