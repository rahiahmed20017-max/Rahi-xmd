import { Module } from "../../lib/plugins.js";

const HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Block Blast</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-color: #f8fafc;
            --grid-bg: #334155;
            --cell-bg: #0f172a;
            --accent: #38bdf8;
            --accent-hover: #0ea5e9;
            --danger: #f43f5e;
        }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }

        .container {
            background-color: var(--card-bg);
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            text-align: center;
            border: 1px solid var(--grid-bg);
            max-width: 400px;
            width: 100%;
        }

        h2 {
            margin: 0 0 10px 0;
            font-weight: 600;
        }

        .score-board {
            font-size: 1rem;
            margin-bottom: 16px;
            color: #94a3b8;
        }

        .score-board span {
            color: var(--accent);
            font-weight: bold;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            grid-template-rows: repeat(8, 1fr);
            gap: 4px;
            background-color: var(--grid-bg);
            padding: 8px;
            border-radius: 12px;
            aspect-ratio: 1;
            margin-bottom: 20px;
        }

        .cell {
            background-color: var(--cell-bg);
            border-radius: 4px;
            transition: background-color 0.15s;
        }

        .cell.filled {
            background-color: var(--accent);
        }

        .cell.highlight {
            background-color: rgba(56, 189, 248, 0.4);
        }

        .tray {
            display: flex;
            justify-content: space-around;
            gap: 10px;
            min-height: 90px;
            background-color: var(--cell-bg);
            padding: 10px;
            border-radius: 10px;
            margin-bottom: 16px;
            align-items: center;
        }

        .piece-container {
            cursor: pointer;
            padding: 5px;
            border-radius: 6px;
            transition: transform 0.2s, background-color 0.2s;
        }

        .piece-container.selected {
            background-color: rgba(56, 189, 248, 0.2);
            border: 1px solid var(--accent);
        }

        .mini-grid {
            display: grid;
            gap: 2px;
        }

        .mini-cell {
            width: 14px;
            height: 14px;
            background-color: var(--cell-bg);
            border-radius: 2px;
        }

        .mini-cell.filled {
            background-color: var(--accent);
        }

        #reset {
            width: 100%;
            padding: 12px 0;
            font-size: 0.95rem;
            font-weight: 600;
            background-color: #475569;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        #reset:hover {
            background-color: #64748b;
        }
    </style>
