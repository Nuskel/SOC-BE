/* Telnet Module to communicate with the ATEN-Switch.
 *
 */

const net = require('net');
const client = new net.Socket();

const PORT = 23;
const IP = "192.168.35.250";

const credentials = {
    username: "administrator",
    password: "SOCadmin108"
};

const queue = [];
var active = false;
var current = null;

function enqueue(command, handler) {
	queue.push({
		command,
		call: handler
	});
}

const logged = [];

function log(data) {
	const msg = String.fromCharCode.apply(null, data);

	console.log(msg);
	logged.push(msg);
}

module.exports =  {

    connect: () => {
        return new Promise((res, rej) => {
	    client.connect(PORT, IP, function() {
            	console.log('Connected');

            	/* Login process:
            	 *  Server is requesting the username first. When committed the password is
              	 *  requested. To flush both answers (as single commits) a combination of
             	 *  carriage return (\r) and the new line (\n) is used.
             	 */

            	client.write(`${ credentials.username }\r\n${ credentials.password }\r\n`);
		   // current = (data) => console.log("Logged in", data);
		    enqueue("read", data => console.log("Read", data));
        	});

		client.on('data', function (data) {
			console.log("<<");
			log(data);

			if (queue.length > 0) {
				current = queue.shift();
				client.write(current.command + "\r\n");
			} else if (current) {
				current.call(data);
				current = null;
				//res(data);
				//
				setTimeout(() => {
					console.log("Finished");
					console.log(logged);
				}, 2000);
			} else {
				//client.destroy(); // close
			}
			/*
			if (!active) {
				console.log("Logged in", data);
				active = true;

				log(data);

				res(true);
				return;
			}
			if (current) {
				console.log("Handle current", current.command);
				current.call(data);
				current = null;

				log(data);
			} else if (queue.length > 0) {
				const next = queue[0];

				current = next;
				client.write(next.command + '\n');
				console.log("Activated next command", next.command);

				log("Received");
				log(data);
			} else {
				console.log("No active call?");
				log(data);
			}
            //console.log("Data>", String.fromCharCode.apply(null, data));

            /*
             * TODO: gibt es eine Möglichkeit zu erkennen, zu welchem Befehl die Antwort gehört?
             */

/*
           if (!login) {
		login = true;
		   client.write('read\r\n');
	   } else {
		   console.log("Data=", data);
		   const matrix = String.fromCharCode.apply(null, data).match(/o\d\d\si\d\d/gi);
		console.log("Matrix=", matrix);
		res(matrix);
	   }*/
        });

        client.on('close', function() {
            console.log('Connection closed');
        });
	});
    },

    close: () => {
        client.destroy();
	    console.log("Log:", "\n", logged);
    },

    send: (call, data) => {
	    if (queue.length === 0) {
		    current = { command: call, call: data };
		    console.log("Direct call =>", call);
		    client.write(call + '\n');
	    } else {
        	enqueue(call, data);
		    console.log("enqueued", call);
	    }
    }

};
