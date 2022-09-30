const app = require('express')();
const PLAYER_START_X = 330;
const PLAYER_START_Y = 100;
const CLIENTS = [];
const SCORES = {};
var bullet_array = []; // Keeps track of all the bullets to update them on the server 
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origins: ['http://localhost:8080'],
  },
});

io.on('connection', (socket) => {
  console.log('player connected');
  socket.emit('id', {id:socket.id, otherClients: CLIENTS});
  CLIENTS.push ({id:socket.id, x:PLAYER_START_X, y:PLAYER_START_Y});
  SCORES[socket.id] = 0;
  socket.broadcast.emit('new player', { id:socket.id });
  socket.on('disconnect', () => {
    CLIENTS.splice(CLIENTS.indexOf((client)=>client.id === socket.id), 1);
    socket.broadcast.emit('delete player', { id:socket.id });
    console.log('player disconnected');
    delete SCORES[socket.id];
  });

  socket.on('move', ({ x, y, id }) => {
    CLIENTS.forEach((client, index) => {
      if(client.id === id) {
        CLIENTS[index].x = x;
        CLIENTS[index].y = y;
      }
    });
    socket.broadcast.emit('move', { x, y, id });
  });
  socket.on('moveEnd', ({id}) => {
    socket.broadcast.emit('moveEnd', {id});
  });

  socket.on('shoot-bullet',function(data){
    var new_bullet = data;
    data.owner_id = socket.id; // Attach id of the player to the bullet 
    if(Math.abs(data.speed_x) > 20 || Math.abs(data.speed_y) > 20){
      console.log("Player",socket.id,"is cheating!");
    }
    console.log('bullet', data);
    bullet_array.push(new_bullet);
  });
});

function ServerGameLoop(){
  for(var i=0;i<bullet_array.length;i++){
    var bullet = bullet_array[i];
    bullet.x += bullet.speed_x; 
    bullet.y += bullet.speed_y; 
    
    // Check if this bullet is close enough to hit any player 
    for(const id in CLIENTS){
      if(bullet.owner_id != CLIENTS[id].id){
        // And your own bullet shouldn't kill you
        var dx = CLIENTS[id].x - bullet.x; 
        var dy = CLIENTS[id].y - bullet.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if(dist < 20){
          console.log(dist);
          SCORES[bullet.owner_id] +=1;
          io.emit('player-hit',CLIENTS[id].id, SCORES); // Tell everyone this player got hit
        }
      }
    }
    
    // Remove if it goes too far off screen 
    if(bullet.x < -10000 || bullet.x > 10000 || bullet.y < -10000 || bullet.y > 10000){
        bullet_array.splice(i,1);
        i--;
    }
        
  }
  // Tell everyone where all the bullets are by sending the whole array
  io.emit("bullets-update",bullet_array);
}

setInterval(ServerGameLoop, 16); 

http.listen(3000, () => {
  console.log('server listening on localhost:3000');
});


