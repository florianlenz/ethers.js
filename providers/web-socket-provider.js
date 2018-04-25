'use strict';

// See: https://github.com/ethereum/wiki/wiki/JSON-RPC

var Provider = require('./json-rpc-provider.js');
var WebSocket = require('ws');
var EventEmitter = require('events');
var uid = require('unique-string');

var utils = (function() {
    return {
        defineProperty: require('../utils/properties').defineProperty
    }
})();

function getResult(payload) {
    if (payload.error) {
        var error = new Error(payload.error.message);
        error.code = payload.error.code;
        error.data = payload.error.data;
        throw error;
    }

    return payload.result;
}

function WebSocketProvider(url, network) {
    if (!(this instanceof WebSocketProvider)) { throw new Error('missing new'); }
    var self = this;

    if (arguments.lengt == 1) {
        if (typeof(url) === 'string') {
            try {
                network = Provider.getNetwork(url);
                url = null;
            } catch (error) { }
        } else {
            network = url;
            url = null;
        }
    }

    Provider.call(this, url, network);

    utils.defineProperty(this, 'eventEmitter', new EventEmitter());


    function webSocket() {
        return new Promise(function (res, rej) {

            var ws = new WebSocket(url);

            ws.on('error', function (err) {
                throw err;
            });
            ws.on('close', function () {

                console.log("closed websocket - try to reconnect");
                WebSocketProvider.prototype.webSocketPromise = webSocket();

            });

            ws.on('open', function () {
                console.log("connected");
                res(ws)
            });

            ws.on('message', function (message) {
                var msg = JSON.parse(message);
                self.eventEmitter.emit(msg.id, message);
            });

        })
    }

    WebSocketProvider.prototype.webSocketPromise = webSocket();

}
Provider.inherits(WebSocketProvider);

WebSocketProvider.prototype.rpcRequestCount = 0;

utils.defineProperty(WebSocketProvider.prototype, 'fetchJSON', function (webSocketPromise, json, processFunc) {
    var self = this;
    return new Promise(function (res, rej) {

        json.id = uid();

        self
            .webSocketPromise
            .then(function (webSocket) {

                //Event handler for event emitter
                var eventHandler = function (data) {
                    //Remove event listener to keep the amount low
                    self.eventEmitter.removeListener(json.id, eventHandler);
                    res(getResult(JSON.parse(data)))
                };

                self.eventEmitter.on(json.id, eventHandler);
                webSocket.send(JSON.stringify(json))
            })
            .catch(rej);
    })
});

utils.defineProperty(WebSocketProvider.prototype, 'send', function(method, params) {
    var request = {
        method: method,
        params: params,
        jsonrpc: "2.0"
    };
    return this.fetchJSON(this.webSocketPromise, request, getResult);
});

module.exports = WebSocketProvider;
