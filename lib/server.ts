"use strict";

import { customAlphabet, nanoid } from "nanoid";
import * as socketio from "socket.io";
import { createServer } from "http";
import { parse } from "yaml";
import { Chess, ChessInstance } from "chess.js";
import { readFileSync } from "fs";
import { resolve } from "path";
const games: Map<string, ChessInstance> = new Map();
const server = createServer((req, res) => {
  if (req.url === "/games") {
    res.writeHead(200);
    res.end(JSON.stringify(Array.from(games.keys())));
  }
});
const io: socketio.Server = require("socket.io")(server);
const config = parse(
  readFileSync(resolve(__dirname, "../server.yml"), "utf-8")
);
server.listen(config.port);
console.log("server up on localhost:3000");
io.on("connection", (socket: socketio.Socket) => {
  let game = "";
  socket.on("host", () => {
    const id = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6)();
    game = id;
    games.set(id, new Chess());
    socket.join(id);
    socket.emit("joined", id, "wb".charAt(io.to(id).sockets.sockets.size - 1));
    //@ts-expect-error
    socket.turn = "w";
  });
  socket.on("join", id => {
    if (games.has(id)) {
      game = id;
      if (games.get(id)) {
        socket.join(id);
        socket.emit(
          "joined",
          id,
          "wb".charAt(io.to(id).sockets.sockets.size - 1)
        );
        //@ts-expect-error
        socket.turn = "b";
      }
      if (io.to(id).sockets.sockets.size >= 2) {
        io.to(id).emit("start", games.get(id).fen());
      }
    } else {
      socket.disconnect();
    }
  });
  socket.on("moved", fen => {
    const chess = new Chess(fen);
    //@ts-expect-error
    if ((chess.turn() === socket.turn) === "w" ? "b" : "w") {
      if (chess.game_over()) {
        io.to(getGameID(socket)).emit("game-over", chess.fen());
        games.delete(getGameID(socket));
      } else {
        games.get(getGameID(socket)).load(fen);
        io.to(getGameID(socket)).emit(
          "start",
          games.get(getGameID(socket)).fen()
        );
      }
    }
  });
  socket.on("disconnecting", () => {
    const game = getGameID(socket);
    if (io.to(game).sockets.sockets.size - 1 === 1) {
      games.delete(game);
      io.to(game).sockets.sockets.forEach(s => {
        s.leave(game);
        s.emit("left", "A player has disconnected from your game.");
      });
    }
  });
});
const getGameID: (socket: socketio.Socket) => string | null = socket => {
  return Array.from(socket.rooms.values()).pop().length === 6
    ? Array.from(socket.rooms.values()).pop()
    : null;
};
