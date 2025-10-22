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

async function generateQuizQuestions(theme) {
  console.log(`🤖 Generating quiz for theme: ${theme}`);
  console.log(`🔑 API Key exists: ${!!process.env.OPENAI_API_KEY}`);

  try {
   
    const prompt = `Buatkan 10 soal quiz pilihan ganda tentang ${theme} dengan tingkat kesulitan menengah dalam bahasa Indonesia. 
Format response harus STRICT JSON array dengan struktur:
[
  {
    "question": "pertanyaan",
    "options": ["A. jawaban", "B. jawaban", "C. jawaban", "D. jawaban"],
    "correctAnswer": "A"
  }
]

PENTING: 
- Response harus pure JSON array, tidak ada teks tambahan
- Setiap soal memiliki 4 pilihan (A, B, C, D)
- correctAnswer hanya huruf A, B, C, atau D
- Pertanyaan harus jelas dan edukatif`;


    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a quiz generator. Always respond with valid JSON array only, no markdown or extra text.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7, 
      max_tokens: 2000, 
    });


    const content = completion.choices[0].message.content.trim();
    
    const jsonContent = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const questions = JSON.parse(jsonContent);

    console.log(
      `✅ Successfully generated ${questions.length} questions from OpenAI`
    );
    return questions;
  } catch (error) {
   
    console.error("❌ Error generating quiz:", error.message);
    console.log("⚠️ Using fallback questions instead");

    return [
      {
        question: "Apa ibu kota Indonesia?",
        options: ["A. Jakarta", "B. Bandung", "C. Surabaya", "D. Medan"],
        correctAnswer: "A",
      },
      {
        question: "Berapa hasil dari 5 + 7?",
        options: ["A. 10", "B. 11", "C. 12", "D. 13"],
        correctAnswer: "C",
      },
      {
        question: "Siapa presiden pertama Indonesia?",
        options: ["A. Soekarno", "B. Soeharto", "C. BJ Habibie", "D. Megawati"],
        correctAnswer: "A",
      },
      {
        question: "Planet terdekat dengan matahari?",
        options: ["A. Venus", "B. Merkurius", "C. Mars", "D. Bumi"],
        correctAnswer: "B",
      },
      {
        question: "Berapa jumlah pemain sepak bola per tim?",
        options: ["A. 9", "B. 10", "C. 11", "D. 12"],
        correctAnswer: "C",
      },
      {
        question: "Gas apa yang kita hirup untuk bernafas?",
        options: ["A. Nitrogen", "B. Oksigen", "C. Karbon", "D. Hidrogen"],
        correctAnswer: "B",
      },
      {
        question: "Tahun kemerdekaan Indonesia?",
        options: ["A. 1942", "B. 1944", "C. 1945", "D. 1946"],
        correctAnswer: "C",
      },
      {
        question: "Berapa hasil dari 8 x 7?",
        options: ["A. 54", "B. 56", "C. 58", "D. 60"],
        correctAnswer: "B",
      },
      {
        question: "Organ tubuh yang memompa darah?",
        options: ["A. Paru-paru", "B. Jantung", "C. Hati", "D. Ginjal"],
        correctAnswer: "B",
      },
      {
        question: "Olahraga yang menggunakan raket dan kok?",
        options: ["A. Tenis", "B. Badminton", "C. Squash", "D. Ping Pong"],
        correctAnswer: "B",
      },
    ];
  }
}


const rooms = new Map();


function normalize(text) {
  return (text || "").toString().trim().toLowerCase();
}




function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
   
    rooms.set(roomCode, {
      players: new Map(), 
      roundIndex: 0, 
      roundActive: false, 
      roundDeadline: 0, 
      roundStartTime: 0, 
      timerInterval: null, 
      gameStarted: false, 
      gameEnded: false, 
      theme: null, 
      questions: [], 
      quizReady: false, 
      roomCreator: null, 
    });
  }
  return rooms.get(roomCode);
}


function currentQuestion(room) {
  return room.questions[room.roundIndex] || null;
}

function emitScoreboard(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const scoreboard = Array.from(room.players.values())
    .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
 
  io.to(roomCode).emit("scoreboard", scoreboard);
}




function emitPlayersState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const players = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    ready: p.ready || false, 
  }));
  
  io.to(roomCode).emit("playersState", {
    players, 
    gameStarted: room.gameStarted, 
    gameEnded: room.gameEnded,
    theme: room.theme,
    quizReady: room.quizReady, 
    isCreator: false, 
  });
}

function broadcastRoundStart(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const q = currentQuestion(room);
  if (!q) return;
 
  io.to(roomCode).emit("round", {
    index: room.roundIndex + 1, 
    total: room.questions.length, 
    question: q.question, 
    options: q.options, 
  });
 
  const msLeft = Math.max(0, room.roundDeadline - Date.now());
  io.to(roomCode).emit("timer", Math.ceil(msLeft / 1000));
}


function startRound(roomCode, index) {
  const room = rooms.get(roomCode);
  if (!room) return;

  
  room.roundIndex = index; 
  room.roundActive = true; 
  room.roundStartTime = Date.now(); 
  room.roundDeadline = room.roundStartTime + ROUND_DURATION_MS; 


  for (const p of room.players.values()) {
    if (typeof p.lastCorrectRound !== "number") p.lastCorrectRound = -1;
    p.hasAnswered = false; 
  }


  broadcastRoundStart(roomCode);
 
  emitScoreboard(roomCode);
}