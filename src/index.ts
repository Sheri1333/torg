import { assertBotToken } from "./config.js";
import { createBot } from "./bot/createBot.js";

async function main() {
  const token = assertBotToken();
  const bot = createBot(token);

  console.log("TORG bot starting (ETP.Adilet)…");
  await bot.start({
    onStart: (info) => {
      console.log(`Logged in as @${info.username}`);
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
