import Phaser from 'phaser';
import { io } from 'socket.io-client';

import shipImg from './assets/ship.png';
import playerSprite from './assets/player.png';
import bulletSprite from './assets/cannon_ball.png';
import skullSprite from './assets/skull.png';
import handGunAudio from './assets/hand_gun.mp3';
import {
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_START_X,
  PLAYER_START_Y,
} from './constants';
import { movePlayer } from './movement';
import { animateMovement } from './animation';

let player = {};
let otherPlayers = {};
let otherPlayersId = [];
let socket;
let direction = 'right';
let gunSound = {};
let scoreCard = {};
let playerNames = {};
let scoreBoardContainer = undefined;
const directionMapper = {
  right: { x: 6, y: 0 },
  left: { x: -6, y: 0 },
  up: { x: 0, y: -6 },
  down: { x: 0, y: 6 }
}
const defaultSpawnPoints = [
  {x:340,y:-24},
  {x: 138, y: -198},
  {x: 540, y:-140},
  {x:282, y:-290},
  {x:268, y:-132},
  {x:566, y:-154},
  {x:-252, y:-486},
  {x: 932, y:-102},
  {x:-802, y:-142},
  {x:-414, y:-18}
]
let pressedKeys = [];
let bullet_array = [];
let isShooting = false;
let health = 100;
let isPaused = false;
let HUD ={};


class MyGame extends Phaser.Scene {
  constructor() {
    super();
  }
connectToServer(room, name){
  socket = io(`https://among-hashers-server.herokuapp.com?room=${room}&name=${name}`);
}

getRandomInt(max) {
    return Math.floor(Math.random() * max);
  }

  preload() {
    this.load.image('ship', shipImg);
    this.load.audio('handGun', handGunAudio);
    this.load.spritesheet('skull', skullSprite, {
      frameWidth: PLAYER_SPRITE_WIDTH / 10,
      frameHeight: PLAYER_SPRITE_HEIGHT / 10,
    })
    this.load.spritesheet('player', playerSprite, {
      frameWidth: PLAYER_SPRITE_WIDTH,
      frameHeight: PLAYER_SPRITE_HEIGHT,
    });
    this.load.spritesheet('otherPlayer', playerSprite, {
      frameWidth: PLAYER_SPRITE_WIDTH,
      frameHeight: PLAYER_SPRITE_HEIGHT,
    });
    this.load.spritesheet('bullet', bulletSprite, {
      frameWidth: PLAYER_SPRITE_WIDTH / 10,
      frameHeight: PLAYER_SPRITE_HEIGHT / 10,
    });
  }

