const TelegramBot = require("node-telegram-bot-api");

// ====== تنظیمات ======
const BOT_TOKEN = "8726056692:AAEJcncB3kaV_fVvmXJxN0px85V02bkNqkw";
const ADMIN_ID = 8347327662;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ====== دیتابیس ساده در حافظه ======
const users = {}; // userId => { anonymous: bool, username, firstName }
const banned = new Set(); // userId های بن شده
const messageMap = {}; // messageId در چت ادمین => { userId }
const spamTracker = {}; // userId => [{ content, time }]
const SPAM_LIMIT = 10;

// ====== شناسایی محتوای پیام برای چک تکراری ======
function getMessageContent(msg) {
  if (msg.text) return "text:" + msg.text;
  if (msg.photo) return "photo:" + msg.photo[msg.photo.length - 1].file_id;
  if (msg.voice) return "voice:" + msg.voice.file_id;
  if (msg.audio) return "audio:" + msg.audio.file_id;
  if (msg.video) return "video:" + msg.video.file_id;
  if (msg.document) return "document:" + msg.document.file_id;
  if (msg.sticker) return "sticker:" + msg.sticker.file_id;
  if (msg.animation) return "animation:" + msg.animation.file_id;
  if (msg.video_note) return "videonote:" + msg.video_note.file_id;
  return "unknown";
}

// ====== چک اسپم ======
function checkSpam(userId, content) {
  const now = Date.now();
  if (!spamTracker[userId]) spamTracker[userId] = [];
  spamTracker[userId] = spamTracker[userId].filter(
    (m) => now - m.time < 60000
  );
  spamTracker[userId].push({ content, time: now });
  const sameCount = spamTracker[userId].filter((m) => m.content === content).length;
  return sameCount >= SPAM_LIMIT;
}

// ====== /start ======
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  if (!users[userId]) {
    users[userId] = {
      anonymous: false,
      username: msg.from.username || null,
      firstName: msg.from.first_name || "کاربر",
    };
  }
  if (banned.has(userId)) return;

  bot.sendMessage(userId, "سلام! 👋", {
    reply_markup: {
      keyboard: [[{ text: "🔒 مخفی کردن نام کاربری" }]],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
});

// ====== دکمه مخفی کردن نام کاربری ======
bot.on("message", (msg) => {
  if (!msg.text) return;
  const userId = msg.from.id;
  if (msg.text === "🔒 مخفی کردن نام کاربری") {
    if (!users[userId]) {
      users[userId] = {
        anonymous: false,
        username: msg.from.username || null,
        firstName: msg.from.first_name || "کاربر",
      };
    }
    users[userId].anonymous = true;
    bot.sendMessage(userId, "✅ نام کاربری شما مخفی شد. از این پس پیام‌هایتان ناشناس ارسال می‌شود.", {
      reply_markup: {
        keyboard: [[{ text: "🔒 مخفی کردن نام کاربری" }]],
        resize_keyboard: true,
      },
    });
    return;
  }
});

// ====== دستورات ادمین: /ban و /unban ======
bot.onText(/\/ban(?:\s+@?(\S+))?/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;

  let targetId = null;

  // ریپلای روی پیام کاربر
  if (msg.reply_to_message) {
    const replyMsgId = msg.reply_to_message.message_id;
    if (messageMap[replyMsgId]) {
      targetId = messageMap[replyMsgId].userId;
    }
  }

  // /ban @username یا /ban userid
  if (!targetId && match[1]) {
    const input = match[1].replace("@", "");
    // جستجو در users
    for (const [uid, data] of Object.entries(users)) {
      if (
        data.username &&
        data.username.toLowerCase() === input.toLowerCase()
      ) {
        targetId = parseInt(uid);
        break;
      }
    }
    if (!targetId) {
      const parsed = parseInt(input);
      if (!isNaN(parsed)) targetId = parsed;
    }
  }

  if (!targetId) {
    bot.sendMessage(ADMIN_ID, "❌ کاربر پیدا نشد.");
    return;
  }

  banned.add(targetId);
  bot.sendMessage(ADMIN_ID, `✅ کاربر ${targetId} بن شد.`);
  bot.sendMessage(targetId, "شما از این ربات بن شده‌اید.").catch(() => {});
});

bot.onText(/\/unban(?:\s+@?(\S+))?/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;

  let targetId = null;

  if (msg.reply_to_message) {
    const replyMsgId = msg.reply_to_message.message_id;
    if (messageMap[replyMsgId]) {
      targetId = messageMap[replyMsgId].userId;
    }
  }

  if (!targetId && match[1]) {
    const input = match[1].replace("@", "");
    for (const [uid, data] of Object.entries(users)) {
      if (
        data.username &&
        data.username.toLowerCase() === input.toLowerCase()
      ) {
        targetId = parseInt(uid);
        break;
      }
    }
    if (!targetId) {
      const parsed = parseInt(input);
      if (!isNaN(parsed)) targetId = parsed;
    }
  }

  if (!targetId) {
    bot.sendMessage(ADMIN_ID, "❌ کاربر پیدا نشد.");
    return;
  }

  banned.delete(targetId);
  bot.sendMessage(ADMIN_ID, `✅ کاربر ${targetId} آن‌بن شد.`);
  bot.sendMessage(targetId, "بن شما برداشته شد. می‌توانید دوباره پیام بدهید.").catch(() => {});
});

