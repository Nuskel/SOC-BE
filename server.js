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

/* Runtime variables */

let devices = {};
let commands = {};

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

function readCertificate() {
	let options = {
		key: fs.readFileSync(SSL_KEY_FILE),
		cert: fs.readFileSync(SSL_CERT_FILE)
	};

	console.log("Read certificate and key .. done");

	return options;
}

/* Devices and configuration. */

/* Setup and initialize the server. */

function setupServer(options) {

	/**
	 *
	 * @param req {IncomingMessage}
	 * @returns {{ip: string, method: 'GET'|'POST', device: string, url: string, cmd: string} | null}
	 */
	function parseRequest(req) {
		const method = req.method;
		const url = req.url;

		/* Regex-Groups:
		 *  /{device}/{cmd}[?{option}[={args}]
		 *
		 *  device: [\w-]+
		 *  cmd: [\w]+
		 *  option: [\w]+
		 *  args: [\w,]+
		 *
		 */
		//                  /     {device}     /   {cmd}   [ ?   {option}   [=     {args}     ]  ]
		const URL_REGEX = /\/(?<device>[\w-]+)\/(?<cmd>\w+)(\?(?<option>\w+)(=(?<args>([\w,]+))?))?/;
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

	function handleRequest(body, req, res) {

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

		const request = parseRequest(req);

		if (request.method !== "GET" && request.method !== "POST") {
			return respondError(400, `Unsupported method: ${ request.method }`);
		}

		const device = devices[request.device];

		if (!device) {
			return respondError(405, `Unknown device: ${ request.device }`);
		}

		const command = commands[request.cmd];

		if (!command) {
			return respondError(405, `Unknown command: ${ request.cmd }`);
		}

		if (request.method === 'GET') {
			const monitor = device["id"];
			const name = device["name"];
			const ip = device["ip"];
			const cmdId = command["id"];

			console.log(`(${ request.ip }) ${ request.method } ${ request.device } ${ request.cmd }`);
			console.log(` << ${ monitor }@${ ip }:${ MONITOR_PORT } $ ${ cmdId }`);

			fakeExecute(monitor, cmdId, [], (val) => {
				console.log(` >> ${ monitor }@${ ip }:${ MONITOR_PORT } >`, val);
			});
		} else if (request.method === 'POST') {
			const monitor = device["id"];
			const name = device["name"];
			const ip = device["ip"];
			const cmdId = command["id"];
			const cmdAllowed = command["values"];

			const commandArgs = body.toString();

			// Check for undefined since index 0 would be true on !.. check
			if (cmdAllowed.find(x => `${ x }` === commandArgs) === undefined) {
				return respondError(405, `Unknown request body: ${ commandArgs } - must be one of [${ cmdAllowed }]`);
			}

			console.log(`(${ request.ip }) ${ request.method } ${ request.device } ${ request.cmd } ${ commandArgs }`);
			console.log(` << ${ monitor }@${ ip }:${ MONITOR_PORT } $ ${ cmdId } ..`, commandArgs);

			fakeExecute(monitor, cmdId, [], (val) => {
				console.log(` >> ${ monitor }@${ ip }:${ MONITOR_PORT } >`, val);

				res.writeHead(200);
				res.end("Result");
			});
		}
	}

	return https.createServer(options, (req, res) => {
		let chunks = [];

		// Collect all body chunks (on large data)
		req.on('data', chunk => chunks.push(chunk));

		// When body was sent fully and request is done handle the request as its whole
		req.on('end', () => handleRequest(chunks, req, res));

		/*

		console.log(req);
		console.log(`[${ method }] ${ url }`);	

		const id = parseInt(url.split('?')[0], 16);
		const call = url.split('?')[1];

		let cmd;
		let value;
		let values;	

		console.log(` -id=${ id } -call=${ call }`);

		if (call.includes("=")) {
			cmd = parseInt(call.split('=')[0], 16);
			value = call.split('=')[1];
			values = [];

			if (value.includes(",")) {
				values = value.split(',').map(x => parseInt(x, 16));
			} else {
				values = [parseInt(value, 16)];
			}

			console.log(` -cmd=${ cmd } -values=${ values }`);
		} else {
			cmd = parseInt(call, 16);

			console.log(` -cmd=${ cmd } --noargs`);
		}

		//console.log("Id:", id, "Command:", cmd, "Values:", values);
		
		execute(id, cmd, values, (data) => {
			const ack = data[4] === 0x41;

			if (!ack) {
				console.log("[ERROR] Request returned not with ACK (errcode: " + data[4] + ")");

				res.writeHead(500);
				res.end("ERR_" + data[6]);
			} else {
				console.log("Ack > Command:", data[5], "Result:", data[6]);

				// TODO: check that data length (data[3]) > 0)
				
				res.writeHead(200);
				res.end("ACK_" + data[6]);	    
			}
		});

		 */
	});
}

function startServer(server, port) {
	server.listen(port, '0.0.0.0', () => {
		console.log("Video Wall BE is now running on port " + port);	
	});
}

/* Run */

function start() {
	const config = readConfig(CONFIG_FILE_NAME);
	const options = readCertificate();
	const server = setupServer(options);
	
	startServer(server, PORT);
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

function fakeExecute(id, command, values, res) {
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

	res("Result");
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
