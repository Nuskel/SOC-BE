const net = require('net');
const https = require('https');
const fs = require('fs');

// Disable Logging:
//  console.log = (x) => {};

/* Constants */

const CONFIG_FILE_NAME = "config.json";
const SSL_KEY_FILE = "key.pem";
const SSL_CERT_FILE = "cert.pem";

const PORT = 9001;
const MONITOR_PORT = 1515;

const HANDLER_TYPE_MONITOR = "monitor";

/* Runtime variables */

let config = {};
let devices = {};
let commands = {};
let handlers = {};

/* Setup the environment with config and SSL-keys. */

function readConfig(configName) {
	let cfgData = fs.readFileSync(configName).toString("UTF-8");
	let config = JSON.parse(cfgData);

	devices = config["devices"];
	commands = config["commands"];

	console.log("Read config .. done");
	console.log("Registered devices:", devices);
	console.log("Registered commands:", commands);

	return config;
}

function validateConfig(config) {
	if (!config) {
		console.log("[VAl] failed - config is missing");

		return false;
	}

	// TODO: Use JSON Validator ...

	return true;
}

function readCertificate() {
	let options = {
		key: fs.readFileSync(SSL_KEY_FILE),
		cert: fs.readFileSync(SSL_CERT_FILE)
	};

	console.log("Read certificate and key .. done");

	return options;
}

/* Devices and configuration. */

function setupHandlers() {
	// Handler for screen commands
	handlers[HANDLER_TYPE_MONITOR] = async (device, command, option, args, body) => {
		// Config should have been validated so these values must be fine
		const monitor = device["id"];
		const ip = device["ip"];
		const id = command["id"];

		let values = [];

		if (body !== undefined) {
			values = [];
		}

		console.log(` << ${ monitor }@${ ip }:${ MONITOR_PORT } $ ${ id }`);

		const result = await fakeExecute(monitor, id, values);

		console.log(` >> ${ monitor }@${ ip }:${ MONITOR_PORT } >`, result);

		return result;
	};

	console.log("Set up handlers:", HANDLER_TYPE_MONITOR);
}

/* Setup and initialize the server. */

