# MindClash-Server — API Documentation

Ini adalah dokumentasi API untuk server Quiz Game (Socket.IO + Express + OpenAI). Server berkomunikasi terutama lewat Socket.IO events. Dokumen ini menjelaskan semua event (client -> server dan server -> client), shape payload, contoh penggunaan client, environment variables, dan catatan perilaku.

## Ringkasan singkat

- HTTP: satu endpoint health-check `GET /` yang mengembalikan HTML sederhana.
- Realtime: semua alur game (join, set theme, ready, guess, scoreboard, dll) melalui Socket.IO.
- Port default: 3000 (dapat diubah lewat `PORT` env var).
- OpenAI: bila `OPENAI_API_KEY` tersedia, server akan memanggil OpenAI untuk generate 10 soal; jika gagal server memakai fallback questions.

---

## Environment

- OPENAI_API_KEY (optional) — API key OpenAI untuk generate soal.
- PORT (optional) — port server (default 3000).

Contoh `.env`:

```env
OPENAI_API_KEY=sk-...
PORT=3000
```

---

## Menjalankan server

Install dependency dan jalankan server:

```bash
cd MindClash-Server
npm install
node index.js
# dev: npx nodemon index.js
```

Server akan log alamat dan menunggu koneksi Socket.IO.

---

## HTTP Endpoint

- GET /
  - Response: HTML string `<h1>Quiz Game Server OK</h1>`

Contoh:

```bash
curl http://localhost:3000/
```

---

## Aturan umum & konstanta penting

- ROUND_DURATION_MS = 30000 (30 detik per soal)
- MAX_PLAYERS_PER_ROOM = 10
- QUIZ_THEMES keys (dipakai oleh server):
  - OLAHRAGA -> "Olahraga"
  - MATEMATIKA -> "Matematika"
  - SEJARAH -> "Sejarah Umum"
  - IPA -> "Ilmu Pengetahuan Alam"

Soal yang diharapkan: array 10 objek dengan struktur:

```json
{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctAnswer": "A"
}
```

---

## Socket.IO — koneksi

Client harus melakukan koneksi ke server Socket.IO (default `http://localhost:3000`). Gunakan library `socket.io-client` pada browser atau Node.

Contoh inisialisasi:

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:3000");

