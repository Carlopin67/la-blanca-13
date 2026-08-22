// ============================================================
// MOTOR DE AJEDREZ (parser SAN + estado del tablero)
// ============================================================

function createInitialBoard() {
  const empty = () => new Array(8).fill(null);
  const board = [empty(), empty(), empty(), empty(), empty(), empty(), empty(), empty()];
  const backRank = ['R','N','B','Q','K','B','N','R'];
  for (let f = 0; f < 8; f++) {
    board[0][f] = { type: backRank[f], color: 'b' };
    board[1][f] = { type: 'P', color: 'b' };
    board[6][f] = { type: 'P', color: 'w' };
    board[7][f] = { type: backRank[f], color: 'w' };
  }
  return board;
}

function newGameState() {
  return {
    board: createInitialBoard(),
    turn: 'w',
    enPassantTarget: null,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    moveHistory: [],
    positions: [],
    lastMoveSquares: [null], // {from, to} por posición, para resaltar
    result: null
  };
}

function squareToCoords(square) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - parseInt(square[1], 10);
  return { file, rank };
}
function coordsToSquare(file, rank) {
  return String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank);
}
function inBounds(file, rank) { return file >= 0 && file < 8 && rank >= 0 && rank < 8; }
function pieceAt(board, file, rank) { return inBounds(file, rank) ? board[rank][file] : null; }

function isPathClear(board, fromFile, fromRank, toFile, toRank) {
  const dFile = Math.sign(toFile - fromFile);
  const dRank = Math.sign(toRank - fromRank);
  let f = fromFile + dFile, r = fromRank + dRank;
  while (f !== toFile || r !== toRank) {
    if (pieceAt(board, f, r)) return false;
    f += dFile; r += dRank;
  }
  return true;
}

function canPieceReach(state, piece, fromFile, fromRank, toFile, toRank, isCapture) {
  const board = state.board;
  const dFile = toFile - fromFile;
  const dRank = toRank - fromRank;
  switch (piece.type) {
    case 'N':
      return (Math.abs(dFile) === 1 && Math.abs(dRank) === 2) ||
             (Math.abs(dFile) === 2 && Math.abs(dRank) === 1);
    case 'B':
      if (Math.abs(dFile) !== Math.abs(dRank)) return false;
      return isPathClear(board, fromFile, fromRank, toFile, toRank);
    case 'R':
      if (dFile !== 0 && dRank !== 0) return false;
      return isPathClear(board, fromFile, fromRank, toFile, toRank);
    case 'Q':
      if (dFile !== 0 && dRank !== 0 && Math.abs(dFile) !== Math.abs(dRank)) return false;
      return isPathClear(board, fromFile, fromRank, toFile, toRank);
    case 'K':
      return Math.abs(dFile) <= 1 && Math.abs(dRank) <= 1 && (dFile !== 0 || dRank !== 0);
    case 'P': {
      const direction = piece.color === 'w' ? -1 : 1;
      const startRank = piece.color === 'w' ? 6 : 1;
      if (isCapture) {
        return dRank === direction && Math.abs(dFile) === 1;
      } else {
        if (dFile !== 0) return false;
        if (dRank === direction && !pieceAt(board, toFile, toRank)) return true;
        if (dRank === 2 * direction && fromRank === startRank &&
            !pieceAt(board, toFile, fromRank + direction) &&
            !pieceAt(board, toFile, toRank)) return true;
        return false;
      }
    }
  }
  return false;
}

function findSourceSquares(state, pieceType, color, toFile, toRank, isCapture, hintFile, hintRank) {
  const board = state.board;
  const candidates = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = pieceAt(board, f, r);
      if (!p || p.color !== color || p.type !== pieceType) continue;
      if (hintFile !== null && f !== hintFile) continue;
      if (hintRank !== null && r !== hintRank) continue;
      if (canPieceReach(state, p, f, r, toFile, toRank, isCapture)) {
        candidates.push({ file: f, rank: r });
      }
    }
  }
  return candidates;
}

