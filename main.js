// Importing the required modules
const WebSocketServer = require('ws');
const uuid = require('uuid')
const users = {}
const rooms = {}
const port = process.env.PORT ? process.env.PORT : 8080
// Creating a new websocket server
const wss = new WebSocketServer.Server({ port: port })

class User {
    constructor(uuid4,connection) {
        this.userId = uuid4
        this.connection = connection
    }
    SetPlayerData(roomId, name, playerNum){
        this.roomId = roomId
        this.name = name
        this.playerNum = playerNum
    }
}
 
// Creating connection using websocket
wss.on("connection", (ws,req) => {
    let uuid4 = uuid.v4()
    users[uuid4.toString()] = new User(uuid4, ws)
    // sending message to client
    ws.send('{"action":"message","message":"Welcome, you are connected!"}');
    console.log("the client "+ uuid4 +"has connected");
    //on message from client
    ws.on("message", data => {
        data = JSON.parse(data)
        console.log(`Client ${uuid4} has sent us: ${data.action}`)
        //action,pin,type
        if(data.action == 'join') {
            handleJoin(ws,uuid4,data)
        } else {
            if(users[uuid4.toString()].roomId) {
                let room = rooms[users[uuid4.toString()].roomId]
                if(room && room.type=='ttt') {
                    handleTicTacToeGame(uuid4,room,data)
                } else if (room && room.type=='stratego') {
                    handleStrategoGame(uuid4,room,data)
                } else if (room && room.type=='buzzer') {
                    handleBuzzerGame(uuid4.toString(),room,data)
                }
            }
        }
    });
 
    // handling what to do when clients disconnects from server
    ws.on("close", () => {
        if(users[uuid4.toString()].roomId) {
            let room = rooms[users[uuid4.toString()].roomId]
            let user = users[uuid4]
            //{...users[uuid4.toString()], roomId:data.pin, name: data.name}
            room.disconnects= [...room.disconnects, user]
            room.players = room.players.filter(element => {
                return element.toString() != uuid4.toString()
            })
            if(room.players.length == 0) {
                delete rooms[room.roomId]
            } else {
                room.players.forEach(element => {
                    users[element.toString()].connection.send(`{"action":"message","message":"${user.name} has disconnected"}`)
                });
            }
        }
        delete users[uuid4]
        console.log("the client "+ uuid4 +" has disconnected");
    });
    // handling client connection error
    ws.onerror = function () {
        console.log("Some Error occurred")
    }

});
console.log("The WebSocket server is running on port 8080");

const handleJoin = (ws, uuid4, data) => {
    users[uuid4.toString()].SetPlayerData(data.pin,data.name,-1)
    let reconnect = false
    if(rooms[data.pin]) {
        if(rooms[data.pin].players.length == 2 && rooms[data.pin].type != 'buzzer') {
            ws.send(`{"action":"message","message":"Too many people already in that lobby"}`)
            return
        }
        let disconnectIndex = rooms[data.pin].disconnects.findIndex((element) => element.name == data.name)
        if(disconnectIndex >= 0) {
            let player = rooms[data.pin].disconnects[disconnectIndex]
            users[uuid4.toString()].SetPlayerData(player.roomId,player.name,player.playerNum)
            rooms[data.pin].players = [...rooms[data.pin].players, uuid4.toString()]
            rooms[data.pin].disconnects = rooms[data.pin].disconnects.splice(disconnectIndex, disconnectIndex);
            reconnect = true
        } else {
            rooms[data.pin].players = [...rooms[data.pin].players, uuid4 ]
            users[uuid4.toString()].playerNum = rooms[data.pin].players.length
        }
    } else {
        if(data.type == 'ttt') {
            rooms[data.pin] = createTicTacToeGame(data.pin, data.type, users[uuid4.toString()].name)
        } else if(data.type == 'stratego') {
            rooms[data.pin] = createStratigoGame(data.pin, data.type, users[uuid4.toString()].name)
        } else if (data.type == 'buzzer') {
            rooms[data.pin] = createBuzzerGame(data.pin, data.type, users[uuid4.toString()].name)
        }
        rooms[data.pin].players = [uuid4.toString()]
        users[uuid4.toString()].playerNum = rooms[data.pin].players.length
    }

    if(reconnect) {
        ws.send(`{"action":"connection","type":"${data.type}","pin":"${data.pin}","player":"${users[uuid4.toString()].playerNum}"}`)
        ws.send(`{"action":"message","message":"Reconnected, syncing game"}`)
        ws.send(`{"action":"sync","room":${JSON.stringify(rooms[data.pin])}}`)
        rooms[data.pin].players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"Player ${users[uuid4.toString()].name} reconnected: ${rooms[data.pin].players.length} players are in the lobby"}`)
        });
    } else {
        ws.send(`{"action":"connection","type":"${data.type}","pin":"${data.pin}","player":"${users[uuid4.toString()].playerNum}"}`)
        rooms[data.pin].players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"Player ${users[uuid4.toString()].name} joined: ${rooms[data.pin].players.length} players are in the lobby"}`)
        });
    }
}

