/**
 * Final Clean Mailer + Unsubscribe Server + Cleaner
 * Optimized for Outlook & Gmail deliverability
 */

const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const { createObjectCsvWriter } = require("csv-writer");
const express = require("express");
const nodemailer = require("nodemailer");

// ---------------- CONFIG ----------------
const SMTP_HOST = "smtp.mandrillapp.com";
const SMTP_PORT = 465;
const SMTP_USER = "no-reply@henghaichen.com"; // Mandrill ignores, keep neat
const SMTP_PASS = "md-_XejRnUNtG8L4ExYlbfbVA"; // Mandrill API key

const FROM_NAME = "Henghaichen Insights";
const FROM_EMAIL = "no-reply@henghaichen.com"; // ✅ lowercase, aligned
const REPLY_TO = "p.scott@henghaichen.com";    // ✅ must exist/forward

const UNSUBSCRIBE_URL = "https://unsubscribe.henghaichen.com";
const UNSUBSCRIBE_MAILTO = "unsubscribe@henghaichen.com";

// Concurrency
const MAX_CONCURRENT = 5;
const RETRY_DELAY_MS = 5000;

const EMAILS_FILE = path.join(__dirname, "emails.csv");
const CLEANED_FILE = path.join(__dirname, "emails_cleaned.csv");
const SUBSCRIBERS_FILE = path.join(__dirname, "subscribers.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// Transporter (single, global)
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// --------------- HELPERS -----------------
function loadSubscribers() {
  if (!fs.existsSync(SUBSCRIBERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, "utf8"));
}

function saveSubscribers(data) {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function buildListUnsubscribe(unsubscribeUrl) {
  const safeUrl = String(unsubscribeUrl || UNSUBSCRIBE_URL).trim();
  const cleanUrl = safeUrl.replace(/[\r\n]/g, " ");
  // ✅ Better for Outlook: include both HTTPS + mailto
  return `<${cleanUrl}>, <mailto:${UNSUBSCRIBE_MAILTO}>`;
}

// ---------------- TEMPLATE RENDERER -----------------
function resolveSpintax(text) {
  return text.replace(/\{([^{}]+)\}/g, (_, options) => {
    const choices = options.split("|");
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

function renderTemplate(template, data) {
  let rendered = template
    .replace(/{{firstName}}/g, data.firstName || "")
    .replace(/{{company}}/g, data.company || "")
    .replace(/{{domainName}}/g, data.domainName || "");
  
  rendered = resolveSpintax(rendered);
  return rendered;
}

// -------------- LOAD & CLEAN LIST ----------------
async function loadAndCleanEmails() {
  return new Promise((resolve, reject) => {
    const subscribers = loadSubscribers();
    const cleaned = [];

    fs.createReadStream(EMAILS_FILE)
      .pipe(csvParser())
      .on("data", (row) => {
        const email = row.email?.trim().toLowerCase();
        if (!email) return;

        const isUnsub = subscribers[email]?.unsubscribed;
        if (!isUnsub) cleaned.push(row);
      })
      .on("end", () => {
        const writer = createObjectCsvWriter({
          path: CLEANED_FILE,
          header: [
            { id: "email", title: "email" },
            { id: "name", title: "name" },
            { id: "unsubscribe_url", title: "unsubscribe_url" },
          ],
        });
        writer.writeRecords(cleaned).then(() => {
          console.log(`✅ Cleaned list saved to ${CLEANED_FILE}`);
          resolve(cleaned);
        });
      })
      .on("error", reject);
  });
}

// ----------------- MAILER -----------------
async function sendEmails(list) {
  let activeCount = 0;
  let index = 0;

  return new Promise((resolve) => {
    const next = () => {
      while (activeCount < MAX_CONCURRENT && index < list.length) {
        const { email, name, unsubscribe_url } = list[index++];
        activeCount++;
        sendOne(email, name, unsubscribe_url)
          .then(() => {
            activeCount--;
            next();
          })
          .catch((err) => {
            console.error(`❌ Error sending to ${email}:`, err.message);
            setTimeout(() => {
              activeCount--;
              next();
            }, RETRY_DELAY_MS);
          });
      }
      if (activeCount === 0 && index >= list.length) {
        resolve();
      }
    };
    next();
  });
}

async function sendOne(email, name, unsubscribe_url) {
  // Load template.html
  const templatePath = path.join(__dirname, "template.html");
  let html = fs.readFileSync(templatePath, "utf8");

  // Extract domain from email
  const domainName = email.split("@")[1]?.split(".")[0] || "";

  // Preprocess template with merge tags + spintax
  html = renderTemplate(html, { firstName: domainName, company: "Awon", domainName });

  const text = `Hello ${domainName},\nThis is your Awon update.`;

  const listUnsubHeader = buildListUnsubscribe(unsubscribe_url);

  const msg = {
    from: { name: FROM_NAME, address: FROM_EMAIL },
    to: email,
    subject: "3 Budget Drains You Might Be Overlooking",
    html,
    text,
    headers: {
      "List-Unsubscribe": listUnsubHeader,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", // ✅ Outlook friendly
      "Precedence": "bulk", // ✅ reduces spam flagging
      "X-Mailer": "NodeMailer via Mandrill", // ✅ transparency
    },
    replyTo: REPLY_TO,
  };

  await transporter.sendMail(msg);
  console.log(`📩 Sent to ${email}`);
}

// ----------------- EXPRESS SERVER -----------------
const app = express();
app.use(express.static(PUBLIC_DIR));

// Unsubscribe endpoint
app.get("/unsubscribe", (req, res) => {
  const e = req.query.e?.toLowerCase();
  if (!e) return res.sendFile(path.join(PUBLIC_DIR, "error.html"));

  try {
    const subscribers = loadSubscribers();
    subscribers[e] = { unsubscribed: true };
    saveSubscribers(subscribers);

    console.log(`✅ ${e} unsubscribed successfully`);

    let successHtml = fs.readFileSync(path.join(PUBLIC_DIR, "success.html"), "utf8");
    successHtml = successHtml.replace("{{email}}", e);

    res.send(successHtml);
  } catch (err) {
    console.error("❌ Error handling unsubscribe:", err);
    res.sendFile(path.join(PUBLIC_DIR, "error.html"));
  }
});

// Trigger send manually
app.get("/send", async (req, res) => {
  const cleanedList = await loadAndCleanEmails();
  await sendEmails(cleanedList);
  res.send(`✅ Sent ${cleanedList.length} emails.`);
});

const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  const cleanedList = await loadAndCleanEmails();
  await sendEmails(cleanedList);
});
