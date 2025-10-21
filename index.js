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