const handleTicTacToeGame = (uuid4, room, data) => {
    if(data.action == 'start') {
        room.state = 'started'
        room.board = {}
        room.currentPlayer= (room.currentPlayer % 2) + 1
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"start","startPlayer":"${room.currentPlayer}"}`)
        });
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"The game has started, player ${users[room.players[room.currentPlayer - 1]].name} starts"}`)
        });
    } else if (data.action == 'place' && room.state == 'started') {
        if(room.board[data.location] == undefined) {
            room.board[data.location] = data.player
            let winner = checkTicTacToeWin(room.board)
            room.players.forEach(element => {
                users[element.toString()].connection.send(`{"action":"placeMark","player":"${data.player}","place":"${data.location}"}`)
            });
            if(winner != 0) {
                room.players.forEach(element => {
                    users[element.toString()].connection.send(`{"action":"end","winner":"${winner}"}`)
                });
                room.players.forEach(element => {
                    users[element.toString()].connection.send(`{"action":"message","message":"${winner == 3 ? 'Cats Game': users[uuid4.toString()].name + ' is the winner'}"}`)
                });
            }
        }
    } else if (data.action == 'message') {
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"${users[uuid4.toString()].name}: ${data.message}"}`)
        });
    } else  if(data.action == 'sync') {
        users[uuid4].connection.send(`{"action":"sync","room":${JSON.stringify(room)}}`)
    }
}

const handleStrategoGame = (uuid4,room,data) => {
    if(data.action == 'start') {
        room.state = 'placing'
        room.board=createStratigoBasicBoard()
        room.graveyard=createGraveyard()
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"start"}`)
        });
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"The game Has started, please place your pieces."}`)
        });
    } else if(data.action == 'place') {
        let placeIndex = room.graveyard.findIndex((element) => {return element.owner == data.player && element.power == data.power})
        let piece = room.graveyard.splice(placeIndex,1)[0]
        room.board[data.x][data.y].piece = piece
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"piecePlaced","x":"${data.x}","y":"${data.y}","power":"${data.power}","player":"${data.player}"}`)
        });
        let anyPiceIndex = room.graveyard.findIndex((element)=>{return element.owner == data.player})
        if(anyPiceIndex == -1) {
            users[uuid4.toString()].connection.send(`{"action":"lastPiecePlaced"}`)
        }
        if(room.graveyard.length == 0) {
            room.players.forEach(element => {
                users[element.toString()].connection.send(`{"action":"allPiecesPlayed"}`)
            });
        }
    } else if(data.action == 'remove') {
        let piece = room.board[data.x][data.y].piece
        room.graveyard.push(piece)
        room.board[data.x][data.y].piece = null
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"pieceRemoved","x":"${data.x}","y":"${data.y}"}`)
        });
    } else if(data.action == 'removeAndPlace') {
        let piece = room.board[data.x][data.y].piece
        room.graveyard.push(piece)
        room.board[data.x][data.y].piece = null
        let placeIndex = room.graveyard.findIndex((element) => {return element.owner == data.player && element.power == data.power})
        piece = room.graveyard.splice(placeIndex,1)[0]
        room.board[data.x][data.y].piece = piece
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"removeAndPlace","player":"${data.player}","power":"${data.power}","x":"${data.x}","y":"${data.y}"}`)
        });
    } else if(data.action == 'movePiece') {
        let piece = room.board[data.xStart][data.yStart].piece
        let endPiece = room.board[data.x][data.y].piece
        if(endPiece == null) {
            room.board[data.x][data.y].piece = piece
            room.board[data.xStart][data.yStart].piece = null
            room.players.forEach(element => {
                users[element.toString()].connection.send(`{"action":"movePiece","xStart":"${data.xStart}","yStart":"${data.yStart}","x":"${data.x}","y":"${data.y}"}`)
            });
        } else {
            if(piece.power == 1 && endPiece.power == 10) {
                room.board[data.xStart][data.yStart].piece = null
                room.board[data.x][data.y].piece = piece
            } else if (piece.power == 3 && endPiece.power == 11) {
                room.board[data.xStart][data.yStart].piece = null
                room.board[data.x][data.y].piece = piece
            } else if (endPiece.power == 12) {
                room.board[data.xStart][data.yStart].piece = null
                room.board[data.x][data.y].piece = piece
            } else if(piece.power > endPiece.power) {
                room.board[data.xStart][data.yStart].piece = null
                room.board[data.x][data.y].piece = piece
            } else if(piece.power < endPiece.power) {
                room.board[data.xStart][data.yStart].piece = null
            } else {
                room.board[data.xStart][data.yStart].piece = null
                room.board[data.x][data.y].piece = null
            }
            room.players.forEach(element => {
                users[element.toString()].connection.send(`{"action":"battle","xStart":"${data.xStart}","yStart":"${data.yStart}","x":"${data.x}","y":"${data.y}"}`)
            });
            if(endPiece.power == 12) {
                room.state = 'stopped'
            }
        }
    } else if(data.action == 'end') {
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"end"}`)
        });
    } else if(data.action == 'message') {
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"${users[uuid4.toString()].name}: ${data.message}"}`)
        });
    } else if(data.action == 'sync') {
        users[uuid4].connection.send(`{"action":"sync","room":${JSON.stringify(room)}}`)
    }
}

