const fs = require('fs');
const md5 = require('md5');
const http = require('http');
const irc = require('irc');
const ircs = require('ircs');

const configPath = './config.json';
const defaults = {
    'gameConfigName': 'game.json',
    'gamesDir': './games',
    'contentServerPort': 9494,
    'chatServerPort': 6667,
    'chatChannels': ['#lanlauncher'],
    'chatUsername': 'LANLauncher'
}

var config = {};

var gameNames = new Array();
var gameList = new Array();

function loadConfig() {

    try {
        // Try to load config from file
        fs.openSync(configPath, 'r+');

        var data = fs.readFileSync(configPath);

        config = JSON.parse(data);
    } catch (err) {
        // If errored, try making config and write the defaults
        try {
            console.log('No config file found, creating from defaults');

            config = defaults;

            writeConfig();
        } catch (err) {
            console.log('Error: Could not open config.json for write')
        }
    }
}

function writeConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
        console.log('Wrote new config file');
    } catch (err) {
        console.log('Error: Could not write defaults to config.json')
    }
}

function getGamesDirectory() {
    var directory = config.gamesDir;

    if (directory.indexOf('./') === 0) {
        directory = __dirname + directory.substr(1);
    }

    return directory;
}

function getGamePath(gameName) {
    return getGamesDirectory() + '/' + gameName;
}

function getGameConfigPath(gameName) {
    return getGamesDirectory() + '/' + gameName + '/' + config.gameConfigName;
}

function getAvailableGameNames() {
	gameNames = new Array();

	console.log(config.gamesDir);

    var directories = fs.readdirSync(config.gamesDir);

    directories.forEach(function(file) {
        if (fs.statSync(getGamePath(file)).isDirectory()) {
            try {
                fs.statSync(getGameConfigPath(file));
                gameNames.push(file);
            }

            catch (e) {
                console.log('Not a valid game: ' + file);
            }
        }
    });
}

function getGameConfig(gameName) {
    try {
    	// Make sure we can open it for read
        var fd = fs.openSync(getGameConfigPath(gameName), 'r+');
        // Close!
        fs.closeSync(fd);

        var data = fs.readFileSync(getGameConfigPath(gameName), 'utf8');

        return JSON.parse(data);
    } catch (err) {
        console.log('Error: Could not read game config file located at ' + getGameConfigPath(gameName));
    }
}

function getAvailableGameConfigs() {
	gameList = new Array();
	
	getAvailableGameNames();

	gameNames.forEach(function(gameName) {
		var gameConfig = getGameConfig(gameName);
		gameConfig = injectDownloadLocation(gameName, gameConfig);
		gameList.push(gameConfig);
	});
}

function injectDownloadLocation(gameName, gameConfig) {
	gameConfig.folderName = gameName;
	gameConfig.contentFile = '/download/' + md5(gameName);

	return gameConfig;
}

function sendGameFiles(response, downloadPath) {
	var game = false;

	getAvailableGameConfigs();

	gameList.forEach(function(gameConfig) {
		if (gameConfig.contentFile == downloadPath) {
			game = gameConfig;
		}
	});

	if (game !== false) {
		var filePath = getGamePath(game.folderName) + '/game.zip';
		var stat = fs.statSync(filePath);

		response.writeHead(200, {
			'Content-Type': 'application/zip',
			'Content-Length': stat.size,
			'Content-Disposition': 'attachment; filename="game.zip"'
		});

		var readStream = fs.createReadStream(filePath);
		readStream.pipe(response);
	} else {
		response.end('Invalid download location.');
	}
}

function handleRequest(request, response) {
	if (request.url == '/games.json') {
		getAvailableGameConfigs();
		response.end(JSON.stringify(gameList));
	} else if (request.url.indexOf('/download/' == 0)) {
		sendGameFiles(response, request.url);
	} else {
		response.end('Invalid request.');
	}
}

function startContentServer() {
	var server = http.createServer(handleRequest);

	server.listen(config.contentServerPort, function() {
		console.log('Content server started');
	});
}

function startChatServer() {
	ircs().listen(config.chatServerPort, function() {
		console.log('Chat server started');

		setTimeout(startChatClient, 1000);
	});
}

function startChatClient() {
	var client = new irc.Client('localhost', config.chatUsername, {
		port: config.chatServerPort,
		autoRejoin: true,
		retryCount: 100,
		autoConnect: true
	});

	client.addListener('registered', function (message) {
    	setTimeout(function() {
    		console.log('Joining channel(s)!')
    		config.chatChannels.forEach(function(channel) {
    			client.join(channel);
    		});
    	}, 500);
	});

}

loadConfig();
startContentServer();
startChatServer();