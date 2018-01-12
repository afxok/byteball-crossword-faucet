const fs = require('fs');
const express = require('express');
const hbs = require('hbs');
const url = require('url');
const path = require('path');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const compression = require('compression');
const errorhandler = require('errorhandler');
const morgan = require('morgan');

const constants = require('byteballcore/constants.js');
const conf = require('byteballcore/conf.js');
const db = require('byteballcore/db.js');
const eventBus = require('byteballcore/event_bus.js');
const mail = require('byteballcore/mail.js');
const headlessWallet = require('headless-byteball');
const desktopApp = require('byteballcore/desktop_app.js');
const ValidationUtils = require("byteballcore/validation_utils.js");

// Constants
const GREETING_TIMEOUT = 300*1000;
const SESSION_TIMEOUT = 600*1000;
const assocSessions = {};

const HTTP_PORT = process.env.PORT || 6080;
const HTTP_ADDR = '0.0.0.0';
const STATIC_DIR = path.join(__dirname, 'public');
const VIEWS_DIR = path.join(__dirname, '/views');
const LOG_FORMAT = 'combined';

const puzzle =
{
  "title": "Byteball Puzzle",
  "by": "afxok",
  "clues": [
    { "d":"A", "n":6, "x":1, "y":1, "a":"REPEATS", "c":"Shows you've seen" },
    { "d":"A", "n":7, "x":9, "y":1, "a":"NINES", "c":"Eights aren't enough" },
    { "d":"A", "n":9, "x":0, "y":3, "a":"DIAL", "c":"Don't touch that __" },
    { "d":"A", "n":10, "x":5, "y":3, "a":"ASTRONOMER", "c":"Starstruck scientist" },
    { "d":"A", "n":11, "x":0, "y":5, "a":"WEIGHING", "c":"Measuring heaviness" },
    { "d":"A", "n":13, "x":9, "y":5, "a":"COUSIN", "c":"Maybe you can marry" },
    { "d":"A", "n":15, "x":0, "y":7, "a":"JAZZ", "c":"American music" },
    { "d":"A", "n":17, "x":5, "y":7, "a":"BOATS", "c":"Marina sights" },
    { "d":"A", "n":18, "x":11, "y":7, "a":"EASE", "c":"Let out" },
    { "d":"A", "n":19, "x":0, "y":9, "a":"PURSES", "c":"Sums of money" },
    { "d":"A", "n":20, "x":7, "y":9, "a":"POSTPONE", "c":"Give a rain check" },
    { "d":"A", "n":23, "x":0, "y":11, "a":"RIDICULOUS", "c":"Cockamamy" },
    { "d":"A", "n":26, "x":11, "y":11, "a":"CAGE", "c":"Hamster's home" },
    { "d":"A", "n":27, "x":1, "y":13, "a":"GHOST", "c":"Father & son, three's a crowd" },
    { "d":"A", "n":28, "x":7, "y":13, "a":"ELEMENT", "c":"Substance like no other" },
    { "d":"D", "n":1, "x":3, "y":0, "a":"APOLOGIZES", "c":"Makes amends" },
    { "d":"D", "n":2, "x":5, "y":0, "a":"HAWAII", "c":"Barack's home " },
    { "d":"D", "n":3, "x":7, "y":0, "a":"ISNT", "c":"__ it romantic?" },
    { "d":"D", "n":4, "x":9, "y":0, "a":"ENFORCES", "c":"Keeps lawfull" },
    { "d":"D", "n":5, "x":11, "y":0, "a":"ONTO", "c":"I'm __ you!" },
    { "d":"D", "n":6, "x":1, "y":1, "a":"RAISE", "c":"Bring up" },
    { "d":"D", "n":8, "x":13, "y":1, "a":"SPECIES", "c":"Variety" },
    { "d":"D", "n":12, "x":7, "y":5, "a":"GRASP", "c":"Hold" },
    { "d":"D", "n":14, "x":11, "y":5, "a":"UNEXPECTED", "c":"Abrupt" },
    { "d":"D", "n":16, "x":1, "y":7, "a":"AMUSING", "c":"Gladdening" },
    { "d":"D", "n":17, "x":5, "y":7, "a":"BISCUITS", "c":"Go with gravy" },
    { "d":"D", "n":21, "x":9, "y":9, "a":"SISTER", "c":"Nun" },
    { "d":"D", "n":22, "x":13, "y":9, "a":"NIGHT", "c":"Dusk to dawn" },
    { "d":"D", "n":24, "x":3, "y":11, "a":"IRON", "c":"Pumping __" },
    { "d":"D", "n":25, "x":7, "y":11, "a":"OVER", "c":"Game __" }
  ]
};


function notifyAdmin(subject, body){
	mail.sendmail({
		to: conf.admin_email,
		from: conf.from_email,
		subject: subject,
		body: body
	});
}

function notifyAdminAboutFailedPayment(err){
	console.log('payment failed: '+err);
//	notifyAdmin('payment failed: '+err, err);
}

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max+1 - min)) + min;
}

function resumeSession(device_address){
	if (!assocSessions[device_address])
		assocSessions[device_address] = {};
	assocSessions[device_address].ts = Date.now();
}

function purgeOldSessions(){
	console.log('purging old sessions');
	var cutoff_ts = Date.now() - SESSION_TIMEOUT;
	for (var device_address in assocSessions)
		if (assocSessions[device_address].ts < cutoff_ts)
			delete assocSessions[device_address];
}
setInterval(purgeOldSessions, SESSION_TIMEOUT);