  create() {
    const params = new Proxy(new URLSearchParams(window.location.search), {
      get: (searchParams, prop) => searchParams.get(prop),
    });
    const name = params.name || 'anonymous';
    const room = params.room || 'test';
    this.connectToServer(room, name);
    const ship = this.add.image(0, 0, 'ship');
    gunSound = this.sound.add('handGun', {volume: 0.7});
    HUD.score = this.add.text(0, 0, 'Score: 0');
    HUD.room = this.add.text(0, 0, 'Room: ');
    HUD.time = this.add.text(0, 0, 'Time: ');
    HUD.name = this.add.text(0, 0, 'Player: ');
    HUD.killLog = this.add.text(0, 0, '');
    
    player.sprite = this.add.sprite(PLAYER_START_X, PLAYER_START_Y, 'player');
    player.sprite.displayHeight = PLAYER_HEIGHT;
    player.sprite.displayWidth = PLAYER_WIDTH;

    this.anims.create({
      key: 'running',
      frames: this.anims.generateFrameNumbers('player'),
      frameRate: 24,
      reapeat: -1,
    });

    this.input.keyboard.on('keydown', (e) => {
      if (!pressedKeys.includes(e.code)) {
        pressedKeys.push(e.code);
      }
    });
    this.input.keyboard.on('keyup', (e) => {
      pressedKeys = pressedKeys.filter((key) => key !== e.code);
    });

    socket.on('id', ({ id, name, otherClients, room }) => {
      console.log('id event');
      player.id = id;
      player.name = name;
      HUD.room.setText(`Room:${room}`);
      HUD.name.setText(`Player: ${name}`);
      otherClients.forEach(existingPlayer => {
        if(existingPlayer.id != player.id){
        const otherPlayer = {};
        otherPlayer.sprite = this.add.sprite(
          existingPlayer.x,
          existingPlayer.y,
          'otherPlayer',
        );
        otherPlayer.sprite.displayHeight = PLAYER_HEIGHT;
        otherPlayer.sprite.displayWidth = PLAYER_WIDTH;
        otherPlayer.sprite.setDepth(0);
        otherPlayers[existingPlayer.id] = otherPlayer;
        otherPlayersId.push(existingPlayer.id);
        }
      });
      console.log(player.id + "connected player");
      console.log(player);
    })
    socket.on('new player', ({ id }) => {
      console.log('someone else joined');
      const otherPlayer = {};
      otherPlayer.sprite = this.add.sprite(
        PLAYER_START_X,
        PLAYER_START_Y,
        'otherPlayer',
      );
      otherPlayer.sprite.displayHeight = PLAYER_HEIGHT;
      otherPlayer.sprite.displayWidth = PLAYER_WIDTH;
      otherPlayer.sprite.setDepth(0);
      otherPlayers[id] = otherPlayer;
      otherPlayersId.push(id);
    })
    socket.on('delete player', ({ id }) => {
      console.log('deleting player');
      otherPlayers[id].sprite.destroy();
      delete otherPlayers[id];
      otherPlayersId.splice(otherPlayersId.indexOf(id), 1);
    })
    socket.on('move', ({ x, y, id }) => {
      if (otherPlayers[id].sprite.x > x) {
        otherPlayers[id].sprite.flipX = true;
      } else if (otherPlayers[id].sprite.x < x) {
        otherPlayers[id].sprite.flipX = false;
      }
      otherPlayers[id].sprite.x = x;
      otherPlayers[id].sprite.y = y;
      otherPlayers[id].moving = true;
    });
    socket.on('moveEnd', ({ id }) => {
      otherPlayers[id].moving = false;
    });

    socket.on('bullets-update', (server_bullet_array) => {
      // If there's not enough bullets on the client, create them
      for (var i = 0; i < server_bullet_array.length; i++) {
        if (bullet_array[i] == undefined) {
          bullet_array[i] = this.add.sprite(server_bullet_array[i].x, server_bullet_array[i].y, 'bullet');
        } else {
          //Otherwise, just update it! 
          bullet_array[i].x = server_bullet_array[i].x;
          bullet_array[i].y = server_bullet_array[i].y;
        }
      }
      // Otherwise if there's too many, delete the extra 
      for (var i = server_bullet_array.length; i < bullet_array.length; i++) {
        bullet_array[i].destroy();
        bullet_array.splice(i, 1);
        i--;
      }
    });

    socket.on('player-hit', (id, scores, killer, names) => {
      scoreCard = scores;
      playerNames = names;
      HUD.score.setText(`Score: ${scores[player.id]}`);
      if (id == player.id) {
        //If this is you
        console.log('player');
        health-=20 * 0.16;
        console.log(health);
        if(health < 1) {
          const spawnPoint = this.getRandomInt(defaultSpawnPoints.length - 1); 
          player.sprite.x = defaultSpawnPoints[spawnPoint].x;
          player.sprite.y = defaultSpawnPoints[spawnPoint].y;
          console.log("LOG:", player.sprite.x + " " + player.sprite.y);
          socket.emit('move', {x: player.sprite.x, y: player.sprite.y, id: player.id})
          socket.emit('moveEnd', { id: player.id });
          socket.emit('player-killed', {killer, killed: `${player.name}`});
          console.log(`${killer} killed ${player.name}`);
          health = 100;
        }
        player.sprite.alpha = 0;
      } else {
        // Find the right player 
        otherPlayers[id].sprite.alpha = 0;
      }
    });
    socket.on('time-remaining', (timeRemaining, scores)=>{
      if(timeRemaining <= 0) {
        scoreCard = scores;
        HUD.time.setText(`Time: 0`);
        isPaused = true;
        if(!scoreBoardContainer){
        scoreBoardContainer = this.add.container(this.cameras.main.centerX -250, this.cameras.main.centerY - 250);
        scoreBoardContainer.setDepth(900);
        const scoreBoard = this.add.rectangle(this.cameras.main.centerX -250, this.cameras.main.centerY - 250,300,500, 0x4e342e);
        scoreBoardContainer.add(scoreBoard);
        console.log(scoreCard);
        const standingTextArray =[];
        const standings = Object.keys(scoreCard).map(playerId=>({id: playerId, score:scoreCard[playerId]})).sort((a,b)=>b.score - a.score);
        for(let i = 0; i<standings.length;i++){
         const standing = this.add.text(this.cameras.main.centerX - 350, (this.cameras.main.centerY - 450) + i * 25, `${i+1}. ${playerNames[standings[i].id] || 'Anonymous'} Score: ${standings[i].score}`);
         standingTextArray.push(standing);
        }
        scoreBoardContainer.add(standingTextArray);
      } 
      } else{
      HUD.time.setText(`Time: ${timeRemaining/1000}`);
      }
    });

    socket.on('player-killed', ({killer, killed})=>{
      console.log('killed from server');
      HUD.killLog.setText(`${killer} X ${killed}`);
      this.time.delayedCall(3000, this.fadeLog, [], this);
    })
    socket.on("disconnect", () => {
      otherPlayers = {};
      otherPlayersId = [];
      player = {};
      playerNames = {};
    });
    // Listen for any player hit events and make that player flash 

  }

