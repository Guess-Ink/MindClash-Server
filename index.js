// ============= FAWWAZ 1 ==========================

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

// ============== FAWWAZ 2 ==========================

// ============================================DAY 1 ============================================


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

// FAWWAZ 1 ====================

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
      socket.emit("guessResult", { correct: true, already: true, points: 0 });

      // Cek apakah semua player sudah jawab (untuk auto-advance)
      if (checkAllAnswered(userRoom)) {
        setTimeout(() => endRound(userRoom), 1000); // Delay 1s untuk feedback
      }
      return;
    }
  });