const SAN_REGEX = /^([NBRQK]?)([a-h]?)([1-8]?)(x?)([a-h][1-8])(=([NBRQ]))?[+#]?$/;

function parseSANToken(token) {
  if (token === 'O-O' || token === '0-0') return { castle: 'K' };
  if (token === 'O-O-O' || token === '0-0-0') return { castle: 'Q' };
  const match = SAN_REGEX.exec(token);
  if (!match) return null;
  const [, pieceLetter, hintFileChar, hintRankChar, captureFlag, destSquare, , promotion] = match;
  return {
    pieceType: pieceLetter || 'P',
    hintFile: hintFileChar ? hintFileChar.charCodeAt(0) - 'a'.charCodeAt(0) : null,
    hintRank: hintRankChar ? 8 - parseInt(hintRankChar, 10) : null,
    isCapture: captureFlag === 'x',
    dest: squareToCoords(destSquare),
    promotion: promotion || null
  };
}

function applyMove(state, token) {
  const board = state.board;
  const color = state.turn;
  const parsed = parseSANToken(token);
  if (!parsed) { console.warn('No se pudo parsear:', token); return false; }

  let movedFrom = null, movedTo = null;

  if (parsed.castle) {
    const rank = color === 'w' ? 7 : 0;
    if (parsed.castle === 'K') {
      board[rank][6] = board[rank][4]; board[rank][4] = null;
      board[rank][5] = board[rank][7]; board[rank][7] = null;
      movedFrom = coordsToSquare(4, rank); movedTo = coordsToSquare(6, rank);
    } else {
      board[rank][2] = board[rank][4]; board[rank][4] = null;
      board[rank][3] = board[rank][0]; board[rank][0] = null;
      movedFrom = coordsToSquare(4, rank); movedTo = coordsToSquare(2, rank);
    }
    state.castling[color + 'K'] = false;
    state.castling[color + 'Q'] = false;
  } else {
    const { file: toFile, rank: toRank } = parsed.dest;
    const candidates = findSourceSquares(
      state, parsed.pieceType, color, toFile, toRank,
      parsed.isCapture, parsed.hintFile, parsed.hintRank
    );
    if (candidates.length === 0) { console.warn('Sin origen válido para:', token); return false; }
    const { file: fromFile, rank: fromRank } = candidates[0];
    const movingPiece = board[fromRank][fromFile];

    if (parsed.pieceType === 'P' && parsed.isCapture && !pieceAt(board, toFile, toRank)) {
      const capturedRank = toRank + (color === 'w' ? 1 : -1);
      board[capturedRank][toFile] = null;
    }

    board[toRank][toFile] = movingPiece;
    board[fromRank][fromFile] = null;

    if (parsed.promotion) board[toRank][toFile] = { type: parsed.promotion, color };

    if (movingPiece.type === 'K') {
      state.castling[color + 'K'] = false;
      state.castling[color + 'Q'] = false;
    }
    if (movingPiece.type === 'R') {
      if (fromFile === 0) state.castling[color + 'Q'] = false;
      if (fromFile === 7) state.castling[color + 'K'] = false;
    }

    movedFrom = coordsToSquare(fromFile, fromRank);
    movedTo = coordsToSquare(toFile, toRank);

    if (parsed.pieceType === 'P' && Math.abs(toRank - fromRank) === 2) {
      state.enPassantTarget = { file: toFile, rank: (toRank + fromRank) / 2 };
    } else {
      state.enPassantTarget = null;
    }
  }

  state.turn = color === 'w' ? 'b' : 'w';
  state.moveHistory.push(token);
  state.positions.push(JSON.parse(JSON.stringify(board)));
  state.lastMoveSquares.push({ from: movedFrom, to: movedTo });
  return true;
}

function loadGame(pgnText) {
  const state = newGameState();
  state.positions.push(JSON.parse(JSON.stringify(state.board)));

  const resultMatch = pgnText.match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/);
  if (resultMatch) {
    state.result = resultMatch[1];
    pgnText = pgnText.slice(0, resultMatch.index);
  }

  const tokens = pgnText
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  for (const token of tokens) applyMove(state, token);
  return state;
}

// ============================================================
// LEGALIDAD DE MOVIMIENTOS — necesario solo para la edición manual
// de ramificaciones (el resto de la app se limita a reproducir SAN
// ya escrito, donde esto no hace falta).
// ============================================================

function findKingSquare(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'K' && p.color === color) return { file: f, rank: r };
    }
  }
  return null;
}

function isSquareAttacked(board, file, rank, byColor) {
  const state = { board };
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p || p.color !== byColor) continue;
      if (canPieceReach(state, p, f, r, file, rank, true)) return true;
    }
  }
  return false;
}

function isKingInCheck(board, color) {
  const king = findKingSquare(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king.file, king.rank, color === 'w' ? 'b' : 'w');
}

function wouldLeaveKingInCheck(board, fromFile, fromRank, toFile, toRank, color, isEnPassant) {
  const copy = board.map(row => row.slice());
  if (isEnPassant) {
    const capturedRank = toRank + (color === 'w' ? 1 : -1);
    copy[capturedRank][toFile] = null;
  }
  copy[toRank][toFile] = copy[fromRank][fromFile];
  copy[fromRank][fromFile] = null;
  return isKingInCheck(copy, color);
}

