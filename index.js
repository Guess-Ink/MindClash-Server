// ============================================
// IMPORT DEPENDENCIES
// ============================================
// Load environment variables dari file .env (untuk OPENAI_API_KEY)
require("dotenv").config();
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const OpenAI = require("openai");

// ============================================
// SETUP SERVER & SOCKET.IO
// ============================================
const app = express();
const server = createServer(app);
// Setup Socket.IO untuk komunikasi real-time dengan CORS agar client bisa connect
const io = new Server(server, {
  cors: {
    origin: "*", // Allow semua origin untuk development
  },
});

// ============================================
// SETUP OPENAI CLIENT
// ============================================
// Initialize OpenAI client untuk generate quiz questions
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// SIMPLE HEALTH CHECK ROUTE
// ============================================
// Route untuk cek apakah server running
app.get("/", (req, res) => {
  res.send("<h1>Quiz Game Server OK</h1>");
});

// ============================================
// GAME CONFIGURATION
// ============================================
// Tema-tema quiz yang tersedia
const QUIZ_THEMES = {
  OLAHRAGA: "Olahraga",
  MATEMATIKA: "Matematika",
  SEJARAH: "Sejarah Umum",
  IPA: "Ilmu Pengetahuan Alam",
};

// Konfigurasi game
const ROUND_DURATION_MS = 30_000; // 30 detik per soal
const MAX_PLAYERS_PER_ROOM = 10; // Maksimal 10 pemain per room

// ============================================
// SCORING SYSTEM
// ============================================
// Fungsi untuk menghitung poin berdasarkan kecepatan menjawab
// Semakin cepat menjawab, semakin banyak poin yang didapat
function calculatePoints(elapsedSeconds) {
  if (elapsedSeconds < 5) return 10; // Jawab < 5 detik: 10 poin
  if (elapsedSeconds < 10) return 8; // Jawab < 10 detik: 8 poin
  if (elapsedSeconds < 15) return 6; // Jawab < 15 detik: 6 poin
  if (elapsedSeconds < 20) return 4; // Jawab < 20 detik: 4 poin
  if (elapsedSeconds < 30) return 2; // Jawab < 30 detik: 2 poin
  return 0; // Timeout atau tidak menjawab: 0 poin
}

// ============================================
// OPENAI QUIZ GENERATOR
// ============================================
// Fungsi untuk generate 10 soal quiz menggunakan OpenAI berdasarkan tema
async function generateQuizQuestions(theme) {
  console.log(`🤖 Generating quiz for theme: ${theme}`);
  console.log(`🔑 API Key exists: ${!!process.env.OPENAI_API_KEY}`);

  try {
    // Prompt untuk OpenAI: meminta 10 soal quiz dengan format JSON strict
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

    // Call OpenAI API untuk generate questions
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
      temperature: 0.7, // Kreativitas sedang
      max_tokens: 2000, // Cukup untuk 10 soal
    });

    // Parse response dari OpenAI
    const content = completion.choices[0].message.content.trim();
    // Remove markdown code blocks jika ada (```json ... ```)
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
    // Jika OpenAI gagal (error, quota habis, dll), gunakan fallback questions
    console.error("❌ Error generating quiz:", error.message);
    console.log("⚠️ Using fallback questions instead");
    // Fallback questions: 10 soal default jika OpenAI gagal
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


// ============================================
// ROOM MANAGEMENT & GAME STATE
// ============================================
// Map untuk menyimpan semua room dan state game-nya
// Structure: roomCode -> { players, roundIndex, questions, gameStarted, dll }
const rooms = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================

// Fungsi untuk normalize text (trim dan lowercase) untuk perbandingan jawaban
function normalize(text) {
  return (text || "").toString().trim().toLowerCase();
}