function sendMessageToDevice(device_address, text){
	var device = require('byteballcore/device.js');
	device.sendMessageToDevice(device_address, 'text', text);
//	assocSessions[device_address].ts = Date.now();
}

function sendGreeting(device_address){
	sendMessageToDevice(device_address, 'To receive free bytes, let me know your Byteball address (use "Insert My Address" button)');
	assocSessions[device_address].greeting_ts = Date.now();
}

function sendUnrecognizedCommand(device_address){
	sendMessageToDevice(device_address, 'Unrecognized command');
}

function sendUnrecognizedCommandOrGreeting(device_address){
	(assocSessions[device_address].greeting_ts && assocSessions[device_address].greeting_ts > Date.now() - GREETING_TIMEOUT)
		? sendUnrecognizedCommand(device_address)
		: sendGreeting(device_address);
}

eventBus.on('headless_wallet_ready', function(){
	if (!conf.admin_email || !conf.from_email){
		console.log("please specify admin_email and from_email in your "+desktopApp.getAppDataDir()+'/conf.json');
		process.exit(1);
	}
});

eventBus.on('paired', function(from_address){
	console.log('paired '+from_address);
	if (headlessWallet.isControlAddress(from_address))
		headlessWallet.handlePairing(from_address);
	resumeSession(from_address);
	sendGreeting(from_address);
});

eventBus.on('text', function(from_address, text){
	console.log('text from '+from_address+': '+text);
	if (headlessWallet.isControlAddress(from_address))
		headlessWallet.handleText(from_address, text);
	resumeSession(from_address);
	text = text.trim();
	if (text.match(/unrecognized/i))
		return console.log("ignoring: "+text);
	var arrMatches = text.match(/\b[A-Z2-7]{32}\b/);
	if (!arrMatches)
		return sendUnrecognizedCommandOrGreeting(from_address);
	var address = arrMatches[0];
	if (!ValidationUtils.isValidAddress(address))
		return sendMessageToDevice(from_address, 'Please send a valid address');
	var bBlackbytes = /(black|private)/i.test(text);
	var asset = bBlackbytes ? constants.BLACKBYTES_ASSET : null;
	db.query(
		"SELECT amount FROM faucet_payouts \n\
		WHERE device_address=? AND asset"+(bBlackbytes ? ("="+db.escape(asset)) : " IS NULL")+" AND creation_date > "+db.addTime("-1 DAY")+" LIMIT 1", 
		[from_address], 
		function(rows){
			if (rows.length > 0){
				var currency = bBlackbytes ? 'blackbytes' : 'bytes';
				return sendMessageToDevice(from_address, "You can request free "+currency+" only once per 24 hours.  I've already sent you "+rows[0].amount+" "+currency);
			}
			if (bBlackbytes)
				sendMessageToDevice(from_address, "Please wait ...");
			var amount = bBlackbytes 
				? getRandomInt(conf.MIN_AMOUNT_IN_KB * 1000, conf.MAX_AMOUNT_IN_KB * 1000)
				: getRandomInt(conf.MIN_AMOUNT_IN_KB, conf.MAX_AMOUNT_IN_KB) * 1000;
			headlessWallet.issueChangeAddressAndSendPayment(asset, amount, address, from_address, function(err){
				if (err)
					return notifyAdminAboutFailedPayment(err);
				db.query(
					"INSERT INTO faucet_payouts (device_address, amount, address, asset) VALUES(?,?,?,?)", 
					[from_address, amount, address, asset]
				);
				if (!bBlackbytes)
					sendMessageToDevice(from_address, 'If you\'d like to also receive free blackbytes, type "blackbytes to YOURADDRESS"');
			});
		}
	);
});


const app = express();
// const apiRouter = express.Router();
const appRouter = express.Router();

app.set('view engine', 'hbs');
app.set('views', VIEWS_DIR);

// Declare any Express [middleware](http://expressjs.com/api.html#middleware) you'd like to use here
appRouter.use(morgan(LOG_FORMAT, {stream: fs.createWriteStream('access.log', {flags: 'a'})}));
appRouter.use(methodOverride());
appRouter.use(bodyParser.json());
appRouter.use(bodyParser.urlencoded({extended:false}));
appRouter.use(cookieParser());
appRouter.use(session({secret: 'byte-baller'}));
appRouter.use(compression());
appRouter.use(express.static(STATIC_DIR));

hbs.registerHelper('json', function(context) {
    return JSON.stringify(context);
});

appRouter.get('/hello', (req, res) => {
  res.status(200).send('Hello WOrld!');
});

appRouter.get('/crossword', (req, res) => {
    let opts = {
    	asset: null, 
    	amount: 1000, // bytes
    	to_address: "textcoin:ASDFGHJKL",
    	email_subject: "Crossword puzzle faucet textcoin"
    };
    console.log('route /crossword');
    headlessWallet.issueChangeAddressAndSendMultiPayment(opts, function(err, unit, assocMnemonics) {
        console.log('assocMnemonics=' + JSON.stringify(assocMnemonics));
        let context = {};
        if (err) {
            notifyAdminAboutFailedPayment(err);
            context = { "puzzle": puzzle };
            console.log('rendering a mock crossword: ' + JSON.stringify(context));
        } else {
            context = { "puzzle": puzzle };
            console.log('rendering a textcoin crossword: ' + JSON.stringify(context));
        }
        res.render('crossword', context);
    });
});


app.use('/faucet', appRouter);

// apiRouter.use(cors);
// apiRouter.use(validateFirebaseIdToken);
// app.use('/api', apiRouter);

app.listen(HTTP_PORT,HTTP_ADDR);



// module.exports = headlessWallet;