// Todas las casillas a las que la pieza en (fromFile,fromRank) puede moverse
// legalmente ahora mismo (respetando jaques, enroque y captura al paso).
function getLegalDestinations(state, fromFile, fromRank) {
  const board = state.board;
  const piece = board[fromRank][fromFile];
  if (!piece) return [];
  const color = piece.color;
  const enemyColor = color === 'w' ? 'b' : 'w';
  const results = [];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if (f === fromFile && r === fromRank) continue;
      const target = board[r][f];
      if (target && target.color === color) continue;

      const isCapture = !!target;
      let isEnPassant = false;
      let reachable;

      if (piece.type === 'P' && !target && Math.abs(f - fromFile) === 1 &&
          state.enPassantTarget && state.enPassantTarget.file === f && state.enPassantTarget.rank === r) {
        reachable = canPieceReach(state, piece, fromFile, fromRank, f, r, true);
        isEnPassant = reachable;
      } else {
        reachable = canPieceReach(state, piece, fromFile, fromRank, f, r, isCapture);
      }
      if (!reachable) continue;
      if (wouldLeaveKingInCheck(board, fromFile, fromRank, f, r, color, isEnPassant)) continue;

      results.push({ file: f, rank: r, isCapture: isCapture || isEnPassant, isEnPassant });
    }
  }

  if (piece.type === 'K' && !isKingInCheck(board, color)) {
    const rank = fromRank;
    const rights = state.castling;
    if (rights[color + 'K'] && !pieceAt(board, 5, rank) && !pieceAt(board, 6, rank)) {
      const rook = pieceAt(board, 7, rank);
      if (rook && rook.type === 'R' && rook.color === color &&
          !isSquareAttacked(board, 5, rank, enemyColor) && !isSquareAttacked(board, 6, rank, enemyColor)) {
        results.push({ file: 6, rank, isCastle: 'K' });
      }
    }
    if (rights[color + 'Q'] && !pieceAt(board, 1, rank) && !pieceAt(board, 2, rank) && !pieceAt(board, 3, rank)) {
      const rook = pieceAt(board, 0, rank);
      if (rook && rook.type === 'R' && rook.color === color &&
          !isSquareAttacked(board, 3, rank, enemyColor) && !isSquareAttacked(board, 2, rank, enemyColor)) {
        results.push({ file: 2, rank, isCastle: 'Q' });
      }
    }
  }

  return results;
}

// Construye la notación SAN de un movimiento hecho a mano en el tablero.
function buildSANForUserMove(state, fromFile, fromRank, toFile, toRank, dest, promotionType) {
  const board = state.board;
  const piece = board[fromRank][fromFile];
  const color = piece.color;

  if (dest.isCastle === 'K') return 'O-O';
  if (dest.isCastle === 'Q') return 'O-O-O';

  let disambiguation = '';
  if (piece.type !== 'P' && piece.type !== 'K') {
    const others = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if (f === fromFile && r === fromRank) continue;
        const p = board[r][f];
        if (p && p.type === piece.type && p.color === color &&
            canPieceReach(state, p, f, r, toFile, toRank, dest.isCapture) &&
            !wouldLeaveKingInCheck(board, f, r, toFile, toRank, color, false)) {
          others.push({ file: f, rank: r });
        }
      }
    }
    if (others.length > 0) {
      const sameFile = others.some(o => o.file === fromFile);
      const sameRank = others.some(o => o.rank === fromRank);
      if (!sameFile) disambiguation = String.fromCharCode('a'.charCodeAt(0) + fromFile);
      else if (!sameRank) disambiguation = String(8 - fromRank);
      else disambiguation = coordsToSquare(fromFile, fromRank);
    }
  }

  const pieceLetter = piece.type === 'P' ? '' : piece.type;
  let san = pieceLetter + disambiguation;
  if (piece.type === 'P' && dest.isCapture) san += String.fromCharCode('a'.charCodeAt(0) + fromFile);
  if (dest.isCapture) san += 'x';
  san += coordsToSquare(toFile, toRank);
  if (promotionType) san += '=' + promotionType;
  return san;
}


// ============================================================
// BIBLIOTECA DE PARTIDAS (localStorage) — la pantalla de inicio
// ============================================================

const LIBRARY_KEY = 'chess-library';

const SAMPLE_GAME_PGN = `1. d4 d5 2. e3 c5 3. c3 e6 4. Bd3 Nc6 5. f4 Nf6 6. Nd2 Qc7 7. Ngf3
cxd4 8. cxd4 Nb4 9. Bb1 Bd7 10. a3 Rc8 11. O-O Bb5 12. Re1 Nc2
13. Bxc2 Qxc2 14. Qxc2 Rxc2 15. h3 Bd6 16. Nb1 Ne4 17. Nfd2
Bd3 18. Nxe4 Bxe4 19. Nd2 Kd7 20. Nxe4 dxe4 21. Rb1 Rhc8 22.
b4 R8c3 23. Kf1 Kc6 24. Bb2 Rb3 25. Re2 Rxe2 26. Kxe2 Kb5 27.
Kd2 Ka4 28. Ke2 a5 29. Kf2 axb4 30. axb4 Kxb4 31. Ke2 Kb5 32.
Kd2 Ba3 33. Kc2 Rxb2+ 34. Rxb2+ Bxb2 35. Kxb2 Kc4 36. g4 Kd3
37. g5 Kxe3 0-1`;

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveLibrary(games) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(games)); } catch (e) { /* ignorar */ }
}

function ensureLibrarySeeded() {
  let games = loadLibrary();
  if (games === null) {
    games = [{
      id: simpleHash('sample-' + Date.now()),
      title: 'Partida de ejemplo',
      pgn: SAMPLE_GAME_PGN,
      createdAt: Date.now()
    }];
    saveLibrary(games);
  }
  return games;
}

function addGameToLibrary(title, pgn, folderId) {
  const games = loadLibrary() || [];
  const record = {
    id: simpleHash(title + '|' + pgn + '|' + Date.now()),
    title: title.trim() || 'Partida sin título',
    pgn: pgn.trim(),
    folderId: folderId || null,
    createdAt: Date.now()
  };
  games.unshift(record);
  saveLibrary(games);
  return record;
}

