var net = require('net');
const https = require('https');
const fs = require('fs');

/* Constants */

const CONFIG_FILE_NAME = "config.json";
const SSL_KEY_FILE = "key.pem";
const SSL_CERT_FILE = "cert.pem";

const PORT = 9001;

/* Setup the environment with config and SSL-keys. */

function readConfig(configName) {
	let cfgData = fs.readFileSync(configName);
	let config = JSON.parse(cfgData);

	console.log("Read config .. done");

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

/* Setup and initialize the server. */

function setupServer(options) {
	const server = https.createServer(options, (req, res) => {
		const method = req.method; // GET, ...
		const url = req.url.substring(1); // initial '/'

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
	});

	return server;
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
