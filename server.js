const net = require('net');
const https = require('https');
const fs = require('fs');

const HOME = "/home/dummy/SOC-BE/";
const telnet = require(HOME + 'telnet-client');

// Disable Logging:
//  console.log = (x) => {};

/* Constants */

const CONFIG_FILE_NAME 	= HOME + "config.json";
const SSL_KEY_FILE 		= HOME + "key.pem";
const SSL_CERT_FILE 	= HOME + "cert.pem";

const PORT = 9001;
const MONITOR_PORT = 1515;

// config internal mapping

const SCOPE_CONFIG = "config";
const SCOPE_DEVICES = "devices";
const SCOPE_VIDEOWALL = "videowall";

const TYPE_MONITOR = "monitor";

/* Classes */

class Error {
	_cause = undefined;
	_status = 500;

	constructor(status, cause) {
		this._cause = cause;
		this._status = status || 500;
	}

	get cause() { return this._cause; }
	get status() { return this._status; }
}

/* Runtime variables */

let config = {};
let scopes = {};
let devices = {};
let commands = {};
let handlers = {};

const sources = {
	"dvi": {
		name: "DVI",
		id: '0x18',
	},
	"input_source": {
		name: "Input Source",
		id: '0x0C'
	},
	"magic_info": {
		name: "Magic Info",
		id: '0x20'
	},
	"dvi_video": {
		name: "DVI Video",
		id: '0x1F'
	},
	"hdmi1": {
		name: "HDMI 1",
		id: '0x21'
	},
	"hdmi1_pc": {
		name: "HDMI 1 PC",
		id: '0x22'
	},
	"hdmi2": {
		name: "HDMI 2",
		id: '0x23'
	},
	"hdmi2_pc": {
		name: "HDMI 2 PC",
		id: '0x24'
	},
	"display_port": {
		name: "Display Port",
		id: '0x25'
	}
};

/* UTIL */

/**
 * Returns the device for name configured by the config.
 *
 * @param type Device type
 * @param attribute Device attribute
 * @param value Match expression
 * @returns {null|[string, unknown]} null or [device name, {object}]
 */
function findDevice(type, attribute, value) {
	for (const d of Object.entries(devices)) {
		if (d[1].type === type && d[1][attribute] === value)
			return d;
	}

	return null;
}

/**
 * Returns, if existing, the value of an attribute of an object
 * when the given predicate (check) is successfull.
 *
 * @param object Object
 * @param attribute Attribute name
 * @param check Predicate applied on the found attribute
 * @returns {null|[string, unknown]} null or [atribute name, {object}]
 */
function findByAttribute(object, attribute, check) {
	for (const d of Object.entries(object)) {
		if (check(d[1][attribute])) {
			return d;
		}
	}

	return null;
}

/* Setup the environment with config and SSL-keys. */

/* Config Layout:
 *  - devices
 *  - commands
 *  - control
 *
 * Structure:
 *
 *  0 - scope (devices, commands, control)
 *   1 - type (
 */

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

/**
 * Checks the integrity of the configuration file.
 *
 * @param config
 * @returns {boolean}
 */
