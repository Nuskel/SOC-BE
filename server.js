var net = require('net');
const https = require('https');
const fs = require('fs');

const options = {
	key: fs.readFileSync('key.pem'),
	cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(options, (req, res) => {
  const method = req.method; // GET, ...
  const url = req.url.substring(1); // initial '/'

  console.log("Req:", url);	

  const id = parseInt(url.split('?')[0], 16);
  const call = url.split('?')[1];
  let cmd;
  let value;
  let values;	

  if (call.includes("=")) {
    cmd = parseInt(call.split('=')[0], 16);
    value = call.split('=')[1];
    values = [];

    if (value.includes(",")) {
      values = value.split(',').map(x => parseInt(x, 16));
    } else {
      values = [parseInt(value, 16)];
    }
  } else {
    cmd = parseInt(call, 16);
  }

  console.log("Id:", id, "Command:", cmd, "Values:", values);

  execute(id, cmd, values, (data) => {
    const ack = data[4] === 41;

    console.log("Ack > Command:", data[5], "Result:", data[6]);

   // TODO: check that data length (data[3]) > 0)

    if (ack) {
      res.writeHead(200);
      res.end("$" + data[6]);	    
    } else {
      res.writeHead(500);
      res.end("!" + data[6]);	    
    }	  	  
  });	
});

server.listen(9001, 'localhost', () => {
  console.log("Video Wall - Back End running!");
  console.log("Listening to localhost:9001");	
});

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
