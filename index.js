require("dotenv").config();
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const OpenAI = require("openai");

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("<h1>Quiz Game Server OK</h1>");
});

const QUIZ_THEMES = {
  OLAHRAGA: "Olahraga",
  MATEMATIKA: "Matematika",
  SEJARAH: "Sejarah Umum",
  IPA: "Ilmu Pengetahuan Alam",
};

const ROUND_DURATION_MS = 30_000; 
const MAX_PLAYERS_PER_ROOM = 10; 


function calculatePoints(elapsedSeconds) {
  if (elapsedSeconds < 5) return 10; 
  if (elapsedSeconds < 10) return 8; 
  if (elapsedSeconds < 15) return 6; 
  if (elapsedSeconds < 20) return 4; 
  if (elapsedSeconds < 30) return 2; 
  return 0; 
}