// Fungsi untuk mendapatkan atau membuat room baru
function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    // Buat room baru dengan state awal
    rooms.set(roomCode, {
      players: new Map(), // Map<socketId, playerData>
      roundIndex: 0, // Index soal saat ini (0-9)
      roundActive: false, // Apakah round sedang berjalan
      roundDeadline: 0, // Timestamp deadline round (ms)
      roundStartTime: 0, // Timestamp mulai round (ms)
      timerInterval: null, // Interval untuk countdown timer
      gameStarted: false, // Apakah game sudah mulai
      gameEnded: false, // Apakah game sudah selesai
      theme: null, // Tema quiz yang dipilih
      questions: [], // Array 10 soal quiz
      quizReady: false, // Apakah quiz sudah di-generate
      roomCreator: null, // Socket ID pembuat room (yang pertama join)
    });
  }
  return rooms.get(roomCode);
}

// Fungsi untuk mendapatkan soal saat ini dari room
function currentQuestion(room) {
  return room.questions[room.roundIndex] || null;
}

// ============================================
// EMIT STATE FUNCTIONS
// ============================================

// Fungsi untuk mengirim scoreboard ke semua player di room
function emitScoreboard(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  // Buat array scoreboard dan sort by score (tertinggi dulu)
  const scoreboard = Array.from(room.players.values())
    .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  // Kirim scoreboard ke semua client di room
  io.to(roomCode).emit("scoreboard", scoreboard);
}

// Fungsi untuk mengirim state players (list pemain, status ready, dll) ke semua player di room
function emitPlayersState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  // Buat array data players dengan info id, nickname, dan status ready
  const players = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    ready: p.ready || false, // Status ready untuk mulai game
  }));
  // Kirim state ke semua client di room
  io.to(roomCode).emit("playersState", {
    players, // List semua player
    gameStarted: room.gameStarted, // Apakah game sudah mulai
    gameEnded: room.gameEnded, // Apakah game sudah selesai
    theme: room.theme, // Tema quiz yang dipilih
    quizReady: room.quizReady, // Apakah quiz sudah di-generate
    isCreator: false, // Default false, akan diset per-socket di handler join
  });
}

// ============================================
// ROUND MANAGEMENT
// ============================================

// Fungsi untuk broadcast soal baru ke semua player di room
function broadcastRoundStart(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const q = currentQuestion(room);
  if (!q) return;
  // Kirim data soal ke semua player
  io.to(roomCode).emit("round", {
    index: room.roundIndex + 1, // Nomor soal (1-10)
    total: room.questions.length, // Total soal (10)
    question: q.question, // Text pertanyaan
    options: q.options, // Array pilihan A, B, C, D
  });
  // Kirim timer countdown
  const msLeft = Math.max(0, room.roundDeadline - Date.now());
  io.to(roomCode).emit("timer", Math.ceil(msLeft / 1000));
}

// Fungsi untuk memulai round/soal baru
function startRound(roomCode, index) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Set state untuk round baru
  room.roundIndex = index; // Index soal (0-9)
  room.roundActive = true; // Tandai round aktif
  room.roundStartTime = Date.now(); // Catat waktu mulai (untuk hitung kecepatan jawab)
  room.roundDeadline = room.roundStartTime + ROUND_DURATION_MS; // Deadline = sekarang + 30 detik

  // Reset flag per-round untuk setiap player
  for (const p of room.players.values()) {
    if (typeof p.lastCorrectRound !== "number") p.lastCorrectRound = -1;
    p.hasAnswered = false; // Track apakah user sudah jawab di round ini (untuk auto-advance)
  }

  // Kirim soal ke semua player
  broadcastRoundStart(roomCode);
  // Kirim scoreboard terbaru
  emitScoreboard(roomCode);

  // Setup countdown timer (update setiap 1 detik)
  clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    const msLeft = Math.max(0, room.roundDeadline - Date.now());
    const secondsLeft = Math.ceil(msLeft / 1000);
    io.to(roomCode).emit("timer", secondsLeft); // Kirim sisa waktu ke client
    if (msLeft <= 0) {
      endRound(roomCode); // Waktu habis, akhiri round
    }
  }, 1000);
}