  update() {
    this.scene.scene.cameras.main.centerOn(player.sprite.x, player.sprite.y);
    HUD.score.x = player.sprite.x + 250;
    HUD.score.y = player.sprite.y - 340;
    HUD.room.x = player.sprite.x + 100;
    HUD.room.y = player.sprite.y - 340;
    HUD.time.x = player.sprite.x;
    HUD.time.y = player.sprite.y - 340;
    HUD.name.x =player.sprite.x - 200;
    HUD.name.y = player.sprite.y - 340;
    HUD.killLog.x = player.sprite.x + 380;
    HUD.killLog.y = player.sprite.y;
    if(scoreBoardContainer && isPaused) {
      scoreBoardContainer.x = player.sprite.x - 300;
      scoreBoardContainer.y = player.sprite.y - 120;
    }
    const { playerMoved, moveDirection } = movePlayer(pressedKeys, player.sprite);
    direction = moveDirection || direction;
    if (pressedKeys.includes('KeyR') && !isShooting && !isPaused) {
      isShooting = true;
      const defaultDir = directionMapper[direction];
      let speed_x = defaultDir.x, speed_y = defaultDir.y;
      gunSound.play();
      //emit to server
      socket.emit('shoot-bullet', { x: player.sprite.x, y: player.sprite.y, speed_x, speed_y })
    } else if (!pressedKeys.includes('KeyR')) {
      isShooting = false;
    }
    if (playerMoved) {
      socket.emit('move', { x: player.sprite.x, y: player.sprite.y, id: player.id });
      player.movedLastFrame = true;
    } else {
      if (player.movedLastFrame) {
        socket.emit('moveEnd', { id: player.id });
      }
      player.movedLastFrame = false;
    }
    animateMovement(pressedKeys, player.sprite);
    if (player.sprite.alpha < 1) {
      player.sprite.alpha += (1 - player.sprite.alpha) * 0.16;
    } else {
      player.sprite.alpha = 1;
    }

    // Aninamte other player
    for (const id of otherPlayersId) {
      if (otherPlayers[id].moving && !otherPlayers[id].sprite.anims.isPlaying) {
        otherPlayers[id].sprite.play('running');
      } else if (!otherPlayers[id].moving && otherPlayers[id].sprite.anims.isPlaying) {
        otherPlayers[id].sprite.stop('running');
      }

      if(otherPlayers[id].sprite.alpha < 1){
        otherPlayers[id].sprite.alpha += (1 - otherPlayers[id].sprite.alpha) * 0.16;
    } else {
        otherPlayers[id].sprite.alpha = 1;
    }
    }
  }

  fadeLog() {
    HUD.killLog.setText('');
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 1080,
  height: 720,
  scene: MyGame,
};

const game = new Phaser.Game(config);