</head>
<body>

    <div class="container">
        <h2>Block Blast</h2>
        <div class="score-board">Score: <span id="score">0</span></div>
        
        <div class="grid" id="board"></div>

        <div class="tray" id="tray"></div>

        <button id="reset">Restart</button>
    </div>

    <script>
        const BOARD_SIZE = 8;
        let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        let score = 0;
        let trayPieces = [null, null, null];
        let selectedPieceIndex = null;

        const SHAPES = [
            [[1]],
            [[1, 1]],
            [[1], [1]],
            [[1, 1], [1, 1]],
            [[1, 1, 1]],
            [[1], [1], [1]],
            [[1, 1], [1, 0]],
        ];

        const boardElement = document.getElementById('board');
        const trayElement = document.getElementById('tray');
        const scoreElement = document.getElementById('score');
        const resetButton = document.getElementById('reset');

        function initBoard() {
            boardElement.innerHTML = '';
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    const cell = document.createElement('div');
                    cell.classList.add('cell');
                    cell.dataset.row = r;
                    cell.dataset.col = c;
                    cell.addEventListener('mouseenter', () => handleCellHover(r, c));
                    cell.addEventListener('click', () => handleCellClick(r, c));
                    boardElement.appendChild(cell);
                }
            }
        }

        function updateBoardUI() {
            const cells = boardElement.children;
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    const index = r * BOARD_SIZE + c;
                    if (board[r][c] === 1) {
                        cells[index].classList.add('filled');
                    } else {
                        cells[index].classList.remove('filled');
                    }
                }
            }
        }

        function getRandomShape() {
            const randIndex = Math.floor(Math.random() * SHAPES.length);
            return SHAPES[randIndex];
        }

        function generateTray() {
            trayPieces = [getRandomShape(), getRandomShape(), getRandomShape()];
            renderTray();
        }

        function renderTray() {
            trayElement.innerHTML = '';
            trayPieces.forEach((piece, index) => {
                const container = document.createElement('div');
                container.classList.add('piece-container');
                if (selectedPieceIndex === index) container.classList.add('selected');
                container.addEventListener('click', () => selectPiece(index));

                if (piece) {
                    const rows = piece.length;
                    const cols = piece[0].length;
                    const miniGrid = document.createElement('div');
                    miniGrid.classList.add('mini-grid');
                    miniGrid.style.gridTemplateColumns = \`repeat(\${cols}, 14px)\`;
                    miniGrid.style.gridTemplateRows = \`repeat(\${rows}, 14px)\`;

                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const miniCell = document.createElement('div');
                            miniCell.classList.add('mini-cell');
                            if (piece[r][c] === 1) miniCell.classList.add('filled');
                            miniGrid.appendChild(miniCell);
                        }
                    }
                    container.appendChild(miniGrid);
                }
                trayElement.appendChild(container);
            });
        }

        function selectPiece(index) {
            if (!trayPieces[index]) return;
            selectedPieceIndex = (selectedPieceIndex === index) ? null : index;
            renderTray();
        }

        function canPlace(piece, startR, startC) {
            const rows = piece.length;
            const cols = piece[0].length;
            if (startR + rows > BOARD_SIZE || startC + cols > BOARD_SIZE) return false;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (piece[r][c] === 1 && board[startR + r][startC + c] === 1) {
                        return false;
                    }
                }
            }
            return true;
        }

        function handleCellHover(r, c) {
            document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('highlight'));
            
            if (selectedPieceIndex === null || !trayPieces[selectedPieceIndex]) return;
            const piece = trayPieces[selectedPieceIndex];

            if (canPlace(piece, r, c)) {
                const rows = piece.length;
                const cols = piece[0].length;
                for (let pr = 0; pr < rows; pr++) {
                    for (let pc = 0; pc < cols; pc++) {
                        if (piece[pr][pc] === 1) {
                            const targetR = r + pr;
                            const targetC = c + pc;
                            const cellIndex = targetR * BOARD_SIZE + targetC;
                            boardElement.children[cellIndex].classList.add('highlight');
                        }
                    }
                }
            }
        }

        function handleCellClick(r, c) {
            if (selectedPieceIndex === null || !trayPieces[selectedPieceIndex]) return;
            const piece = trayPieces[selectedPieceIndex];

            if (canPlace(piece, r, c)) {
                const rows = piece.length;
                const cols = piece[0].length;
                for (let pr = 0; pr < rows; pr++) {
                    for (let pc = 0; pc < cols; pc++) {
                        if (piece[pr][pc] === 1) {
                            board[r + pr][c + pc] = 1;
                            score += 10;
                        }
                    }
                }

                trayPieces[selectedPieceIndex] = null;
                selectedPieceIndex = null;
                checkClearLines();
                updateBoardUI();
                scoreElement.textContent = score;
                renderTray();

                if (trayPieces.every(p => p === null)) {
                    generateTray();
                }

                checkGameOver();
            }
        }

        function checkClearLines() {
            let rowsToClear = [];
            let colsToClear = [];

            for (let r = 0; r < BOARD_SIZE; r++) {
                if (board[r].every(cell => cell === 1)) rowsToClear.push(r);
            }

            for (let c = 0; c < BOARD_SIZE; c++) {
                let colFull = true;
                for (let r = 0; r < BOARD_SIZE; r++) {
                    if (board[r][c] === 0) colFull = false;
                }
                if (colFull) colsToClear.push(c);
            }

            rowsToClear.forEach(r => {
                for (let c = 0; c < BOARD_SIZE; c++) board[r][c] = 0;
                score += 100;
            });

            colsToClear.forEach(c => {
                for (let r = 0; r < BOARD_SIZE; r++) board[r][c] = 0;
                score += 100;
            });
        }

        function checkGameOver() {
            let availablePieces = trayPieces.filter(p => p !== null);
            if (availablePieces.length === 0) return;

            let possibleMoveExists = false;
            availablePieces.forEach(piece => {
                for (let r = 0; r < BOARD_SIZE; r++) {
                    for (let c = 0; c < BOARD_SIZE; c++) {
                        if (canPlace(piece, r, c)) possibleMoveExists = true;
                    }
                }
            });

            if (!possibleMoveExists && availablePieces.length > 0) {
                alert('Game Over! Your final score: ' + score);
                resetGame();
            }
        }

        function resetGame() {
            board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
            score = 0;
            selectedPieceIndex = null;
            scoreElement.textContent = score;
            initBoard();
            generateTray();
        }

        resetButton.addEventListener('click', resetGame);

        initBoard();
        generateTray();
    </script>
</body>
</html>
`;

Module({
  command: "blockblast",
  aliases: ["blast", "bb"],
  package: "games",
  description: "Play Block Blast puzzle game",
})(async (message, match) => {
  try {
    await message.conn.sendMessage(message.from, {
      react: { text: "⏳", key: message.key },
    });
    await message.conn.relayMessage(
      message.from,
      {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          botMetadata: {},
        },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: [
                { messageType: 2, messageText: "Block Blast — Puzzle Game" },
              ],
              unifiedResponse: {
                data: Buffer.from(
                  JSON.stringify({
                    response_id: "blockblast-2026-01",
                    sections: [
                      {
                        view_model: {
                          primitive: {
                            __typename: "GenAIaeacdsnwHtmlPrimitive",
                            payload: HTML,
                            trusted_sources: [],
                          },
                          __typename: "GenAISingleLayoutViewModel",
                        },
                      },
                    ],
                  }),
                ).toString("base64"),
              },
              contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
                forwardOrigin: 4,
              },
            },
          },
        },
      },
      {},
    );
    await message.conn.sendMessage(message.from, {
      react: { text: "✅", key: message.key },
    });
  } catch (error) {
    console.error("[BlockBlast] Error:", error);
    await message.conn.sendMessage(message.from, {
      react: { text: "❌", key: message.key },
    });
    return message.send(`❌ *Error:* ${error.message}`);
  }
});