// Fungsi untuk cek apakah semua pemain sudah jawab (untuk auto-advance ke soal berikutnya)
function checkAllAnswered(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.players.size === 0) return false;

  // Loop semua player, jika ada yang belum jawab return false
  for (const p of room.players.values()) {
    if (!p.hasAnswered) return false;
  }
  return true; // Semua sudah jawab
}

// Fungsi untuk mengakhiri round saat ini
function endRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Stop timer countdown
  clearInterval(room.timerInterval);
  room.timerInterval = null;
  room.roundActive = false;

  const next = room.roundIndex + 1;
  if (next < room.questions.length) {
    // Masih ada soal berikutnya, delay 1.5 detik lalu lanjut
    setTimeout(() => startRound(roomCode, next), 1500);
  } else {
    // Sudah soal terakhir, game selesai
    room.gameEnded = true;
    room.gameStarted = false;

    // Buat final scoreboard dan sort by score
    const finalScoreboard = Array.from(room.players.values())
      .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score }))
      .sort(
        (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)
      );

    // Kirim game over dengan final leaderboard
    io.to(roomCode).emit("gameOver", {
      totalRounds: room.questions.length,
      finalScoreboard: finalScoreboard,
    });

    // Update state players (gameEnded = true)
    emitPlayersState(roomCode);
  }
}

// ============================================
// GAME RESTART & READY CHECK
// ============================================

// Fungsi untuk restart game (dipanggil saat player klik "Main Lagi")
function restartGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Reset semua game state ke awal
  room.gameStarted = false;
  room.gameEnded = false;
  room.roundIndex = 0;
  room.quizReady = false; // Quiz harus di-generate ulang
  room.theme = null; // Theme harus dipilih ulang
  room.questions = []; // Clear questions

  // Reset semua player state
  for (const p of room.players.values()) {
    p.score = 0; // Reset score
    p.lastCorrectRound = -1; // Reset jawaban benar terakhir
    p.ready = false; // Reset ready status
  }

  // Kirim state update ke semua player
  emitScoreboard(roomCode);
  emitPlayersState(roomCode);
}

// Fungsi untuk cek apakah semua player sudah ready (untuk mulai game)
function checkAllReady(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.players.size === 0) return false;

  // Loop semua player, jika ada yang belum ready return false
  for (const p of room.players.values()) {
    if (!p.ready) return false;
  }
  return true; // Semua sudah ready
}


