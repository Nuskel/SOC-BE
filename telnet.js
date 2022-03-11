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

module.exports =  {

    connect: () => {
        client.connect(PORT, IP, function() {
            console.log('Connected');

            /* Login process:
             *  Server is requesting the username first. When committed the password is
             *  requested. To flush both answers (as single commits) a combination of
             *  carriage return (\r) and the new line (\n) is used.
             */

            client.write(`${ credentials.username }\r\n${ credentials.password }\r\n`);
        });

        client.on('data', function (data) {
            console.log(String.fromCharCode.apply(null, data));

            /*
             * TODO: gibt es eine Möglichkeit zu erkennen, zu welchem Befehl die Antwort gehört?
             */

            ex();
        });

        client.on('close', function() {
            console.log('Connection closed');
        });
    },

    close: () => {
        client.destroy();
    },

    send: (call) => {
        client.write(call + '\r\n');
    }

};