const handleBuzzerGame = (uuid4,room,data) => {
    if (data.action == 'start') {
        room.state = 'started'
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"start"}`)
        });
    } else if(data.action == 'buzz') {
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"buzz","player":"${users[uuid4.toString()].name}"}`)
        });
    } else if (data.action == 'resetBuzz' && users[uuid4.toString()].name == room.host) {
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"resetBuzz"}`)
        });
    } else if(data.action == 'message') {
        room.messages.push(`${users[uuid4.toString()].name}: ${data.message}`)
        room.players.forEach(element => {
            users[element.toString()].connection.send(`{"action":"message","message":"${users[uuid4.toString()].name}: ${data.message}"}`)
        });
    } else if (data.action == 'sync') {
        users[uuid4].connection.send(`{"action":"sync","room":${JSON.stringify(room)}}`)
    }
}

const checkTicTacToeWin = (board) => {
    if(board['00'] == board['01'] && board['01'] == board['02'] && board['00'] != undefined) {
        return board['00']
    }
    if(board['10'] == board['11'] && board['11'] == board['12'] && board['10'] != undefined) {
        return board['10']
    }
    if(board['20'] == board['21'] && board['21'] == board['22'] && board['20'] != undefined) {
        return board['20']
    }
    if(board['00'] == board['10'] && board['10'] == board['20'] && board['00'] != undefined) {
        return board['00']
    }
    if(board['01'] == board['11'] && board['11'] == board['21'] && board['01'] != undefined) {
        return board['01']
    }
    if(board['02'] == board['12'] && board['12'] == board['22'] && board['02'] != undefined) {
        return board['02']
    }
    if(board['00'] == board['11'] && board['11'] == board['22'] && board['00'] != undefined) {
        return board['00']
    }
    if(board['20'] == board['11'] && board['11'] == board['02'] && board['20'] != undefined) {
        return board['20']
    }
    if(board['00'] != undefined && board['01'] != undefined && board['02'] != undefined &&
    board['10'] != undefined && board['11'] != undefined && board['12'] != undefined &&
    board['20'] != undefined && board['21'] != undefined && board['22'] != undefined ) {
        return 3
    }
    return 0
}

const createTicTacToeGame = (gamePin, gameType,hostPlayer)=> {
    return {
        pin: gamePin,
        type: gameType,
        players:[],
        board:{},
        state:'',
        host: hostPlayer,
        currentPlayer:0,
        messages:[],
        disconnects:[],
    }
}

const createStratigoGame = (gamePin, gameType,hostPlayer) => {
    return {
        pin: gamePin,
        type: gameType,
        players: [],
        board:null,
        graveyard:  null,
        state:'',
        host: hostPlayer,
        currentPlayer:0,
        messages:[],
        lastMove:'',
        disconnects:[],
    }
}

const createBuzzerGame = (gamePin, gameType, hostPlayer) => {
    return {
        pin: gamePin,
        type: gameType,
        state: '',
        host: hostPlayer,
        players: [],
        messages: [],
        disconnects:[],
    }
}

const createStratigoBasicBoard = () => {
    let board = []
    for(let i = 0; i < 10; i++) {
        let row = []
        for(let y = 0; y < 10; y++) {
            if((i == 4 || i == 5) && (y == 2 || y ==3 || y == 6 || y == 7)) {
                row.push(createStratigoBasicTile(1))
            } else {
                row.push(createStratigoBasicTile(0))
            }
        }
        board.push(row)
    }
    return board
}
// 1=land,2=water
const createStratigoBasicTile = (type) => {
    return {type:type,piece:null}
}

const createGraveyard = () => {
    let graveyard = []
    for(let i = 0;i < 1; i++) {
        graveyard.push({owner:1,power:12})
        graveyard.push({owner:2,power:12})
        graveyard.push({owner:1,power:10})
        graveyard.push({owner:2,power:10})
        graveyard.push({owner:1,power:9})
        graveyard.push({owner:2,power:9})
    }
    for(let i = 0;i < 6; i++) {
        graveyard.push({owner:1,power:11})
        graveyard.push({owner:2,power:11})
    }
    for(let i = 0;i < 2; i++) {
        graveyard.push({owner:1,power:8})
        graveyard.push({owner:2,power:8})
    }
    for(let i = 0;i < 3; i++) {
        graveyard.push({owner:1,power:7})
        graveyard.push({owner:2,power:7})
    }
    for(let i = 0;i < 4; i++) {
        graveyard.push({owner:1,power:6})
        graveyard.push({owner:2,power:6})
        graveyard.push({owner:1,power:5})
        graveyard.push({owner:2,power:5})
        graveyard.push({owner:1,power:4})
        graveyard.push({owner:2,power:4})
    }
    for(let i = 0;i < 5; i++) {
        graveyard.push({owner:1,power:3})
        graveyard.push({owner:2,power:3})
    }
    for(let i = 0;i < 8; i++) {
        graveyard.push({owner:1,power:2})
        graveyard.push({owner:2,power:2})
    }
    for(let i = 0;i < 1; i++) {
        graveyard.push({owner:1,power:1})
        graveyard.push({owner:2,power:1})
    }
    return graveyard
}