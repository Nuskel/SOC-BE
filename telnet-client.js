/* Telnet Module to communicate with the ATEN-Switch.
 *
 */

const net = require('net');
const client = new net.Socket();

const PORT = 23;
const IP = "192.168.35.250";

const TERMINATOR = '> ';

const credentials = {
    username: "administrator",
    password: "SOCadmin108"
};

const queue = [];
var response = [];
var active = false;
var current = null;
var initial = false;

function authenticate() {
	client.write(`${credentials.username}\r\n${credentials.password}\r\n`);
}

function enqueue(command, handler) {
	queue.push({
		command,
		call: handler
	});
	
	if (!current && initial) {
		doNext();
	}
}

function doNext() {
	const cmd = queue.shift();
			
	if (cmd) {
		current = cmd;
		
		console.log(`$ ${cmd.command}`);
		client.write(cmd.command + "\r\n");
	}
}

var logged = [];

function postprocess(data) {
	/* data consists of:
	 *    0: command echo
	 * 1..n: data
	 *    n: termination / input
	 */
	return data.slice(1, -1);
}

function log(data) {
	console.log('@', data);
	logged = [];
}

// -- User Functions

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
				
				o(false);
				
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
		});
	});
}

function readOut(input) {
	return new Promise((r, o) => {
		input = String(input).padStart(2, '0');

		enqueue(`ro ${input}`, data => {
			const none = "No port is connected to Output Port";
			
			if (data[0].startsWith(none)) {
				r(-1);
			} else {
				const regex = /Input Port ([0-9]{2}) is connected to Output Port ([0-9]{2}) /;
				const match = data[0].match(regex);
			
				r(+match[1]);
			}
		});
	});
}

function readIn(output) {
	return new Promise((r, o) => {
		output = String(output).padStart(2, '0');
		
		enqueue(`ri ${output}`, data => {
			const none = "No port is connected to Input Port";
			
			if (data[0].startsWith(none)) {
				r(-1);
			} else {
				const regex = /Output Port ([0-9]{2}) is connected to Input Port ([0-9]{2}) /;
				const match = data[0].match(regex);
				
				if (match && matcg.length == 2) {
					r(+match[1]);					
				} else {
					console.log("[Telnet] Read input: ", match);
					
					r(-1);
				}		
			}
		});
	});
}

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
		});
	});
}

/************************************
 *             Exports
 ************************************/

exports.readState = readState;
exports.readOut = readOut;
exports.readIn = readIn;
exports.set = set;


// --

client.connect(PORT, IP, async function() {
	console.log('[Telnet] Connected');
	
	authenticate();
});

client.on('data', function (data) {
	setTimeout(() => {
		const msg = String.fromCharCode.apply(null, data);
		const res = msg.split("\r\n");
		
		// Messages may be split in serveral responses
		if (current) {
			response = [...response, ...res];
		}
		
		// When the server requests for input with terminator:
		// 46 == . 
		if (res.slice(-1) != TERMINATOR) {
			return;
		}
		
		if (!initial) {
			initial = true;
			
			doNext();
			
			return;
		}

		if (current) {
			try {
				current.call(postprocess(response));
			} catch (e) {
				console.error(`[Telnet] Command ${current.command} failed du to:`);
				console.error(e);
			}
			
			current = undefined;
			response = [];
			
			doNext();
		}
	}, 500);
});

client.on('close', function() {
	console.log('Connection closed');
});
