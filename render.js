import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => console.log("Web server on port " + PORT));

process.on("unhandledRejection", (e) => console.error("UNHANDLED:", e));
process.on("uncaughtException", (e) => console.error("UNCAUGHT:", e));

try {
  await import("./index.js");
  console.log("index.js loaded");
} catch (e) {
  console.error("IMPORT ERROR:", e?.message);
  console.error(e?.stack);
}
