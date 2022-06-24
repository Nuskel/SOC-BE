/* Telnet Module to communicate with the ATEN-Switch.
 *
 */

const net = require('net');
const client = new net.Socket();

/********************************
 * Constants
 ********************************/

const PORT = 23;
const IP = "192.168.35.250";

const TERMINATOR = '> ';
const COMMAND_TIME_BUFFER = 500;
const COMMAND_TIMEOUT = 5000;

const credentials = {
    username: "administrator",
    password: "SOCadmin108"
};

/********************************
 * State
 ********************************/

const queue = []; // command queue ({command, callback}[])
let response = []; // response to be constructed
let current = null; // current active command
let initial = false; // true, if the connection is fully established

/**
 * Sends a specific format including the username and password
 * prompted by the server on connection. The server will not
 * answer with the default terminator after the username thus
 * both values are sent as a single command.
 */
function authenticate() {
	/* On connection server asks as following:
	 *  username: {username}
	 *  password: {password}
	 * with {...} followed by \r\n each as user input.
	 */
	client.write(`${credentials.username}\r\n${credentials.password}\r\n`);
}

/********************************
 * Command Handling
 ********************************/

/**
 * Enqueues a new command to be sent when the queue is empty.
 *
 * @param command Command string with args
 * @param handler Callback function
 * @param err	  Error handler
 */
function enqueue(command, handler, err) {
	queue.push({
		command,
		call: handler,
		err
	});

	console.log("[Telnet] enqueued", command)

	// When the queue is empty, directly perform request
	if (!current/* && initial*/) {
		doNext();
	}
}

/**
 * Performs a request by sending the next command in queue.
 */
function doNext() {
	const cmd = queue.shift();
			
	if (cmd) {
		const name = cmd.command;
		current = cmd;

		setTimeout(() => {
			if (current) {
				console.error(`[Telnet] Timeout for command '${ name }' after ${ COMMAND_TIMEOUT }ms.`);
			}

			abortCommand("timeout");
		}, COMMAND_TIMEOUT);
		
		console.log(`$ ${cmd.command}`);
		client.write(cmd.command + "\r\n");
	}
}

function abortCommand(reason) {
	if (current) {
		current.err(reason);
		current = null;
	}
}

/**
 * Transforms the fully received answer from the server by cutting
 * off the echo and terminator part. Might be modified for for
 * different implementations.
 *
 * @param data Full server response
 * @returns {*} Just the relevant user data
 */
function postprocess(data) {
	/* data consists of:
	 *    0: command echo
	 * 1..n: data
	 *    n: termination / input
	 */
	return data.slice(1, -1);
}

/********************************
 * User functions (spec. for KVM-Switch)
 ********************************/

/**
 * Reads the state of the connection matrix.
 * The state is represented by an array of input-output-connections:
 *
 *  [i(n): o(n)...]
 *
 *  i - index of array value ~ input index
 *  o - array value at index ~ output index
 *
 * @returns {Promise<[]>} array of connections; null on error
 */
function readState() {
	return new Promise((r, o) => {
		enqueue("read", data => {
			/* data:
			 *    0 - "read Command OK\r"
			 * 1..9 - "o{xx} i{xx} video on audio on \r"
			 */
			const success = data[0];
			
			if (!success.startsWith("read Command OK")) {
				console.log("[Telnet] ERR: invalid response state:");
				console.log(` '${success}'`);
				
				r(null);
				
				return;
			}
			
			const stateStr = data.slice(1, 9);
			let state = [];
			
			for (let i = 0; i < stateStr.length; i++) {
				// o01 i02 video on audio on
				//      ^
				//      input = state[i]
				try {
					state[i] = +(stateStr[i].split(" ")[1].substr(1));
				} catch (e) {
					state[i] = -1;
				}
			}
			
			r(state);
		}, err => r(null));
	});
}

