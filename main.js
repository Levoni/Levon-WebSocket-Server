// Importing the required modules
const WebSocketServer = require('ws');
const uuid = require('uuid')
const users = {}
const rooms = {}
const port = process.env.PORT ? process.env.PORT : 8080
// Creating a new websocket server
const wss = new WebSocketServer.Server({ port: port })
 
// Creating connection using websocket
wss.on("connection", (ws,req) => {
    let uuid4 = uuid.v4()
    users[uuid4.toString()] = {userId:uuid4, connection: ws}
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
                }
            }
        }
    });
 
    // handling what to do when clients disconnects from server
    ws.on("close", () => {
        if(users[uuid4.toString()].roomId) {
            let room = rooms[users[uuid4.toString()].roomId]
            let user = users[uuid4]
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
    users[uuid4.toString()] = {...users[uuid4.toString()], roomId:data.pin, name: data.name}
    if(rooms[data.pin]) {
        if(rooms[data.pin].players.length == 2) {
            ws.send(`{"action":"message","message":"Too many people already in that lobby"}`)
        }
        rooms[data.pin].players = [...rooms[data.pin].players, uuid4 ]
    } else {
        rooms[data.pin] = createTicTacToeGame(data.pin, data.type)
        rooms[data.pin].players = [uuid4.toString()]
    }
    ws.send(`{"action":"connection","type":"${data.type}","pin":"${data.pin}","player":"${rooms[data.pin].players.length}"}`)
    rooms[data.pin].players.forEach(element => {
        users[element.toString()].connection.send(`{"action":"message","message":"Player joined: ${rooms[data.pin].players.length} players are in the lobby"}`)
    });
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
            users[element.toString()].connection.send(`{"action":"message","message":"The game Has started, player ${users[room.players[room.currentPlayer - 1]].name} starts"}`)
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

const createTicTacToeGame = (gamePin, gameType)=> {
    return {
        pin: gamePin,
        type: gameType,
        players:[],
        board:{},
        state:'',
        currentPlayer:0,
        messages:[]
    }
}