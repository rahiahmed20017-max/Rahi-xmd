import { Module } from "../../lib/plugins.js";

Module({
  command: "gamemenu",
  aliases: ["webgames", "gameweb"],
  package: "games",
  description: "List all web games available",
})(async (message, match) => {
  try {
    await message.conn.sendMessage(message.from, {
      react: { text: "📋", key: message.key },
    });
    const menu = `📋 GAMES WEB

1 - .GAME
🦖 Dino Runner — Tap/click to jump, dodge cacti

2 - .TICTACTOE
⭕ Tic-Tac-Toe — AI & 2 Player with 4 difficulty levels

3 - .BLOCKBLAST
🧩 Block Blast — Place pieces, clear lines, score points

4 - .FLAPPY
🐤 Flappy Bird — Tap to fly through pipes

5 - .MINESWEEPER
💣 Minesweeper — Find all bombs without exploding

6 - .PIANO
🎹 Piano — Tap keys to play music

7 - .DRUM
🥁 Drum Hero — Hit the rhythm

8 - .GUITAR
🎸 Guitar Hero — Hit the notes

9 - .NOXGUITAR
🎸 NOX Guitar Hero — NOX Edition

10 - .SNAKE
🐍 Snake — Classic snake game

11 - .FISHING
🎣 Fishing Master — Catch fish and earn coins

12 - .CALC
🧮 Calculator — Interactive calculator

13 - .SLOTS
🎰 Fruit Bonanza Slots — Spin the reels

🎮 Total: 13 games available
🔥 Use any command above to play!`;

    await message.send(menu);
    await message.conn.sendMessage(message.from, {
      react: { text: "✅", key: message.key },
    });
  } catch (error) {
    console.error("[GamesWeb] Error:", error);
    await message.conn.sendMessage(message.from, {
      react: { text: "❌", key: message.key },
    });
    return message.send(`❌ *Error:* ${error.message}`);
  }
});