/**
 * Returns the output index of given input index.
 *  -1) when no port is connected to the ouput
 *  nn) index number of connected input
 *
 * @param input Input index
 * @returns {Promise<number>} Output index; -1 on error
 */
function readOut(input) {
	return new Promise((r, o) => {
		input = String(input).padStart(2, '0');

		enqueue(`ro ${input}`, data => {
			const none = "No port is connected to Output Port";
			
			if (data[0].startsWith(none)) {
				r(-1);
			} else {
				const regex = /Input Port (\d{2}) is connected to Output Port (\d{2}) /;
				const match = data[0].match(regex);
			
				r(+match[1]);
			}
		}, e => r(-1));
	});
}

/**
 * Returns the input index of given output index.
 *  -1) when no port is connected to the input
 *  nn) index number of connected output
 *
 * @param output Output index
 * @returns {Promise<number>} Input index; -1 on error
 */
function readIn(output) {
	return new Promise((r, o) => {
		output = String(output).padStart(2, '0');
		
		enqueue(`ri ${output}`, data => {
			const none = "No port is connected to Input Port";
			
			if (data[0].startsWith(none)) {
				r(-1);
			} else {
				const regex = /Output Port (\d{2}) is connected to Input Port (\d{2}) /;
				const match = data[0].match(regex);
				
				if (match && match.length === 2) {
					r(+match[1]);					
				} else {
					console.log("[Telnet] Read input: ", match);
					
					r(-1);
				}		
			}
		}, e => r(-1));
	});
}

/**
 * Connects any input to any output index.
 *
 * @param input Input index
 * @param output Output index
 * @returns {Promise<boolean>} true on success; false on error
 */
function set(input, output) {
	return new Promise((r, o) => {
		input = String(input).padStart(2, '0');
		output = String(output).padStart(2, '0');
		
		enqueue(`ss ${input},${output}`, res => {
			const answer = res[0];
			
			if (!answer.startsWith("Switch input")) {
				console.log("[Telnet] ERR: invalid response state:");
				console.log(` '${answer}'`);
				
				r(false);
			} else {
				r(true);
			}
		}, e => r(false));
	});
}

/********************************
 * Main Handler
 ********************************/

function connect() {
	return new Promise((res, rej) => {
		client.connect(PORT, IP, async function() {
			console.log('[Telnet] Connected');

			authenticate();

			res(true);
		})

		client.on('error', (ex) => {
			console.log("[Telnet] Failed to connect to the server.");
			console.log(ex);

			res(false);
		});
	});
}

client.on('data', function (data) {
	setTimeout(() => {
		const msg = String.fromCharCode.apply(null, data);
		const res = msg.split("\r\n");
		
		/* The whole response might be split off in shorter pieces. */
		if (current) {
			response = [...response, ...res];
		}
		
		/* When the server requests for input with terminator:
		 * 46 == "> "
		 *
		 * The last part of each server response must be the terminator.
		 * When not given, we only got a part of the whole response.
		 */
		if (res.slice(-1)[0] !== TERMINATOR) {
			return;
		}

		// Trigger the first command after connection
		if (!initial) {
			initial = true;
			
			doNext();
			
			return;
		}

		if (current) {
			try {
				current.call(postprocess(response));
			} catch (e) {
				console.log(`[Telnet] Command '${current.command}' failed.`);
				console.error(e);
			}
			
			current = undefined;
			response = [];
			
			doNext();
		}
	}, COMMAND_TIME_BUFFER);
});

client.on('close', function(err) {
	if (err) {
		console.log('[Telnet] Connection closed due to an error.');
	} else {
		console.log('[Telnet] Connection closed');
	}
});

client.on('error', (ex) => {
	console.log("[Telnet] Error on telnet connection.");
	console.error(ex);

	abortCommand(ex);
});

/************************************
 * Module Exports
 ************************************/

exports.connect = connect;
exports.readState = readState;
exports.readOut = readOut;
exports.readIn = readIn;
exports.set = set;
