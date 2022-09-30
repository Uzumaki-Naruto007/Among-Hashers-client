import Phaser from 'phaser';
import { io } from 'socket.io-client';

import shipImg from './assets/ship.png';
import playerSprite from './assets/player.png';
import bulletSprite from './assets/cannon_ball.png';
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

const player = {};
const otherPlayers = {};
const otherPlayersId = [];
let socket;
let direction = 'right';
const directionMapper = {
  right: { x: 10, y: 0 },
  left: { x: -10, y: 0 },
  up: { x: 0, y: -10 },
  down: { x: 0, y: 10 }
}
let pressedKeys = [];
let bullet_array = [];
let isShooting = false;
let health = 100;
let scoreText ={};


class MyGame extends Phaser.Scene {
  constructor() {
    super();
  }
connectToServer(){
    socket = io('localhost:3000');
  }

  preload() {
    this.load.image('ship', shipImg);
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
    this.connectToServer();
    const ship = this.add.image(0, 0, 'ship');
    scoreText.score = this.add.text(0, 0, 'Score: 0');
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
      console.log(e.code);
      if (!pressedKeys.includes(e.code)) {
        pressedKeys.push(e.code);
      }
    });
    this.input.keyboard.on('keyup', (e) => {
      pressedKeys = pressedKeys.filter((key) => key !== e.code);
    });

    socket.on('id', ({ id, otherClients }) => {
      console.log('id event');
      player.id = id;
      otherClients.forEach(existingPlayer => {
        const otherPlayer = {};
        otherPlayer.sprite = this.add.sprite(
          existingPlayer.x,
          existingPlayer.y,
          'otherPlayer',
        );
        otherPlayer.sprite.displayHeight = PLAYER_HEIGHT;
        otherPlayer.sprite.displayWidth = PLAYER_WIDTH;
        otherPlayers[existingPlayer.id] = otherPlayer;
        otherPlayersId.push(existingPlayer.id);
      });
      console.log(player.id + "connected player");
      console.log(player);
    })
    socket.on('new player', ({ id }) => {
      const otherPlayer = {};
      otherPlayer.sprite = this.add.sprite(
        PLAYER_START_X,
        PLAYER_START_Y,
        'otherPlayer',
      );
      otherPlayer.sprite.displayHeight = PLAYER_HEIGHT;
      otherPlayer.sprite.displayWidth = PLAYER_WIDTH;
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
      console.log('revieved move');
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
      console.log('revieved moveend');
      console.log(id);
      console.log(otherPlayers);
      console.log(otherPlayers[id]);
      otherPlayers[id].moving = false;
    });

    socket.on('bullets-update', (server_bullet_array) => {
      // If there's not enough bullets on the client, create them
      for (var i = 0; i < server_bullet_array.length; i++) {
        if (bullet_array[i] == undefined) {
          console.log('heyy');
          bullet_array[i] = this.add.sprite(server_bullet_array[i].x, server_bullet_array[i].y, 'bullet');
        } else {
          //Otherwise, just update it! 
          bullet_array[i].x = server_bullet_array[i].x;
          bullet_array[i].y = server_bullet_array[i].y;
          console.log('heyy else');

        }
      }
      // Otherwise if there's too many, delete the extra 
      for (var i = server_bullet_array.length; i < bullet_array.length; i++) {
        bullet_array[i].destroy();
        bullet_array.splice(i, 1);
        i--;
      }
    });

    socket.on('player-hit', (id, scores) => {
      scoreText.score.setText(`Score: ${scores[player.id]}`);
      if (id == player.id) {
        //If this is you
        console.log('player');
        health-=20 * 0.16;
        console.log(health);
        if(health < 1) {
          player.sprite.x = PLAYER_START_X;
          player.sprite.y = PLAYER_START_Y;
          socket.emit('move', {x: player.sprite.x, y: player.sprite.y, id: player.id})
          socket.emit('moveEnd', { id: player.id });
          health = 100;
        }
        player.sprite.alpha = 0;
      } else {
        // Find the right player 
        otherPlayers[id].sprite.alpha = 0;
      }
    });
    socket.on("disconnect", () => {
      otherPlayers = {};
      otherPlayersId = [];
    });
    // Listen for any player hit events and make that player flash 

  }

  update() {
    this.scene.scene.cameras.main.centerOn(player.sprite.x, player.sprite.y);
    scoreText.score.x = player.sprite.x + 250;
    scoreText.score.y = player.sprite.y - 200;
    const { playerMoved, moveDirection } = movePlayer(pressedKeys, player.sprite);
    direction = moveDirection || direction;
    if (pressedKeys.includes('KeyR') && !isShooting) {
      isShooting = true;
      const defaultDir = directionMapper[direction];
      let speed_x = defaultDir.x, speed_y = defaultDir.y;
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
        console.log(player);
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
}

const config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 800,
  height: 450,
  scene: MyGame,
};

const game = new Phaser.Game(config);
