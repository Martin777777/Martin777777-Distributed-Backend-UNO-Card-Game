import { createServer } from "http"
import { Server } from "socket.io"
import { Action, createEmptyGame, doAction, filterCardsForPlayerPerspective, Card, computePlayerCardCounts, Config, User, checkOrCreateUser, GameState, tryToInsertNewGame, tryToGetGameState, tryToUpdateGameState } from "./model"
import express, { NextFunction, Request, Response } from 'express'
import bodyParser from 'body-parser'
import pino from 'pino'
import expressPinoLogger from 'express-pino-logger'
import session from 'express-session'
import { Strategy as CustomStrategy } from "passport-custom"
import MongoStore from 'connect-mongo'
import cors from 'cors'
import { Issuer, Strategy, generators } from 'openid-client'
import passport from 'passport'
import { gitlab } from "./secrets"
import { MongoClient, Collection, Db, ObjectId } from 'mongodb'
import { setupRedis } from "./redis"

declare module 'express-session' {
  export interface SessionData {
    credits?: number
  }
}
async function main() {
  //setip env params
  const port = parseInt(process.env.SERVER_PORT) || 8101
  const client_url = process.env.CLIENT_URL || 'http://127.0.0.1:8100'
  const mongo_url = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017'
  const db_name = process.env.DB_NAME || 'UNO-Game';
  const DISABLE_SECURITY = !!process.env.DISABLE_SECURITY
  const { socketIoAdapter: adapter } = await setupRedis()
  //setup mongodb client
  const client = new MongoClient(mongo_url);

  //setup mongodb objects
  let db: Db
  let users: Collection<User>
  let games: Collection<GameState>

  //connect to mongodb
  client.connect().then(async () => {
    console.log('Connected successfully to MongoDB')
    db = client.db("UNO-Game")
    users = db.collection('users')
    games = db.collection('games')
  })

  // set up Express
  const app = express()
  const server = createServer(app)
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))

  // set up Pino logging
  const logger = pino({ transport: { target: 'pino-pretty' } })
  app.use(expressPinoLogger({ logger }))

  // set up session
  const sessionMiddleware = session({
    secret: 'a just so-so secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },

    store: MongoStore.create({
      mongoUrl: mongo_url + '/' + db_name,
      ttl: 14 * 24 * 60 * 60 //14 days
    })
  })
  app.use(sessionMiddleware)

  //setup passport
  app.use(passport.initialize())
  app.use(passport.session())

  passport.serializeUser((user, done) => {
    console.log("serializeUser", user)
    done(null, user)
  })

  passport.deserializeUser((user, done) => {
    console.log("deserializeUser", user)
    done(null, user)
  })


  //set up socket.io server to let it use same port
  const io = new Server(server, { adapter })
  const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next)
  io.use(wrap(sessionMiddleware));

  //setup OAuth2 OIDC
  if (DISABLE_SECURITY) {
    passport.use("oidc", new CustomStrategy((req, done) => done(null, { test: req.query.test, preferred_username: req.query.name, admin: req.query.admin })))
  } else {
    Issuer.discover("https://coursework.cs.duke.edu/").then(issuer => {
      const client = new issuer.Client(gitlab)
      const params = {
        scope: 'openid profile email',
        nonce: generators.nonce(),
        redirect_uri: client_url + '/auth/login-callback',
        state: generators.state(),
      }

      function verify(tokenSet: any, userInfo: any, done: (error: any, user: any) => void) {
        console.log('userInfo', userInfo)
        console.log('tokenSet', tokenSet)
        return done(null, userInfo)
      }
      passport.use('oidc', new Strategy({ client, params }, verify))
    })
  }


  //handle /auth/login, whatever result it is, back to client url
  app.get('/auth/login',
    passport.authenticate('oidc', { successReturnToOrRedirect: client_url }),
    (req, res) => res.redirect("/")
  )


  //handle /auth/login, whatever result it is (including reject OAuth), back to client url
  app.get('/auth/login-callback', (req, res, next) => {
    if (req.query.error) {
      return res.redirect(client_url);
    }
    passport.authenticate('oidc', {
      successReturnToOrRedirect: client_url,
      failureRedirect: client_url,
    })(req, res, next);
  })


  /**
   * @description: check auth for all HTTP requests below
   * @param: req
   * @return: 401 and error message if unauthorized
   */
  app.use((req, res, next) => {
    if (!req.isAuthenticated()) {
      res.status(401).send("Invalid User, Please Login First")
      return
    }
    next()
  })


  /**
   * @description: return info of the user. if user doesn't exist, create a new one.
   * @param: req
   * @return: success: 200, User object.
   */
  app.get("/auth/get-user", async (req, res) => {
    console.log("/", req.user)
    if ((req?.user as any)) {
      let user: User
      if ((req?.user as any)?.test) {
        const name = (req?.user as any)?.preferred_username
        const admin = JSON.parse((req?.user as any)?.admin)
        user = await checkOrCreateUser(users, "test@email.com", name, admin)
      } else {
        const name = (req?.user as any)?.preferred_username
        const email = (req?.user as any)?.email
        const admin = (req?.user as any)?.groups?.includes('uno-admin')
        user = await checkOrCreateUser(users, email, name, admin)
      }
      res.status(200).json(user)
    }
  })


  /**
 * @description: return info of the user. if user doesn't exist, create a new one.
 * @param: req
 * @return: success: 200, User object.
 */
  app.get("/", async (req, res) => {
    const name = (req?.user as any)?.name
    const user = await users.findOne({ name: name })

    if (user && user.gameid != null) {
      res.redirect(client_url + '/' + user.gameid)
    }
  })


  /**
   * @description: logout the session, destroy the session and clear cookie
   * @param: req
   * @return: success: 200
   */
  app.post('/auth/logout', (req, res, next) => {
    req.logout(function (err) {
      if (err) { return next(err); }
      req.session.destroy(function (err) {
        if (err) {
          return next(err);
        }
        res.clearCookie('connect.sid');
        res.status(200).send();
      });
    });
  });


  /**
   * Game Server Part
   */

  /**
   * @description: update(broadcast) lobbyList (list of GameState) to lobby.vue
   * @param:  
   */
  async function updateLobbyIist() {
    try {
      const gameStates = await games.find({}).toArray();
      //update lobby for all the connections
      io.emit('lobby-update', gameStates);
    } catch (error) {
      console.error('Error fetching games from MongoDB:', error);
    }
  }


  /**
   * @description: update(by the playerName in the GameStaete ) GameState to Game.vue 
   * @param:  GameState
   */
  function emitGameStateToPlayers(gameState: GameState) {
    gameState.playerNames.forEach(playerName => {
      io.to(playerName).emit("game-state",
        gameState.currentTurnPlayerIndex,
        gameState.phase,
        gameState.playCount,
        gameState.playerNames.length,
        gameState.config,
        gameState.fewCardPlayer

      );
    });
    gameState.viewer?.forEach(viewerName => {
      io.to(gameState._id.toString() + viewerName).emit("game-state",
        gameState.currentTurnPlayerIndex,
        gameState.phase,
        gameState.playCount,
        gameState.playerNames.length,
        gameState.config,
        gameState.fewCardPlayer

      );
    });
  }


  /**
   * @description: Filter Cards(by playerName and index in the list) for each player, and send the cards to Game.vue 
   * @param:  newGame--the Index could change as someone leave
   */
  function emitUpdatedCardsForPlayers(gameState: GameState, cards: Card[], newGame = false) {
    gameState.playerNames.forEach((playerName, index) => {
      let updatedCardsFromPlayerPerspective = filterCardsForPlayerPerspective(cards, index);
      if (newGame) {
        updatedCardsFromPlayerPerspective = updatedCardsFromPlayerPerspective.filter(card => card.locationType !== "unused");
      }
      // console.log("emitting update for player", playerName, ":", updatedCardsFromPlayerPerspective);
      if (newGame) {
        io.to(playerName).emit("all-cards", index, updatedCardsFromPlayerPerspective,);
      } else {
        io.to(playerName).emit("updated-cards", updatedCardsFromPlayerPerspective,);
      }
    });
    gameState.viewer?.forEach((viewerName) => {
      io.to(gameState._id.toString() + viewerName).emit("all-cards", -1, Object.values(gameState.cardsById),)
    })
  }


  /**
   * @description: Validteing config either creating a new gane or updating a running game
   * @param:  param{host, config},  newGame--can't create newgame when user in some game, but can update
   */
  async function validatingConfig(client: any, host: string, config: Config, newGame = false) {
    if (!config) {
      console.error('Config object is undefined');
      return false
    }
    if (!Number.isInteger(config.numberOfDecks || config.rankLimit < 1)) {
      client.emit('error', 'number of decks shoule be an integer greater than 0')
      return false
    }
    if (!Number.isInteger(config.rankLimit) || config.rankLimit < 1 || config.rankLimit > 13) {
      client.emit('error', 'rank limit should be an integer between 1-13')
      return false
    }
    if (!Number.isInteger(config.capacity || config.capacity < 2)) {
      client.emit('error', 'capacity should be an integer greater than 1')
      return false
    }
    const user = await users.findOne({ name: host })
    const existingGame = await games.findOne({ playerNames: host });
    if (existingGame && newGame) {
      client.emit('error', 'Cannot create game since you are in another one')
      return false
    }

    return true
  }


  /**
   * @description: shuffle card inside a game, keep the same configs and players
   */
  async function shuffling(playerName: string, client: any) {
    let gameState;
    const existingGame = await games.findOne({ playerNames: playerName });
    if (existingGame) {
      gameState = createEmptyGame(existingGame.playerNames, existingGame.config);
      Object.assign(existingGame, gameState, { _id: existingGame._id, version: existingGame.version });
      if (await tryToUpdateGameState(games, existingGame)) {
        const updatedCards = Object.values(existingGame.cardsById);
        emitUpdatedCardsForPlayers(existingGame, updatedCards, true);
        emitGameStateToPlayers(existingGame);
        updateLobbyIist();
      } else {
        client.emit('error', 'Failed to update when shuffling ')
      }
    } else {
      client.emit('error', 'Cannot find the related game')
      return
    }

  }


  /**
   * @description: handling users' connection on io, "client" means one to one, "io" means broadcast
   */
  io.on('connection', client => {
    const currentUser = (client.request as any).session?.passport?.user
    if (!currentUser) {
      client.emit("reason", "Illegal Access Denied")
      setTimeout(()=>{client.disconnect(true)}, 1000)
      return
    }
    let playerName = currentUser.preferred_username

    /**
    * @description: updating lobby info for Lobby.vue
    */
    client.on('lobby-info', () => {
      updateLobbyIist();
    }
    );


    /**
     * @description: shuffle card inside a game, keep the same configs and players
     */
    client.on("Reshuffle", async () => {
      const user = await users.findOne({ name: playerName })
      if (!user || user.role !== "host") {
        client.emit('error', "You are not host and are not allowed to restart game ")
      } else {
        shuffling(playerName, client)
      }

    });


    /**
     * @description: Create New Game In the Lobby.vue
     * @param:  param{host(playername), config}
     */
    client.on("new-game", async (config: Config) => {
      if (!(await validatingConfig(client, playerName, config, true))) {
        return;
      }

      let gameState = createEmptyGame([playerName], config);
      if (!await tryToInsertNewGame(games, gameState)) {
        client.emit('error', "failed to create new game")
        return
      }

      await users.findOneAndUpdate(
        { name: playerName },
        { $set: { gameid: gameState._id, role: 'host' } }
      )

      client.emit('navigate', gameState._id);
      const updatedCards = Object.values(gameState.cardsById);
      emitUpdatedCardsForPlayers(gameState, updatedCards, true);
      emitGameStateToPlayers(gameState);
      updateLobbyIist();
    });



    /**
     * @description: Join A Game In the Lobby.vue
     */
    client.on('join-game', async (gameId) => {
      try {
        const gameState = await tryToGetGameState(games, new ObjectId(gameId))
        if (!gameState) {
          client.emit('error', 'Game not found');
          return;
        }

        if (gameState.playerNames.includes(playerName)) {
          client.emit('navigate', gameId)
          return
        }

        if (gameState.playerNames.length >= gameState.config.capacity) {
          client.emit('error', 'Game is full');
          return;
        }

        gameState.playerNames.push(playerName);
        await users.findOneAndUpdate(
          { name: playerName },
          { $set: { gameid: gameState._id } }
        )

        if (await tryToUpdateGameState(games, gameState)) {
          client.emit('navigate', gameId);
          updateLobbyIist();
        } else {
          client.emit('error', 'Failed to update game when join a game')
        }
      } catch (error) {
        console.error('Error joining game:', error);
        client.emit('error', 'Failed to join game');
      }
    });


    /**
     * @description: update the cards for users when they are redirected to their Game.vue after join game etc
     */
    client.on('player-name', async () => {
      client.join(String(playerName))
      const game = await games.findOne({ playerNames: playerName });
      if (game) {
        //validating the user
        client.emit("validation")
        const playerIndex = game.playerNames.indexOf(playerName);
        client.emit(
          "all-cards",
          playerIndex,
          filterCardsForPlayerPerspective(Object.values(game.cardsById), playerIndex).filter(card => card.locationType !== "unused"),
        )
        emitGameStateToPlayers(game)
      } else {
        console.log(`No game found for player ${playerName}.`);
      }
    })


    /**
     * @description: Leave A Game In the Game.vue, can only leave when it is game over
     */
    client.on("Leave", async () => {
      const existingGame = await games.findOne({ playerNames: playerName })
      if (existingGame) {
        if (existingGame.phase !== "game-over") {
          client.emit('error', 'You cannot leave until the game end!')
          return
        } else {
          let pendingRemovedUser = await users.findOne({ name: playerName })
          if (pendingRemovedUser.role == 'host') {
            for (const tempUserName of existingGame.playerNames) {
              await users.findOneAndUpdate(
                { name: tempUserName },
                { $set: { gameid: null, role: 'player' } }
              )
            }
            for (const tempUserName of existingGame.playerNames) {
              io.to(tempUserName).emit('leave', 'host end the game')
            }
            for (const viewerName of existingGame.viewer) {
              io.to(viewerName + existingGame._id.toString()).emit('leave', 'host end the game')
            }
            await games.deleteOne({ _id: existingGame._id });
          } else {
            existingGame.playerNames = existingGame.playerNames.filter(name => name !== playerName)
            existingGame.playCount -= 1
            if (await tryToUpdateGameState(games, existingGame)) {
              await users.findOneAndUpdate(
                { name: playerName },
                { $set: { gameid: null, role: 'player' } }
              );
              client.emit('leave');
            } else {
              client.emit('error', "Failed to leave game")
            }
          }
        }
      } else {
        client.emit('error', 'No game found with the specified player.');
        return
      }
      emitGameStateToPlayers(existingGame);
      updateLobbyIist();
    });


    /**
     * @description: let the admin back to the lobby
     * @param: gameId admin want to leave
     * @return: error if game not exist, back to '/' if successful
     */
    client.on("BackToLobby", async (gameId) => {
      const existingGame = await games.findOne({ _id: new ObjectId(gameId) })
      if (!existingGame) {
        client.emit("error", "invalid gameId")
        return
      }
      const name = currentUser.preferred_username
      await games.findOneAndUpdate(
        { _id: new ObjectId(gameId) },
        { $pull: { viewer: name } }
      )
      client.emit('leave')
    })


    /**
     * @description: Draw card or play card in Game.vue 
     */
    client.on("action", async (action) => {
      const gameState = await games.findOne({ playerNames: playerName });
      if (gameState) {
        if (gameState.playerNames.length == gameState.config.capacity) {
          const playerIndex = gameState.playerNames.indexOf(playerName);
          const updatedCards = doAction(gameState, { ...action, playerIndex });
          if (await tryToUpdateGameState(games, gameState)) {
            emitUpdatedCardsForPlayers(gameState, updatedCards);
            emitGameStateToPlayers(gameState);
          } else {
            client.emit('error', 'Failed to do action.');
          }
        } else {
          client.emit('error', 'No enough players to start the game.');
        }
      } else {
        console.log(`No game found for player ${playerName}.`);
      }
    });


    console.log("New client")


    client.on('view-all', async (params) => {
      let gameId = params.gameId
      let name = params.name
      const user = await users.findOne({ name: name })
      if (!user.admin) {
        io.emit('error', 'you are not the admin')
        return
      }
      client.join(gameId + name)
      const game = await games.findOneAndUpdate(
        { _id: new ObjectId(gameId) },
        { $addToSet: { viewer: name } },
        { returnDocument: 'after' }
      );
      if (game && game.value) {
        client.emit("all-cards", -1, Object.values(game.value.cardsById))
        emitGameStateToPlayers(game.value)
      }
    })


    /**
     * @description: get the config of current game and send back to the front-end
     */
    client.on("get-config", async () => {
      const gameState = await games.findOne({ playerNames: playerName });
      const user = await users.findOne({ name: playerName })
      if (!user || user.role !== "host") {
        client.emit("get-config-reply", gameState.config)
      } else {
        client.emit("get-config-reply", gameState.config)
      }
    })

    /**
     * @description: update the config of current game and restart the game
     */
    client.on("update-config", async (config: Config) => {
      const user = await users.findOne({ name: playerName })
      if (!user || user.role !== "host") {
        client.emit("error", "You are not allowed to change the config ")
        return
      }
      if (await validatingConfig(client, playerName, config)) {
        const gameState = await games.findOne({ playerNames: playerName });
        gameState.config = config
        if (await tryToUpdateGameState(games, gameState)) {
          setTimeout(() => { client.emit("update-config-reply", true) }, 100)
          shuffling(playerName, client)
        } else {
          client.emit("update-config-reply", false)
        }
      } else {
        client.emit("update-config-reply", false)
      }
    })

  })

  server.listen(port)
  console.log(`Game server listening on port ${port}`)
}

main()