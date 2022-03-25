const Telnet  = require('@superhero/telnet'),
	telnet  = new Telnet(),
	host    = '192.168.35.250',
	port    = 23;

// optional host and port, but you probably like to specify the host at least :)
telnet.connect(host, port)

// all commands are stacked and performed in a series after each other.
.exec(/.*/i, 'administrator', 0, (e, d) => console.log(e, d))
.exec(/.*/i, 'SOCadmin108', 0, (e, d) => console.log(e, d))

/**
 * Argument specification:
 * 1. regex, when found in returned string, then write the command
 * 2. the telnet command to write
 * 3. [optional] how long to sleep, expressed in milliseconds
 * 4. [optional] callback with the returned data after the command has been performed
 */
.exec(/.*/, 'read', 0, (error, data) => {
	console.log("resp:", data, error);
});