function deleteGameFromLibrary(id) {
  const games = (loadLibrary() || []).filter(g => g.id !== id);
  saveLibrary(games);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resultBadge(pgn) {
  const m = pgn.match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/);
  if (!m) return null;
  return { '1-0': { label: '1–0', cls: 'result-white' },
           '0-1': { label: '0–1', cls: 'result-black' },
           '1/2-1/2': { label: '½–½', cls: 'result-draw' },
           '*': null }[m[1]] || null;
}

// ---------- Carpetas ----------
const FOLDERS_KEY = 'chess-folders';

function loadFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveFolders(folders) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); } catch (e) { /* ignorar */ }
}

function addFolder(name) {
  const folders = loadFolders();
  const folder = { id: simpleHash('folder-' + name + '-' + Date.now()), name: name.trim() };
  folders.push(folder);
  saveFolders(folders);
  return folder;
}

function deleteFolder(id) {
  const folders = loadFolders().filter(f => f.id !== id);
  saveFolders(folders);
  // las partidas de esa carpeta pasan a "sin carpeta", no se borran
  const games = (loadLibrary() || []).map(g => g.folderId === id ? { ...g, folderId: null } : g);
  saveLibrary(games);
}

// ============================================================
// RAMIFICACIONES — versiones alternativas de una partida, creadas
// moviendo piezas a mano a partir de una jugada concreta.
// ============================================================

function branchesKey(gameId) {
  return `chess-branches:${gameId}`;
}