// ============================================
// SOCKET.IO CONNECTION & EVENT HANDLERS
// ============================================

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
  let userRoom = null; // Track room mana yang di-join oleh socket ini

  // ============================================
  // EVENT: JOIN ROOM
  // ============================================
  // Handler saat user join ke room
  socket.on("join", ({ nickname, roomCode }) => {
    const name = (nickname || "").toString().trim() || "Pemain";
    const code = (roomCode || "").toString().trim().toUpperCase() || "DEFAULT";

    // Cek kapasitas room (maksimal 10 pemain)
    const room = getOrCreateRoom(code);
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      socket.emit("joinError", {
        message: "Room penuh! Maksimal 10 pemain per room.",
      });
      return;
    }

    // Set room creator: player pertama yang join
    if (room.players.size === 0) {
      room.roomCreator = socket.id;
    }

    // Join ke socket.io room untuk broadcast messages
    socket.join(code);
    userRoom = code;

    // Tambahkan player ke room dengan state awal
    room.players.set(socket.id, {
      id: socket.id,
      nickname: name,
      score: 0, // Score awal 0
      lastCorrectRound: -1, // Belum jawab benar di round manapun
      ready: false, // Belum ready
    });

  

    // Kirim konfirmasi join ke client dengan info isCreator
    const isCreator = room.roomCreator === socket.id;
    socket.emit("joined", { id: socket.id, roomCode: code, isCreator });

    // Jika game sedang berjalan, kirim state soal saat ini ke player baru
    if (room.gameStarted) {
      const q = currentQuestion(room);
      if (q) {
        // Kirim soal saat ini
        socket.emit("round", {
          index: room.roundIndex + 1,
          total: room.questions.length,
          question: q.question,
          options: q.options,
        });
        // Kirim sisa waktu timer
        const msLeft = Math.max(0, room.roundDeadline - Date.now());
        socket.emit("timer", Math.ceil(msLeft / 1000));
      }
    }

    // Kirim scoreboard dan players state terbaru
    emitScoreboard(code);
    emitPlayersState(code);
  });

  // ============================================
  // EVENT: SET THEME (hanya creator)
  // ============================================
  // Handler saat room creator memilih tema quiz
  socket.on("setTheme", async ({ theme }) => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);

    // Validasi: hanya room creator yang bisa set theme
    if (!room || room.roomCreator !== socket.id) {
      socket.emit("themeError", {
        message: "Hanya pembuat room yang bisa memilih tema",
      });
      return;
    }

    // Validasi: tema harus valid
    if (!QUIZ_THEMES[theme]) {
      socket.emit("themeError", { message: "Tema tidak valid" });
      return;
    }

    // Set tema yang dipilih
    room.theme = theme;
    io.to(userRoom).emit("themeSet", { theme: QUIZ_THEMES[theme] });

    // Generate quiz questions menggunakan OpenAI (async)
    io.to(userRoom).emit("generatingQuiz"); // Notifikasi "sedang generate..."
    const questions = await generateQuizQuestions(QUIZ_THEMES[theme]);
    room.questions = questions; // Simpan 10 soal ke room
    room.quizReady = true; // Tandai quiz sudah siap
    io.to(userRoom).emit("quizReady"); // Notifikasi quiz siap
    emitPlayersState(userRoom); // Update state (quizReady = true)
  });


  // ============================================
  // EVENT: READY (player siap mulai game)
  // ============================================
  // Handler saat player klik tombol "SIAP"
  socket.on("ready", () => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    // Validasi: quiz harus sudah ready (sudah di-generate)
    if (!room.quizReady) {
      socket.emit("readyError", {
        message: "Tunggu quiz di-generate terlebih dahulu",
      });
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) return;

    // Toggle status ready player (klik lagi untuk unready)
    player.ready = !player.ready;
    emitPlayersState(userRoom); // Update status ready ke semua player

    // Jika semua player sudah ready, mulai game
    if (checkAllReady(userRoom) && !room.gameStarted && room.quizReady) {
      room.gameStarted = true;
      room.gameEnded = false;
      emitPlayersState(userRoom); // Update gameStarted = true
      io.to(userRoom).emit("gameStarting"); // Notifikasi "game dimulai..."
      setTimeout(() => startRound(userRoom, 0), 2000); // Delay 2 detik lalu mulai soal pertama
    }
  });

  // ============================================
  // EVENT: GUESS (player menjawab soal)
  // ============================================
  // Handler saat player memilih jawaban
  socket.on("guess", ({ answer }) => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);
    // Validasi: room harus ada dan round harus aktif
    if (!room || !room.roundActive) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    // Mark player sudah jawab (untuk auto-advance)
    if (!player.hasAnswered) {
      player.hasAnswered = true;
    }

    // Jika player sudah jawab benar di round ini, ignore jawaban berikutnya
    if (player.lastCorrectRound === room.roundIndex) {
      socket.emit("guessResult", { 
        correct: true, 
        already: true, 
        points: 0,
        correctAnswer: q.correctAnswer 
      });

      // Cek apakah semua player sudah jawab (untuk auto-advance)
      if (checkAllAnswered(userRoom)) {
        setTimeout(() => endRound(userRoom), 1000); // Delay 1s untuk feedback
      }
      return;
    }

    // Ambil soal saat ini
    const q = currentQuestion(room);
    if (!q) return;

    // Cek apakah jawaban benar (compare dengan correctAnswer: A/B/C/D)
    const isCorrect = normalize(answer) === normalize(q.correctAnswer);

    if (isCorrect) {
      // Jawaban benar! Hitung poin berdasarkan kecepatan
      const elapsedMs = Date.now() - room.roundStartTime; // Waktu dari mulai round
      const elapsedSeconds = Math.floor(elapsedMs / 1000); // Convert ke detik
      const points = calculatePoints(elapsedSeconds); // Hitung poin (10, 8, 6, 4, 2, atau 0)

      player.score += points; // Tambahkan poin ke total score
      player.lastCorrectRound = room.roundIndex; // Mark sudah jawab benar di round ini

      // Kirim hasil ke player (benar + poin yang didapat)
      socket.emit("guessResult", {
        correct: true,
        points: points,
        elapsedSeconds: elapsedSeconds,
        correctAnswer: q.correctAnswer,
      });

      emitScoreboard(userRoom); // Update scoreboard ke semua player
    } else {
      // Jawaban salah - kirim jawaban yang benar
      socket.emit("guessResult", { 
        correct: false, 
        points: 0,
        correctAnswer: q.correctAnswer 
      });
    }

    // Cek apakah semua player sudah jawab (auto-advance feature)
    if (checkAllAnswered(userRoom)) {
      setTimeout(() => endRound(userRoom), 1500); // Delay 1.5s untuk feedback, lalu next round
    }
  });

  // ============================================
  // EVENT: PLAY AGAIN (restart game)
  // ============================================
  // Handler saat player klik "Main Lagi" di game over screen
  socket.on("playAgain", () => {
    if (!userRoom) return;
    restartGame(userRoom); // Reset semua state game
  });

  // ============================================
  // EVENT: REQUEST STATE (sync state)
  // ============================================
  // Handler saat client request state update (untuk sync setelah mount)
  socket.on("requestState", () => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    // Kirim ulang scoreboard dan players state terbaru
    emitScoreboard(userRoom);
    emitPlayersState(userRoom);
  });


  // ============================================
  // EVENT: LEAVE ROOM (user klik "Selesai")
  // ============================================
  // Handler saat player klik tombol "Selesai" untuk keluar dari room
  socket.on("leaveRoom", () => {
    if (!userRoom) return;
    const room = rooms.get(userRoom);
    if (!room) return;

    const roomCode = userRoom; // Simpan reference sebelum reset

    // Hapus player dari room
    room.players.delete(socket.id);
    console.log("user left room", socket.id, "from room", roomCode);

    // Leave dari socket.io room (stop menerima broadcast)
    socket.leave(roomCode);

    // Update state untuk pemain yang masih ada di room
    emitScoreboard(roomCode);
    emitPlayersState(roomCode);

    // Reset userRoom untuk socket ini
    userRoom = null;

    // Cleanup: hapus room jika sudah kosong (tidak ada player)
    if (room.players.size === 0) {
      clearInterval(room.timerInterval); // Stop timer jika ada
      rooms.delete(roomCode); // Hapus room dari Map
      console.log("room deleted (empty after leave)", roomCode);
    }
  });

  // ============================================
  // EVENT: DISCONNECT (user close tab/browser)
  // ============================================
  // Handler saat user disconnect (close tab, lost connection, dll)
  socket.on("disconnect", () => {
    if (userRoom) {
      const room = rooms.get(userRoom);
      if (room) {
        // Hapus player dari room
        room.players.delete(socket.id);

        // Update state untuk pemain yang masih ada
        emitScoreboard(userRoom);
        emitPlayersState(userRoom);
        console.log("user disconnected", socket.id, "from room", userRoom);

        // Cleanup: hapus room jika sudah kosong
        if (room.players.size === 0) {
          clearInterval(room.timerInterval); // Stop timer
          rooms.delete(userRoom); // Hapus room dari Map
          console.log("room deleted", userRoom);
        }
      }
    }
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
  console.log(`Rooms will be created on-demand when users join`);
});
