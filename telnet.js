
var net = require('net');
var client = new net.Socket();

client.connect(23, '192.168.35.250', function() {
	console.log('Connected');
	client.write('administrator\r\nSOCadmin108\r\n');
});

client.on('data', function(data) {
	// console.log('Received: ', data);
	console.log(String.fromCharCode.apply(null, data));
	//client.write('vr\n\r');
	// client.write("SV i01 o02\r\n");
	//client.destroy(); // kill client after server's response

        ex();
});
    
client.on('close', function() {
	console.log('Connection closed');
});

// ---

const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

var activeQ = false;

function ex() {
  if (activeQ) return;

  activeQ = true;

  rl.question("", function(name) {
    activeQ = false;

    if (name === 'close') {
      rl.close();
    } else {
      client.write(name + '\r\n');
    }
  });
}

rl.on("close", function() {
    client.destroy();
    process.exit(0);
});

ex();