socket.on("connect", () => console.log("connected", socket.id));
```

---

## Events: Client -> Server (dengan payload)

1. `join`

- Payload: { nickname, roomCode }
- Tujuan: Join atau create room. `roomCode` akan di-normalize ke uppercase. Jika room kosong, pengirim menjadi `roomCreator`.
- Errors yang mungkin dikirim balik: `joinError` { message } (room penuh atau game sedang berjalan).

2. `setTheme`

- Payload: { theme }
- Tujuan: Hanya boleh dipanggil oleh `roomCreator`. `theme` harus salah satu key `QUIZ_THEMES` (contoh: "MATEMATIKA").
- Side-effects:
  - Emit `themeSet` { theme } (friendly name)
  - Emit `generatingQuiz`
  - Memanggil OpenAI (jika API key ada) untuk generate soal
  - Setelah selesai: set `room.questions`, `quizReady = true`, emit `quizReady`, emit `playersState`
- Errors: `themeError` { message }

3. `ready`

- Payload: none
- Tujuan: Toggle status ready pemain. Jika semua player ready dan `quizReady` true, server memulai game (set `gameStarted = true` dan mulai round pertama setelah delay).
- Errors: `readyError` { message } (mis. ketika quiz belum di-generate)

4. `guess`

- Payload: { answer }
- Tujuan: Player mengirim jawaban untuk round aktif. `answer` dibandingkan dengan `correctAnswer` (A/B/C/D).
- Behavior:
  - Server menandai player `hasAnswered = true`.
  - Jika jawaban benar pertama kali di round ini, server menghitung poin berdasarkan fungsi `calculatePoints(elapsedSeconds)`, menambahkan ke `player.score`, dan mengirim `guessResult` ke player.
  - Jika player sudah benar sebelumnya di round yang sama, server mengirim `guessResult` dengan `already: true`.
  - Jika salah, server mengirim `guessResult` yang menunjukkan `correct: false` dan `correctAnswer`.
- Response: `guessResult` object. Contoh:
  - Benar pertama kali:
    { correct: true, points: 10, elapsedSeconds: 3, correctAnswer: "A" }
  - Sudah benar sebelumnya:
    { correct: true, already: true, points: 0, correctAnswer: "A" }
  - Salah:
    { correct: false, points: 0, correctAnswer: "A" }

5. `playAgain`

- Payload: none
- Tujuan: Restart game state (reset scores, clear questions, set `quizReady=false`, `theme=null`). Server emit `scoreboard` dan `playersState`.

6. `requestState`

- Payload: none
- Tujuan: Minta sinkronisasi state (server akan mengirim `scoreboard` dan `playersState`). Berguna ketika client baru mount atau re-connect.

7. `leaveRoom`

- Payload: none
- Tujuan: Player keluar dari room. Server menghapus player, emit updates untuk yang tersisa, dan jika room kosong, menghapus room dari memori.

8. `disconnect` (socket built-in)

- Tujuan: Saat user drop connection, server meng-handle penghapusan player sama seperti `leaveRoom`.

---

## Events: Server -> Client (yang harus di-listen client)

- `joined` — Payload: { id, roomCode, isCreator }
- `joinError` — Payload: { message }
- `themeSet` — Payload: { theme }
- `generatingQuiz` — Payload: none
- `quizReady` — Payload: none
- `playersState` — Payload: {
  players: [{ id, nickname, ready }],
  gameStarted: boolean,
  gameEnded: boolean,
  theme: string|null,
  quizReady: boolean,
  isCreator: boolean
  }
- `scoreboard` — Payload: [ { id, nickname, score } ] (sorted desc by score)
- `round` — Payload: { index, total, question, options }
- `timer` — Payload: number (seconds left)
- `guessResult` — Payload: see `guess` section
- `gameOver` — Payload: { totalRounds, finalScoreboard }
- `gameStarting` — Payload: none (server announces start sequence)

---

## Data structures (ringkas)

- Room (internal):

  - players: Map<socketId, { id, nickname, score, lastCorrectRound, ready, hasAnswered }>
  - questions: Array(10)
  - roundIndex, roundActive, roundStartTime, roundDeadline, timerInterval
  - gameStarted, gameEnded, quizReady, theme, roomCreator

- Question object:
  - { question: string, options: string[], correctAnswer: 'A'|'B'|'C'|'D' }

---

## Contoh alur (client-side snippets)

1. Join room dan (opsional) set theme oleh creator

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:3000");

socket.emit("join", { nickname: "Budi", roomCode: "ROOM1" });

socket.on("joined", ({ id, roomCode, isCreator }) => {
  console.log("joined", id, roomCode, isCreator);
  if (isCreator) socket.emit("setTheme", { theme: "MATEMATIKA" });
});

socket.on("generatingQuiz", () => console.log("generating quiz..."));
socket.on("quizReady", () => console.log("quiz ready"));
```

2. Ready & game start

```js
// toggle ready
socket.emit("ready");

socket.on("gameStarting", () => console.log("game will start"));
socket.on("round", (r) => {
  console.log(r.index, r.question, r.options);
});

socket.on("timer", (secondsLeft) => console.log("time", secondsLeft));
```

3. Menjawab (guess)

```js
// player memilih jawaban 'A'
socket.emit("guess", { answer: "A" });

socket.on("guessResult", (res) => console.log("guessResult", res));
```

---

## Error handling & notes

- Server mengirim event error spesifik (`joinError`, `themeError`, `readyError`) dengan objek `{ message }`.
- Jika OpenAI mengalami error atau API key tidak ada, server menggunakan fallback questions (10 soal default) dan tetap mengirim `quizReady`.
- Jawaban benar dicatat menggunakan `lastCorrectRound` sehingga pemain tidak bisa mendapat poin lebih dari sekali per soal.
- Room dihapus dari memori ketika tidak ada pemain tersisa.

---

## Troubleshooting cepat

- Jika quiz tidak tergenerate: periksa console server untuk log error OpenAI.
- Jika client tidak menerima events: pastikan origin CORS dan URL client sama, server menggunakan `origin: '*'` untuk development.
- Untuk development, jalankan server dengan `npx nodemon index.js` agar auto-reload.

