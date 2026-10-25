import { Module, reloadPlugins } from "../../lib/plugins.js";

Module({
  command: "reload",
  aliases: ["rl"],
  name: "reload",
  description: "Reload all plugins without restart",
  package: "owner",
  dontaddmenu: "true",
})(async (msg) => {
  if (!msg.isFromMe) return;
  const t = Date.now();
  try {
    const r = await reloadPlugins();
    let text = `✅ Reloaded in ${Date.now() - t}ms\nPlugins: ${r.total} | Commands: ${r.commands}`;
    if (r.failed) text += `\n⚠️ Failed (${r.failed}):\n${r.errors.join("\n")}`;
    await msg.reply?.(text);
  } catch (e) {
    await msg.reply?.(`❌ ${e.message}`);
  }
});