function loadBranches(gameId) {
  try {
    const raw = localStorage.getItem(branchesKey(gameId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveBranches(gameId, branches) {
  try { localStorage.setItem(branchesKey(gameId), JSON.stringify(branches)); } catch (e) {}
}

function createBranch(gameId, fromPly) {
  const branches = loadBranches(gameId);
  const record = {
    id: simpleHash('branch-' + Date.now() + '-' + Math.random()),
    name: `Rama ${branches.length + 1}`,
    fromPly,
    moves: [],
    createdAt: Date.now()
  };
  branches.push(record);
  saveBranches(gameId, branches);
  return record;
}

function persistBranchMoves(gameId, branch) {
  const branches = loadBranches(gameId);
  const target = branches.find(b => b.id === branch.id);
  if (target) { target.moves = branch.moves; saveBranches(gameId, branches); }
}

function deleteBranchAndData(gameId, branchId) {
  saveBranches(gameId, loadBranches(gameId).filter(b => b.id !== branchId));
  try {
    const prefix = `chess-notes:branch:${branchId}:`;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(`chess-lastply:branch:${branchId}`);
  } catch (e) {}
}

// ============================================================
// UI / REPRODUCTOR
// ============================================================

let gameState = null;
let currentPly = 0;
let currentLibraryRecord = null;

const boardEl = document.getElementById('board');

// ---------- Coordenadas del tablero (a-h arriba y abajo, 1-8 a los lados) ----------
(function renderBoardCoordinates() {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranksTopToBottom = ['8', '7', '6', '5', '4', '3', '2', '1'];

  function fillRow(id, labels) {
    const el = document.getElementById(id);
    labels.forEach(label => {
      const span = document.createElement('span');
      span.textContent = label;
      el.appendChild(span);
    });
  }

  fillRow('coordTop', files);
  fillRow('coordBottom', files);
  fillRow('coordLeft', ranksTopToBottom);
  fillRow('coordRight', ranksTopToBottom);
})();
const statusEl = document.getElementById('status');
const moveStripEl = document.getElementById('moveStrip');
const pgnInput = document.getElementById('pgnInput');
const titleInput = document.getElementById('titleInput');
const libraryListEl = document.getElementById('libraryList');
const libraryEmptyEl = document.getElementById('libraryEmpty');
const gameTitleLabelEl = document.getElementById('gameTitleLabel');

// ---------- Edición interactiva de ramificaciones (mover piezas a mano) ----------
let mainGameState = null;
let viewingBranch = null;
let branchEditMode = false;
let selectedSquare = null;
let legalDestinations = [];
let pendingPromotion = null;

function renderBoard(boardArray, highlight) {
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = document.createElement('div');
      const isLight = (r + f) % 2 === 0;
      sq.className = 'square ' + (isLight ? 'light' : 'dark');
      sq.dataset.file = f;
      sq.dataset.rank = r;
      const square = coordsToSquare(f, r);
      if (highlight) {
        if (highlight.from === square) sq.classList.add('highlight-from');
        if (highlight.to === square) sq.classList.add('highlight-to');
      }
      if (branchEditMode && selectedSquare && selectedSquare.file === f && selectedSquare.rank === r) {
        sq.classList.add('selected');
      }
      if (branchEditMode) {
        const dest = legalDestinations.find(d => d.file === f && d.rank === r);
        if (dest) {
          sq.classList.add('legal-move');
          if (dest.isCapture) sq.classList.add('capture');
          const marker = document.createElement('span');
          marker.className = 'legalDot';
          sq.appendChild(marker);
        }
      }
      const piece = boardArray[r][f];
      if (piece) {
        const pieceEl = document.createElement('span');
        pieceEl.className = 'piece ' + (piece.color === 'w' ? 'white-piece' : 'black-piece');
        pieceEl.textContent = getPieceGlyph(piece.type);
        sq.appendChild(pieceEl);
      }
      boardEl.appendChild(sq);
    }
  }
}

function refreshBoardOnly() {
  renderBoard(gameState.positions[currentPly], gameState.lastMoveSquares[currentPly]);
}

boardEl.addEventListener('click', (e) => {
  if (!branchEditMode || pendingPromotion) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  handleBoardSquareClick(parseInt(sq.dataset.file, 10), parseInt(sq.dataset.rank, 10));
});

function handleBoardSquareClick(file, rank) {
  const board = gameState.board;
  const piece = board[rank][file];

  if (selectedSquare) {
    const dest = legalDestinations.find(d => d.file === file && d.rank === rank);
    if (dest) {
      const fromFile = selectedSquare.file, fromRank = selectedSquare.rank;
      const movingPiece = board[fromRank][fromFile];
      const lastRank = movingPiece.color === 'w' ? 0 : 7;
      if (movingPiece.type === 'P' && rank === lastRank) {
        pendingPromotion = { fromFile, fromRank, toFile: file, toRank: rank, dest };
        selectedSquare = null;
        legalDestinations = [];
        refreshBoardOnly();
        openPromotionPicker(movingPiece.color);
        return;
      }
      commitUserMove(fromFile, fromRank, file, rank, dest, null);
      return;
    }
    if (piece && piece.color === gameState.turn) {
      selectedSquare = { file, rank };
      legalDestinations = getLegalDestinations(gameState, file, rank);
    } else {
      selectedSquare = null;
      legalDestinations = [];
    }
  } else if (piece && piece.color === gameState.turn) {
    selectedSquare = { file, rank };
    legalDestinations = getLegalDestinations(gameState, file, rank);
  }
  refreshBoardOnly();
}

function commitUserMove(fromFile, fromRank, toFile, toRank, dest, promotionType) {
  let san = buildSANForUserMove(gameState, fromFile, fromRank, toFile, toRank, dest, promotionType);
  viewingBranch.moves.push(san);
  gameState = buildBranchGameState(viewingBranch);
  if (isKingInCheck(gameState.board, gameState.turn)) {
    san += '+';
    viewingBranch.moves[viewingBranch.moves.length - 1] = san;
    gameState.moveHistory[gameState.moveHistory.length - 1] = san;
  }
  persistBranchMoves(currentLibraryRecord.id, viewingBranch);
  selectedSquare = null;
  legalDestinations = [];
  buildMoveStrip();
  goToPly(gameState.positions.length - 1);
}

// ---------- Selector de coronación de peón ----------
const promotionOverlayEl = document.getElementById('promotionOverlay');

function openPromotionPicker(color) {
  document.querySelectorAll('.promoBtn').forEach(btn => {
    btn.innerHTML = '';
    const glyph = document.createElement('span');
    glyph.className = 'piece ' + (color === 'w' ? 'white-piece' : 'black-piece');
    glyph.textContent = getPieceGlyph(btn.dataset.piece);
    btn.appendChild(glyph);
  });
  promotionOverlayEl.classList.add('open');
}

function closePromotionPicker() {
  promotionOverlayEl.classList.remove('open');
  pendingPromotion = null;
}

document.querySelectorAll('.promoBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!pendingPromotion) return;
    const { fromFile, fromRank, toFile, toRank, dest } = pendingPromotion;
    const pieceType = btn.dataset.piece;
    closePromotionPicker();
    commitUserMove(fromFile, fromRank, toFile, toRank, dest, pieceType);
  });
});

function renderStatus() {
  const total = gameState.positions.length - 1;
  let text = `Jugada ${currentPly} / ${total}`;
  if (viewingBranch) {
    text = `${viewingBranch.name} · ${text}`;
    text += branchEditMode ? ' · toca una pieza para mover' : '';
  } else if (currentPly === total && gameState.result) {
    const resultLabel = { '1-0': 'Ganan blancas', '0-1': 'Ganan negras', '1/2-1/2': 'Tablas' }[gameState.result] || gameState.result;
    text += ` · ${resultLabel}`;
  }
  statusEl.textContent = text;
  document.getElementById('prevBtn').disabled = currentPly === 0;
  document.getElementById('nextBtn').disabled = currentPly === total;
}

// ---------- Tira de notación: se puede deslizar libremente para ojear,
// pero la posición del tablero SOLO cambia al tocar una jugada concreta ----------
function moveLabel(ply) {
  if (ply === 0) return 'Inicio';
  const moveNumber = Math.ceil(ply / 2);
  const san = gameState.moveHistory[ply - 1];
  const isWhiteMove = ply % 2 === 1;
  return isWhiteMove ? `${moveNumber}.${san}` : `${san}`;
}

let moveChipEls = [];

