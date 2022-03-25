const telnet = require('./telnet');

telnet.connect().then(s => {
	//console.log(s);
	telnet.close();
});
