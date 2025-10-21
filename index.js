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

// ====== WELDY 1 =======================

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

// ======= WELDY 2 ======================

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