function setupServer(options) {

	/**
	 *
	 * @param req {IncomingMessage}
	 * @returns {{ip: string, method: 'GET'|'POST', device: string, url: string, cmd: string, option?: string, args?: string} | null}
	 */
	function parseRequest(req) {
		const method = req.method;
		const url = req.url;

		/* Regex-Groups:
		 *  /{device}[/{cmd}][?{option}[={args}]
		 *
		 *  device: [\w-]+ | required!
		 *  cmd: [\w]+
		 *  option: [\w]+
		 *  args: [\w,]+
		 *
		 */
		//                  /     {device}    [ /   {cmd}   ] [ ?   {option}   [=     {args}     ]  ]
		const URL_REGEX = /\/(?<device>[\w-]+)(\/(?<cmd>\w+))?(\?(?<option>\w+)(=(?<args>([\w,]+))?))?/;
		const urlParsed = url.match(URL_REGEX) || { groups: {} };

		return {
			ip: req.socket.remoteAddress,
			url,
			method,
			device: urlParsed.groups.device,
			cmd: urlParsed.groups.cmd,
			option: urlParsed.groups.option,
			args: urlParsed.groups.args
		};
	}

	async function handleRequest(body, req, res) {

		/**
		 * Write code as the HTTP status with a descripted error message.
		 *
		 * @param code {number} Http status code
		 * @param descritpion {string} Http error description
		 */
		function respondError(code, descritpion) {
			console.log(`(${ req.socket.remoteAddress }) [ERROR ${ code }] ${ descritpion }`);

			res.writeHead(code, descritpion);
			res.end();
		}

		/**
		 *
		 * @param code
		 * @param content
		 * @param type {string?}
		 */
		function respondResult(code, content, type) {
			console.log(`(${ req.socket.remoteAddress }) [RESULT ${ code }]`, content);

			res.writeHead(code, {"Content-Type": type || "text/plain", "Access-Control-Allow-Origin": "*"});
			res.end(content);
		}

		/**********************************
		 *
		 **********************************/

		const request = parseRequest(req);

		console.log("REQ", request);

		// Ignore
		if (request.method === "OPTIONS") {
			// TODO: FIX
			res.writeHead(200, "ABC", {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"});
			res.end();

			return;
		}

		if (request.method !== "GET" && request.method !== "POST") {
			return respondError(400, `Unsupported method: ${ request.method }`);
		}

		const device = devices[request.device];

		if (!device) {
			return respondError(405, `Unknown device: ${ request.device }`);
		}

		if (request.device === "config") {
			const toExport = config;

			if (request.option !== undefined) {
				delete toExport[commands];

				for (let key of Object.keys(toExport.devices)) {
					if (key !== request.option) {
						delete toExport[key];
					}
				}
			}

			setTimeout(() => {
				respondResult(200, JSON.stringify(toExport), "application/json");
			}, 2000);

			return;
		}

		const handler = device["type"];

		if (handlers[handler] === undefined) {
			return respondError(405, `Type "${ handler }" has no handler`);
		}

		const command = commands[handler][request.cmd];

		if (!command) {
			return respondError(405, `Unknown command: ${ request.cmd }`);
		}

		let result = {};

		if (request.method === 'GET') {
			console.log(`(${ request.ip }) ${ request.method } ${ request.device } ${ request.cmd }`);

			result = await handlers[handler](device, command, request.option, request.args);
		} else if (request.method === 'POST') {
			const cmdAllowed = command["values"];
			const commandBody = body.toString();

			// Check for undefined since index 0 would be true on !.. check
			if (cmdAllowed.find(x => `${ x }` === commandBody) === undefined) {
				return respondError(405, `Unknown request body: ${ commandBody } - must be one of [${ cmdAllowed }]`);
			}

			console.log(`(${ request.ip }) ${ request.method } ${ request.device } ${ request.cmd } ${ commandBody }`);

			result = await handlers[handler](device, command, request.option, request.args);
		}

		return respondResult(200, result);
	}

	return https.createServer(options, (req, res) => {
		let chunks = [];

		// Collect all body chunks (on large data)
		req.on('data', chunk => chunks.push(chunk));

		// When body was sent fully and request is done handle the request as its whole
		req.on('end', () => handleRequest(chunks, req, res).catch(x => console.log("Caught exception while handling request:\n", x)));
	});
}

function startServer(server, port) {
	server.listen(port, '0.0.0.0', () => {
		console.log("Video Wall BE is now running on port " + port);	
	});
}

/* Run */

function start() {
	config = readConfig(CONFIG_FILE_NAME);

	if (validateConfig(config)) {
		const options = readCertificate();
		const server = setupServer(options);

		setupHandlers();
		startServer(server, PORT);
	} else {
		console.log("[ERROR] Failed to validate config! See log above.");
	}
}

start();

/*

var HOST = '192.168.35.161';
var PORT = 1515;

// Get Power State 01: [0xAA, 0x11, 0x01, 0x00, 0x12]
// Set Power State 01: [0xAA, 0x11, 0x01, 0x01, 0x13]
// Turn Power Off 01:  [0xAA, 0x11, 0x01, 0x01, 0x00, 0x13]
// Turn Power On 01:   [0xAA, 0x11, 0x01, 0x01, 0x01, 0x14]

var bytes = [0xAA, 0x11, 0x01, 0x01, 0x00, 0x13]; //[0xAA, 0x00, 0x01, 0x00, 0x01]; //[0xAA, 0xFF, 0x01, 0x01, 0x00, 0x14];
var hexVal = new Uint8Array(bytes);

var client = new net.Socket();
client.connect(PORT, HOST, function(e) {
    console.log('CONNECTED TO: ' + HOST + ':' + PORT);
    // client.write(hexVal);
});

client.on('data', function(data) { // 'data' is an event handler for the client socket, what the server sent
    console.log('>', data);
    client.destroy(); // Close the client socket completely

});

// Add a 'close' event handler for the client socket
client.on('close', function() {
    console.log('Connection closed');
});
*/

function checksum(id, command, values) {
  let len = values ? values.length : 0;
  let checksum = id + len + command;

  (values || []).forEach(v => checksum += v);

  return checksum;
}

/**
 *
 * @param id
 * @param command
 * @param values
 * @returns {Promise<string>}
 */
function fakeExecute(id, command, values) {
	const c = checksum(id, command, values);
	const len = values ? values.length : 0;
	const host = '192.168.35.16' + id;
	const port = 1515;

	let bytes = [0xAA, command, id, len];
	(values || []).forEach(v => bytes.push(v));

	bytes.push(c);

	const payload = new Uint8Array(bytes);

	console.log(`   Checksum:`, c);
	console.log(`   Payload:`, payload);

	return new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve("Result");
		}, 2000);
	});
}

function execute(id, command, values, res) {
  const c = checksum(id, command, values);
  const len = values ? values.length : 0;
  const host = '192.168.35.16' + id;
  const port = 1515;

  let bytes = [0xAA, command, id, len];
  (values || []).forEach(v => bytes.push(v));

  bytes.push(c);

  const payload = new Uint8Array(bytes);

  const client = new net.Socket();
  client.connect(1515, '192.168.35.16' + id, () => {
    console.log("Connected to Screen " + id);
    console.log("<", payload);
    client.write(payload);
  });	

  client.on('data', function (data) {
    console.log(">", data);
    res(data);
    client.destroy();
  });	  
}