// Se reconstruye solo cuando se carga una partida (no en cada jugada).
function buildMoveStrip() {
  moveStripEl.innerHTML = '';
  moveChipEls = [];
  const total = gameState.positions.length - 1;

  for (let ply = 0; ply <= total; ply++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'moveChip';
    chip.textContent = moveLabel(ply);
    chip.addEventListener('click', () => goToPly(ply));
    moveStripEl.appendChild(chip);
    moveChipEls.push(chip);
  }
}

// Se llama en cada jugada: solo actualiza el resaltado y centra la vista,
// nunca cambia la jugada por sí sola.
function updateMoveStripActive() {
  moveChipEls.forEach((chip, ply) => {
    chip.classList.toggle('current', ply === currentPly);
    chip.classList.toggle('hasNote', hasNote(ply));
  });
  const current = moveChipEls[currentPly];
  if (current) current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

// ---------- Notas por jugada (persistentes, el alma de la app) ----------
const notesArea = document.getElementById('notesArea');
const notesLabelEl = document.getElementById('notesLabel');
let notesSaveTimer = null;

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function currentGameId() {
  return simpleHash(gameState.moveHistory.join(' ') || 'partida-vacia');
}

function noteKey(ply) {
  if (viewingBranch && ply >= viewingBranch.fromPly) {
    return `chess-notes:branch:${viewingBranch.id}:${ply}`;
  }
  const baseId = currentLibraryRecord ? currentLibraryRecord.id : currentGameId();
  return `chess-notes:${baseId}:${ply}`;
}

function hasNote(ply) {
  try { return !!localStorage.getItem(noteKey(ply)); } catch (e) { return false; }
}

function loadNote(ply) {
  try { return localStorage.getItem(noteKey(ply)) || ''; } catch (e) { return ''; }
}

function saveNote(ply, text) {
  try {
    if (text.trim()) localStorage.setItem(noteKey(ply), text);
    else localStorage.removeItem(noteKey(ply));
  } catch (e) { /* almacenamiento no disponible: se ignora silenciosamente */ }
}

function renderNotesForCurrentPly() {
  const label = currentPly === 0 ? 'Inicio' : moveLabel(currentPly);
  notesLabelEl.innerHTML = `Notas · <span class="notesLabelMove">${label}</span>`;
  notesArea.value = loadNote(currentPly);
}

notesArea.addEventListener('input', () => {
  clearTimeout(notesSaveTimer);
  const ply = currentPly;
  const text = notesArea.value;
  notesSaveTimer = setTimeout(() => { saveNote(ply, text); updateMoveStripActive(); }, 350);
});

// ---------- Retomar la partida justo donde se dejó ----------
function lastPlyKey() {
  if (viewingBranch) return `chess-lastply:branch:${viewingBranch.id}`;
  return `chess-lastply:${currentLibraryRecord ? currentLibraryRecord.id : currentGameId()}`;
}
function saveLastPly(ply) {
  try { localStorage.setItem(lastPlyKey(), String(ply)); } catch (e) {}
}
function loadLastPly() {
  try {
    const raw = localStorage.getItem(lastPlyKey());
    return raw ? parseInt(raw, 10) : 0;
  } catch (e) { return 0; }
}

function goToPly(ply) {
  const total = gameState.positions.length - 1;
  currentPly = Math.max(0, Math.min(ply, total));
  renderBoard(gameState.positions[currentPly], gameState.lastMoveSquares[currentPly]);
  renderStatus();
  updateMoveStripActive();
  renderNotesForCurrentPly();
  saveLastPly(currentPly);
}

function stepForward() { goToPly(currentPly + 1); }
function stepBackward() { goToPly(currentPly - 1); }

// ---------- Mantener pulsado: avance/retroceso acelerado ----------
function bindHold(button, action, atBoundary) {
  let holdTimeout = null;
  let holdInterval = null;
  let steps = 0;
  let interval = 200;

  function tick() {
    action();
    steps++;
    if (atBoundary()) { stop(); return; }
    if (steps % 4 === 0 && interval > 55) {
      interval = Math.max(55, interval - 45);
      clearInterval(holdInterval);
      holdInterval = setInterval(tick, interval);
    }
  }

  function stop() {
    clearTimeout(holdTimeout);
    clearInterval(holdInterval);
    holdTimeout = null;
    holdInterval = null;
    steps = 0;
    interval = 200;
  }

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    action();
    if (atBoundary()) return;
    holdTimeout = setTimeout(() => {
      holdInterval = setInterval(tick, interval);
    }, 320);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
    button.addEventListener(evt, stop)
  );
}

bindHold(document.getElementById('prevBtn'), stepBackward, () => currentPly === 0);
bindHold(document.getElementById('nextBtn'), stepForward, () => currentPly === gameState.positions.length - 1);

// ---------- Navegación entre pantallas ----------
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const folderChipsEl = document.getElementById('folderChips');
const folderSelectEl = document.getElementById('folderSelect');

let activeFolderId = 'all'; // 'all' | 'none' | id de carpeta

function showHome() {
  renderFolderChips();
  renderLibraryList();
  homeView.hidden = false;
  analysisView.hidden = true;
}