// ====== پیام‌های ادمین => ارسال جواب به کاربر ======
bot.on("message", async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  if (!msg.reply_to_message) return;

  // دستورات /ban /unban را نادیده بگیر
  if (msg.text && (msg.text.startsWith("/ban") || msg.text.startsWith("/unban"))) return;

  const replyMsgId = msg.reply_to_message.message_id;
  if (!messageMap[replyMsgId]) return;

  const targetUserId = messageMap[replyMsgId].userId;

  try {
    await copyMessageToUser(msg, targetUserId);
  } catch (e) {
    bot.sendMessage(ADMIN_ID, "❌ ارسال پیام به کاربر ناموفق بود.");
  }
});

async function copyMessageToUser(msg, targetUserId) {
  if (msg.text) {
    await bot.sendMessage(targetUserId, msg.text);
  } else if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    await bot.sendPhoto(targetUserId, photo.file_id, {
      caption: msg.caption || "",
    });
  } else if (msg.voice) {
    await bot.sendVoice(targetUserId, msg.voice.file_id, {
      caption: msg.caption || "",
    });
  } else if (msg.audio) {
    await bot.sendAudio(targetUserId, msg.audio.file_id, {
      caption: msg.caption || "",
    });
  } else if (msg.video) {
    await bot.sendVideo(targetUserId, msg.video.file_id, {
      caption: msg.caption || "",
    });
  } else if (msg.document) {
    await bot.sendDocument(targetUserId, msg.document.file_id, {
      caption: msg.caption || "",
    });
  } else if (msg.sticker) {
    await bot.sendSticker(targetUserId, msg.sticker.file_id);
  } else if (msg.animation) {
    await bot.sendAnimation(targetUserId, msg.animation.file_id, {
      caption: msg.caption || "",
    });
  } else if (msg.video_note) {
    await bot.sendVideoNote(targetUserId, msg.video_note.file_id);
  }
}

// ====== پیام‌های کاربران => ارسال به ادمین ======
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  if (userId === ADMIN_ID) return;

  // نادیده گرفتن دکمه‌ها و دستورات سیستمی
  if (msg.text === "🔒 مخفی کردن نام کاربری") return;
  if (msg.text && msg.text.startsWith("/start")) return;

  if (banned.has(userId)) {
    bot.sendMessage(userId, "شما از این ربات بن شده‌اید.");
    return;
  }

  if (!users[userId]) {
    users[userId] = {
      anonymous: false,
      username: msg.from.username || null,
      firstName: msg.from.first_name || "کاربر",
    };
  }

  const content = getMessageContent(msg);
  if (checkSpam(userId, content)) {
    banned.add(userId);
    bot.sendMessage(userId, "شما به دلیل ارسال پیام‌های تکراری بن شدید.");
    bot.sendMessage(ADMIN_ID, `⚠️ کاربر ${userId} به دلیل اسپم به صورت خودکار بن شد.`);
    return;
  }

  const isAnon = users[userId].anonymous;
  const displayName = isAnon
    ? "ناشناس"
    : users[userId].username
    ? `@${users[userId].username}`
    : users[userId].firstName;

  const header = `📩 پیام از ${displayName} (ID: ${userId}):`;

  try {
    let sentMsg = null;

    // ارسال هدر
    const headerMsg = await bot.sendMessage(ADMIN_ID, header);

    // ارسال محتوای پیام
    if (msg.text) {
      sentMsg = await bot.sendMessage(ADMIN_ID, msg.text);
    } else if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      sentMsg = await bot.sendPhoto(ADMIN_ID, photo.file_id, {
        caption: msg.caption || "",
      });
    } else if (msg.voice) {
      sentMsg = await bot.sendVoice(ADMIN_ID, msg.voice.file_id, {
        caption: msg.caption || "",
      });
    } else if (msg.audio) {
      sentMsg = await bot.sendAudio(ADMIN_ID, msg.audio.file_id, {
        caption: msg.caption || "",
      });
    } else if (msg.video) {
      sentMsg = await bot.sendVideo(ADMIN_ID, msg.video.file_id, {
        caption: msg.caption || "",
      });
    } else if (msg.document) {
      sentMsg = await bot.sendDocument(ADMIN_ID, msg.document.file_id, {
        caption: msg.caption || "",
      });
    } else if (msg.sticker) {
      sentMsg = await bot.sendSticker(ADMIN_ID, msg.sticker.file_id);
    } else if (msg.animation) {
      sentMsg = await bot.sendAnimation(ADMIN_ID, msg.animation.file_id, {
        caption: msg.caption || "",
      });
    } else if (msg.video_note) {
      sentMsg = await bot.sendVideoNote(ADMIN_ID, msg.video_note.file_id);
    }

    if (sentMsg) {
      messageMap[sentMsg.message_id] = { userId };
    }

    // تایید برای کاربر
    await bot.sendMessage(userId, "پیام شما به pelnak ارسال شد ✅️");
  } catch (e) {
    console.error("خطا در ارسال پیام:", e.message);
  }
});

console.log("ربات در حال اجرا است...");