function validateConfig(config) {
	let validated = true;

	function assert(x, msg) {
		if (!x) {
			if (msg) {
				console.log("[VAL] failed -", msg);
			} else {
				console.log("[VAL] failed due to an unknown error");
			}

			validated = false;
		}
	}

	if (!config) {
		console.log("[VAl] failed - config is missing");

		return false;
	}

	const _devices = Object.entries(devices);

	for (const d of _devices) {
		// mandatory fields
		if (d[1].type === "monitor" || d[1].type === "client") {
			assert(d[1].index !== undefined, "Missing 'index' attribute in device '" + d[0] + "'");
		}
	}

	// TODO: Use JSON Validator ...

	return validated;
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

function readOptAndArg(url, setScope = undefined) {
	let URL_REGEX;

	if (!setScope) {
		URL_REGEX = /\/(?<scope>\w+)(\?(?<option>\w+)(=(?<args>([\w,]+))?)?)?/;
	} else {
		URL_REGEX = /(\?(?<option>\w+)(=(?<args>([\w,]+))?)?)/;
	}
	
	const urlParsed = url.match(URL_REGEX) || { groups: {} };

	return {
		scope: setScope || urlParsed.groups.scope,
		option: urlParsed.groups.option,
		args: urlParsed.groups.args
	};
}


async function execDevice(device, command, option, args, body) {
	// Config should have been validated so these values must be fine
	const monitor = device["id"];
	const ip = device["ip"];
	const id = parseInt(command["id"], 16);

	let values = [];

	if (body !== undefined) {
		if (!body.includes(",")) {
			values = [parseInt(body, 16)];

			console.log("single value", body, values);
		} else {
			values = body.split(",").map(val => parseInt(val, 16));

			console.log("multiple values", body, values);
		}
	}

	console.log(` << ${ monitor }@${ ip }:${ MONITOR_PORT } $ ${ id }`);

	const result = await execute(ip, monitor, id, values);
	
	if (!result) {
		throw new Error(408 /* Request Timeout */, "Received no response from the device - timeout");
	}

	const ack = result[4] == 41; // compare with ==

	console.log(` >> ${ monitor }@${ ip }:${ MONITOR_PORT } >`, result, 'ACK:', ack, 'Response:', result[6]);

	return result[6];
}

function setupScopes() {
	scopes[SCOPE_CONFIG] = {
		parseUrl: (url) => {
			return readOptAndArg(url, SCOPE_CONFIG);
		},
		handleRequest: async (request, body) => {
			let toExport = {};

			if (request.option !== undefined) {
				toExport = config[request.option];
			}

			return new Promise((r, o) => {
				setTimeout(() => {
					console.log("Config", toExport);

					r(JSON.stringify(toExport));
				}, 10);
			});
		}
	};

	scopes[SCOPE_VIDEOWALL] = {
		parseUrl: (url) => {
			return readOptAndArg(url, SCOPE_VIDEOWALL);
		},
		handleRequest: async (request, body) => {
			body = body.toString();

			const rows = body.split(";");
			let success = true;

			let height = 0;
			let width = 0;

			for (const row of rows) {
				const columns = row.split(",").length;

				// count only non-empty columns
				if (columns) {
					height++;
				}

				if (columns > width) {
					width = columns;
				}
			}

			const pattern = `${ width}${ height }`;

			for (let r = 0; r < rows.length; r++) {
				const cols = rows[r].split(",");
				
				for (let c = 0; c < cols.length; c++) {
					const index = 1 + r * cols.length + c;

					// ignore empty
					if (!cols[c]) {
						continue;
					}

					const device = devices[cols[c]];

					if (!device) {
						throw new Error(400, `Unknown device ${ request.device }`);
					}

					if (device.type !== TYPE_MONITOR) {
						throw new Error(400, `Invalid device type ${ device.type }. Expected: monitor`);
					}

					const toggle = commands[TYPE_MONITOR]["videowall_toggle"];
					const cmd = commands[TYPE_MONITOR]["videowall_set"];

					console.log(`Videowall ${ cols[c] } -> ${ pattern },${ index }`);

					let mode = await execDevice(device, toggle, request.options, request.args, "1"); // toggle video wall mode on
					let cfg = await execDevice(device, cmd, request.options, request.args, `${ pattern },${ index }`);
			
					// TODO: success = success && ...
				}
			}

			return new Promise((res, rej) => res(success));
		}
	};

	scopes[SCOPE_DEVICES] = {
		parseUrl: (url) => {
			/* Regex-Groups:
			 *  /{device}[/{cmd}][?{option}[={args}]
			 *
			 *  device: [\w-]+ | required!
			 *  cmd: [\w]+
			 *  option: [\w]+
			 *  args: [\w,]+
			 *
			 */
			//                 [ /    {device}     ] [ /   {cmd}   ] [ ?   {option}   [=     {args}     ]  ]
			const URL_REGEX = /(\/(?<device>[\w-]+))?(\/(?<cmd>\w+))?(\?(?<option>\w+)(=(?<args>([\w,]+))?)?)?/;
			const urlParsed = url.match(URL_REGEX) || { groups: {} };

			return {
				device: urlParsed.groups.device,
				cmd: urlParsed.groups.cmd,
				option: urlParsed.groups.option,
				args: urlParsed.groups.args
			};
		},
		handleRequest: async (request, body) => {
			const device = devices[request.device];

			if (!device) {
				throw new Error(404, `Unknown device: ${ request.device }`);
			}

			const handler = device["type"];

			if (handlers[handler] === undefined) {
				throw new Error(405, `Type "${ handler }" has no handler`);
			}

			// No commands sent: return status of monitor
			// TODO: only on GET
			if (!request.cmd && handler === TYPE_MONITOR) {
				/* Currently supported:
				 *  - power
				 *  - source
				 *  - switch connection
				 *  - videowall state
				 */

				const power = await handlers[handler](device, commands[handler]["power"], request.option, request.args);
				const source = await handlers[handler](device, commands[handler]["source"], request.option, request.args);
				const videowall = await handlers[handler](device, commands[handler]["videowall_toggle"], request.option, request.args);

				const src = findByAttribute(sources, 'id', (id) => parseInt(id, 16) == source) || [source];

				// Switch state
				const pcIn = await telnet.readOut(device.index);
				const client = findDevice("client", "index", pcIn);

				const clientId = client ? client[0] : null;

				return JSON.stringify(
					{
						power,
						source: src[0],
						desktop: clientId,
						videowall
					}
				);
			}

			const command = commands[handler][request.cmd];

			if (!command) {
				throw new Error(405, `Unknown command: ${ request.cmd }`);
			}

			let result = {};

			if (request.method === 'GET') {
				console.log(`(${ request.ip }) ${ request.method } ${ request.device } ${ request.cmd }`);

				result = await handlers[handler](device, command, request.option, request.args);

				if (request.cmd === "source") {
					result = (findByAttribute(sources, 'id', (id) => parseInt(id, 16) === result) || [result])[0];
				}
			} else if (request.method === 'POST') {
				const cmdAllowed = command["values"];
				const commandBody = body.toString();

				// Check for undefined since index 0 would be true on !.. check
				if (cmdAllowed && cmdAllowed.find(x => `${ x }` === commandBody) === undefined) {
					throw new Error(400, `Unknown request body: ${ commandBody } - must be one of [${ cmdAllowed }]`);
				}

				console.log(`(${ request.ip }) ${ request.method } ${ request.device } ${ request.cmd } <${ commandBody }>`);

				if (request.cmd === "source") {
					const source = sources[commandBody];

					if (!source) {
						throw new Error(400, `Unknown source '${ source }' - must be one of ${ Object.keys(sources) }`);
					}

					result = await handlers[handler](device, command, request.option, request.args, source.id);
					result = (findByAttribute(sources, 'id', (id) => parseInt(id, 16) === result) || [result])[0];
				} else {
					result = await handlers[handler](device, command, request.option, request.args, commandBody);
				}
			}

			return result;
		}
	};
}

function setupHandlers() {
	// Handler for screen commands
	handlers[TYPE_MONITOR] = execDevice; /*async (device, command, option, args, body) => {
		// Config should have been validated so these values must be fine
		const monitor = device["id"];
		const ip = device["ip"];
		const id = parseInt(command["id"], 16);

		let values = [];

		if (body !== undefined) {
			values = [parseInt(body, 16)];
		}

		console.log(` << ${ monitor }@${ ip }:${ MONITOR_PORT } $ ${ id }`);

		const result = await execute(ip, monitor, id, values);
		
		if (!result) {
			throw new Error(408 /* Request Timeout *//*, "Received no response from the device - timeout");
		}

		const ack = result[4] == 41; // compare with ==

		console.log(` >> ${ monitor }@${ ip }:${ MONITOR_PORT } >`, result, 'ACK:', ack, 'Response:', result[6]);

		return result[6];
	};*/

	handlers["switch"] = async (device, command, option, args, body) => {
		const cmd = command["id"];

		if (cmd === "state") {
			// return switch state

			const extState = await telnet.getState(); // switch connection matrix
			let state = [];

			console.log("[Switch] State:", extState);

			// transform indices to names
			for (let target = 0, source = 1; target < extState.length; target++) {
				source = extState[target];

				const _src = findDevice("client", "index", source);
				const _target = findDevice("monitor", "index", target + 1);

				state.push([_src ? _src[0] : null, _target ? _target[0] : null]);
			}

			return JSON.stringify(state);
		} else if (cmd === "bind") {
			// bind an input desktop to output monitor

			const pair = body.split(",");

			if (!pair || pair.length !== 2) {
				throw new Error(400, `Bind format must be '{source},{target}' using the device name`);
			}

			const source = devices[pair[0]];
			const target = devices[pair[1]];

			if (!source) {
				throw new Error(400, `Unknown source device '${ pair[0] }'`);
			}

			if (!target) {
				throw new Error(400, `Unknwon target device ${ pair[1] }`);
			}

			if ((source.type === "client" || source.type === "ext-client") && target.type === "monitor") {
				const sourceCmd = commands[TYPE_MONITOR]["source"];

				if (!sourceCmd) {
					throw new Error(500, `Configuration error: 'source' command missing on device type '${ TYPE_MONITOR }'`);
				}

				let selSource = undefined;

				
				if (source.type === "ext-client") {
					if (!source.source) {
						throw new Error(500, `Device is missing the 'source' field. External clients have to define them.`);
					} else {
						selSource = source.source;	
					}
				} else if (source.type === "client") {
					// TODO use state value
					if (!target["main-source"]) {
						throw new Error(500, `Target device is missing the 'main-source' field.`);
					} else {
						selSource = target["main-source"];
					}
				}

				if (!selSource) {
					throw new Error(500, `Could not identify source to set.}`);
				}

				const devSource = sources[selSource];

				if (!devSource) {
					throw new Error(500, `Configuration error: source '${ source.source }' for client is unknown.`);
				}

				console.log(`Binding an external client via source: ${ pair[0] } -> ${ pair[1] } @ source: ${ devSource }`);

				const current = await execDevice(target, sourceCmd, option, args);

				// only change input if current source is not the desired
				if (parseInt(devSource.id, 16) !== current) {
					const res = await execDevice(target, sourceCmd, option, args, devSource.id);
				}

				if (source.type === "ext-client") {
					return true;
				}
			}

			if (source.index === undefined) {
				throw new Error(500, `Invalid server configuration: missing 'index' attribute on source`);
			}

			if (!target) {
				throw new Error(400, `Unknown target device '${ pair[1] }'`);
			}

			if (target.index === undefined) {
				throw new Error(500, `Invalid server configuration: missing 'index' attribute on target`);
			}

			console.log(` [Switch] Bind ${ source.index }->${ target.index }`);

			// request switch via telnet
			const res = await telnet.set(source.index, target.index);

			console.log(` [Switch] Binding ${ res ? 'succeeded' : 'failed' }`)

			if (!res) {
				throw new Error(500, "Telnet server could not switch the binding.");
			}

			return res;
		}

		return "1"; // per default send "1" as response
	};

	console.log("Set up handlers:", TYPE_MONITOR);
}

/* Setup and initialize the server. */

function setupServer(options) {

	/**
	 * Read the incoming request and filter certain field. Furthermore the
	 * provided scope can provide additional fields.
	 *
	 * @param req
	 * @returns {{method: string, ip: string, url: string, scope: string, ...values by scope}}
	 */
	function parseRequest(req) {
		const method = req.method;
		let url = req.url;

		// A url base to which all requests are relative to.
		const BASE = "/api/v1";

		if (!url.startsWith(BASE)) {
			throw new Error(400, `Invalid request URL: must start with '${ BASE }'`);
		} else {
			url = url.substr(BASE.length);
		}

		let parsed = readOptAndArg(url);
		//url = url.substr(parsed.scope.length + 1); // remove scope from url + tailing /

		if (!parsed.scope) {
			throw new Error(400, `A scope is required: '${ BASE }/{scope}'`);
		}

		url = url.substr(parsed.scope.length + 1);

		const scopeName = parsed.scope;
		const scope = scopes[parsed.scope];

		if (!scope) {
			throw new Error(404, `Unknown scope: ${ parsed.scope }`);
		}

		parsed = scope.parseUrl(url) || parsed;

		return {
			ip: req.socket.remoteAddress,
			url,
			method,
			scope: scopeName,
			...parsed
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
			res.end(`${ content }`);
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
			return respondError(405, `Unsupported method: ${ request.method }`);
		}

		const scope = request.scope;
		const result = await scopes[scope].handleRequest(request, body);

		console.log("Result", result);

		return respondResult(200, result, "application/json");
	}

	return https.createServer(options, (req, res) => {
		let chunks = [];

		// Collect all body chunks (on large data)
		req.on('data', chunk => chunks.push(chunk));

		// When body was sent fully and request is done handle the request as its whole
		req.on('end', () => handleRequest(chunks, req, res).catch(x => {
			console.log("Caught exception while handling request:");

			if (x.status !== undefined) {
				console.log("", `[${ x.status }]`, x.cause);
			} else {
				console.log(x);
			}

			res.writeHead(x.status || 500);
			res.end(`${ x.cause }`);
		}));
	});
}

function startServer(server, port) {
	server.listen(port, '0.0.0.0', () => {
		console.log("Video Wall BE is now running on port " + port);	
	});
}

/* Run */

async function start() {
	config = readConfig(CONFIG_FILE_NAME);

	if (validateConfig(config)) {
		const options = readCertificate();
		const server = setupServer(options);

		let setupTelnet = await telnet.connect();

		if (!setupTelnet) {
			console.error("Failed startup: Telnet-Client did not start.");

			return;
		}

		setupScopes();
		setupHandlers();
		startServer(server, PORT);
	} else {
		console.log("[ERROR] Failed to validate config! See log above.");
	}
}

start().then(() => void 0);

// -------

/**
 * Calculates the checksum as given by the monitor protocol.
 *
 * @param id {number} Id of the monitor as hex int
 * @param command {number} Command code as hex int
 * @param values {number[] | undefined} Body of command as an array of hex ints or undefined
 * @return {number} The calculated checkumg
 */
function checksum(id, command, values) {
  let len = values ? values.length : 0;
  let sum = id + len + command;

  (values || []).forEach(v => sum += v);

  // TODO: handle overflow as specified

  return sum;
}

/**
 * Sends a command to the monitor.
 *
 * @param ip {string} IPv4 of the monitor
 * @param id {number} Id of the device
 * @param command {number} Command code as hex int
 * @param values {number[] | undefined} Optional command body as array of hex ints
 * @param res {Promise<any>} Formatted result yielded by the monitor
 */
function execute(ip, id, command, values, res) {
	const c = checksum(id, command, values);
	const len = values ? values.length : 0;

	let bytes = [0xAA, command, id, len];
	(values || []).forEach(v => bytes.push(v));

	bytes.push(c);

	const payload = new Uint8Array(bytes);
	const client = new net.Socket();

	return new Promise((response, rej) => {
		const timeout = setTimeout(() => {
			console.error(`Error on connection: ${ ip }/${ id }/${ command } || TIMEOUT`);

			client.destroy();
			response(null);
		}, 5000);

		client.connect(1515, ip, () => {
			console.log("Connected to Screen " + id);
			console.log("<", payload);
			client.write(payload);
		});

		client.on('data', function (data) {
			console.log(">", data);
			response(data);
			client.destroy();
			clearTimeout(timeout);
		});

		client.on('error', (ex) => {
			console.error(`Error on connection: ${ ip }/${ id }/${ command }`);
			console.error(ex);

			response(null);
		});
	});
}