function showAnalysis(record) {
  currentLibraryRecord = record;
  mainGameState = loadGame(record.pgn);
  gameState = mainGameState;
  viewingBranch = null;
  branchEditMode = false;
  selectedSquare = null;
  legalDestinations = [];
  gameTitleLabelEl.textContent = record.title;
  homeView.hidden = true;
  analysisView.hidden = false;
  applyBranchModeUI();
  updateBranchBar();
  buildMoveStrip();
  const total = gameState.positions.length - 1;
  const resumePly = Math.max(0, Math.min(loadLastPly(), total));
  goToPly(resumePly);
}

document.getElementById('backBtn').addEventListener('click', showHome);

// ---------- Navegación entre la partida principal y sus ramas ----------
function buildBranchGameState(branch) {
  const prefix = mainGameState.moveHistory.slice(0, branch.fromPly);
  const combined = prefix.concat(branch.moves).join(' ');
  return loadGame(combined);
}

function applyBranchModeUI() {
  document.getElementById('boardFrame').classList.toggle('branch-editing', branchEditMode);
}

function loadBranchView(branch, editMode) {
  viewingBranch = branch;
  branchEditMode = !!editMode;
  selectedSquare = null;
  legalDestinations = [];
  gameState = buildBranchGameState(branch);
  applyBranchModeUI();
  updateBranchBar();
  buildMoveStrip();
  const total = gameState.positions.length - 1;
  const resumePly = editMode ? total : Math.max(0, Math.min(loadLastPly(), total));
  goToPly(resumePly);
}

function exitToMainLine() {
  viewingBranch = null;
  branchEditMode = false;
  selectedSquare = null;
  legalDestinations = [];
  gameState = mainGameState;
  applyBranchModeUI();
  updateBranchBar();
  buildMoveStrip();
  const total = gameState.positions.length - 1;
  goToPly(Math.max(0, Math.min(loadLastPly(), total)));
}

function enterBranchCreation() {
  if (viewingBranch) return;
  const branch = createBranch(currentLibraryRecord.id, currentPly);
  loadBranchView(branch, true);
}

function toggleBranchEditMode() {
  if (!viewingBranch) return;
  branchEditMode = !branchEditMode;
  selectedSquare = null;
  legalDestinations = [];
  applyBranchModeUI();
  updateBranchBar();
  refreshBoardOnly();
  renderStatus();
}

// ---------- Barra de ramificaciones ----------
const branchChipsEl = document.getElementById('branchChips');
const branchEditToggleBtn = document.getElementById('branchEditToggleBtn');

function updateBranchBar() {
  branchChipsEl.innerHTML = '';

  const mainChip = document.createElement('button');
  mainChip.type = 'button';
  mainChip.className = 'branchChip' + (!viewingBranch ? ' active' : '');
  mainChip.textContent = 'Principal';
  mainChip.addEventListener('click', exitToMainLine);
  branchChipsEl.appendChild(mainChip);

  const gameId = currentLibraryRecord.id;
  const branches = loadBranches(gameId);
  branches.forEach(branch => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'branchChip' + (viewingBranch && viewingBranch.id === branch.id ? ' active' : '');
    chip.textContent = branch.name;
    chip.addEventListener('click', () => loadBranchView(branch, false));

    let pressTimer = null;
    chip.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        if (confirm(`¿Eliminar "${branch.name}"? Esta acción no se puede deshacer.`)) {
          deleteBranchAndData(gameId, branch.id);
          if (viewingBranch && viewingBranch.id === branch.id) exitToMainLine();
          else updateBranchBar();
        }
      }, 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
      chip.addEventListener(evt, () => clearTimeout(pressTimer))
    );
    branchChipsEl.appendChild(chip);
  });

  if (!viewingBranch) {
    const addChip = document.createElement('button');
    addChip.type = 'button';
    addChip.className = 'branchChip branchChipAdd';
    addChip.innerHTML = iconButton('add');
    addChip.setAttribute('aria-label', 'Ramificar esta jugada');
    addChip.addEventListener('click', enterBranchCreation);
    branchChipsEl.appendChild(addChip);
  }

  if (viewingBranch) {
    branchEditToggleBtn.hidden = false;
    branchEditToggleBtn.innerHTML = iconButton(branchEditMode ? 'check' : 'edit');
    branchEditToggleBtn.setAttribute('aria-label', branchEditMode ? 'Terminar edición' : 'Editar rama');
  } else {
    branchEditToggleBtn.hidden = true;
  }
}

branchEditToggleBtn.addEventListener('click', toggleBranchEditMode);

// ---------- Chips de carpetas (filtro) ----------
function renderFolderChips() {
  const folders = loadFolders();
  folderChipsEl.innerHTML = '';

  const makeChip = (label, id, deletable) => {
    const chip = document.createElement('button');
    chip.className = 'folderChip' + (activeFolderId === id ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => { activeFolderId = id; renderFolderChips(); renderLibraryList(); });
    if (deletable) {
      let pressTimer = null;
      chip.addEventListener('pointerdown', () => {
        pressTimer = setTimeout(() => {
          if (confirm(`¿Eliminar la carpeta "${label}"? Las partidas no se borrarán.`)) {
            deleteFolder(id);
            activeFolderId = 'all';
            renderFolderChips();
            renderLibraryList();
          }
        }, 550);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
        chip.addEventListener(evt, () => clearTimeout(pressTimer))
      );
    }
    return chip;
  };

  folderChipsEl.appendChild(makeChip('Todas', 'all', false));
  if (folders.length > 0) folderChipsEl.appendChild(makeChip('Sin carpeta', 'none', false));
  folders.forEach(f => folderChipsEl.appendChild(makeChip(f.name, f.id, true)));

  const addChip = document.createElement('button');
  addChip.className = 'folderChip folderChipAdd';
  addChip.innerHTML = iconButton('add');
  addChip.setAttribute('aria-label', 'Nueva carpeta');
  addChip.addEventListener('click', openNewFolderSheet);
  folderChipsEl.appendChild(addChip);
}

function populateFolderSelect() {
  const folders = loadFolders();
  folderSelectEl.innerHTML = '<option value="">Sin carpeta</option>' +
    folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
}

// ---------- Lista de la biblioteca ----------
function renderLibraryList() {
  const allGames = loadLibrary() || [];
  const games = activeFolderId === 'all' ? allGames
    : activeFolderId === 'none' ? allGames.filter(g => !g.folderId)
    : allGames.filter(g => g.folderId === activeFolderId);

  const folders = loadFolders();
  const folderName = (id) => (folders.find(f => f.id === id) || {}).name;

  libraryListEl.innerHTML = '';
  libraryEmptyEl.style.display = games.length === 0 ? 'flex' : 'none';

  games.forEach(record => {
    const row = document.createElement('div');
    row.className = 'libraryRow';

    const info = document.createElement('div');
    info.className = 'libraryInfo';
    const badge = resultBadge(record.pgn);
    const metaParts = [formatDate(record.createdAt)];
    if (activeFolderId === 'all' && record.folderId) metaParts.push(folderName(record.folderId));
    info.innerHTML = `
      <div class="libraryTitle">${record.title}</div>
      <div class="libraryMeta">${metaParts.join(' · ')}</div>
    `;
    info.addEventListener('click', () => showAnalysis(record));

    row.appendChild(info);

    if (badge) {
      const dot = document.createElement('span');
      dot.className = 'resultDot ' + badge.cls;
      dot.textContent = badge.label;
      row.appendChild(dot);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'libraryDelete';
    delBtn.innerHTML = iconButton('trash');
    delBtn.setAttribute('aria-label', 'Eliminar partida');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGameFromLibrary(record.id);
      renderLibraryList();
    });

    row.appendChild(delBtn);
    libraryListEl.appendChild(row);
  });
}

// ---------- Hoja para añadir partida nueva ----------
const addSheetOverlay = document.getElementById('addSheetOverlay');

function openAddSheet() {
  titleInput.value = '';
  pgnInput.value = '';
  populateFolderSelect();
  if (activeFolderId !== 'all' && activeFolderId !== 'none') folderSelectEl.value = activeFolderId;
  addSheetOverlay.classList.add('open');
}
function closeAddSheet() { addSheetOverlay.classList.remove('open'); }

document.getElementById('newGameBtn').addEventListener('click', openAddSheet);
document.getElementById('closeSheetBtn').addEventListener('click', closeAddSheet);
addSheetOverlay.addEventListener('click', (e) => { if (e.target === addSheetOverlay) closeAddSheet(); });

document.getElementById('saveGameBtn').addEventListener('click', () => {
  if (!pgnInput.value.trim()) return;
  const record = addGameToLibrary(titleInput.value, pgnInput.value, folderSelectEl.value || null);
  closeAddSheet();
  showAnalysis(record);
});

// ---------- Hoja para crear carpeta nueva ----------
const newFolderSheetOverlay = document.getElementById('newFolderSheetOverlay');
const folderNameInput = document.getElementById('folderNameInput');

function openNewFolderSheet() {
  folderNameInput.value = '';
  newFolderSheetOverlay.classList.add('open');
}
function closeNewFolderSheet() { newFolderSheetOverlay.classList.remove('open'); }

document.getElementById('closeFolderSheetBtn').addEventListener('click', closeNewFolderSheet);
newFolderSheetOverlay.addEventListener('click', (e) => { if (e.target === newFolderSheetOverlay) closeNewFolderSheet(); });

document.getElementById('saveFolderBtn').addEventListener('click', () => {
  if (!folderNameInput.value.trim()) return;
  const folder = addFolder(folderNameInput.value);
  activeFolderId = folder.id;
  closeNewFolderSheet();
  renderFolderChips();
  renderLibraryList();
});

// ---------- Iconos de los botones (inyectados por JS, nada de emoji) ----------
document.getElementById('prevBtn').innerHTML = iconButton('prev');
document.getElementById('nextBtn').innerHTML = iconButton('next');
document.getElementById('newGameBtn').innerHTML = iconButton('add');
document.getElementById('backBtn').innerHTML = iconButton('back');
document.getElementById('closeSheetBtn').innerHTML = iconButton('close');
document.getElementById('closeFolderSheetBtn').innerHTML = iconButton('close');

// ---------- Registro del Service Worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW no registrado:', err));
  });
}

// ---------- Arranque ----------
ensureLibrarySeeded();
showHome();
