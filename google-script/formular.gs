/**
 * InFlow — receiver for the website's forms (Intresseanmälan + Kontakta oss).
 *
 * This code runs at Google, not on the website. It lives in the Google Sheet
 * where the submissions are stored: open the sheet → Tillägg/Extensions →
 * Apps Script, paste this whole file, and deploy it as a web app.
 * Full steps: google-script/README.md.
 *
 * For every submission it:
 *   1. checks the fields (required ones filled in, nothing too long)
 *   2. adds a row to the form's tab in the sheet (the tab is created if missing)
 *   3. emails NOTIFY_EMAIL — for sign-ups only that one arrived and for which
 *      group; the personal details stay in the sheet.
 *
 * After changing this code: Deploy → Manage deployments → ✏️ → Version:
 * "New version" → Deploy. That keeps the same web app URL.
 */

// ===== Settings ===========================================================

// Where the notification emails go. Change to info@inflow.se once it exists.
const NOTIFY_EMAIL = "DIN.ADRESS@gmail.com";

// Longest text accepted in a single field (characters)
const MAX_LENGTH = 2000;

// One entry per form on the website: the key is the form's data-form="..."
// Each field: [name in the HTML, column heading in the sheet, required?, type]
const FORMS = {
  anmalan: {
    sheet: "Intresseanmälningar",
    fields: [
      ["participant_name", "Deltagare", true],
      ["group", "Grupp", true],
      ["parent1_name", "Förälder 1", true],
      ["parent1_phone", "Telefon förälder 1", true],
      ["parent1_email", "E-post förälder 1", true],
      ["parent2_name", "Förälder 2", false],
      ["parent2_phone", "Telefon förälder 2", false],
      ["parent2_epost", "E-post förälder 2", false],
      ["photo_consent", "Foto/video OK", false, "checkbox"],
      ["privacy_consent", "Godkänt integritetspolicy", true, "checkbox"],
      ["message", "Meddelande", false],
    ],
    notify: (data) => ({
      subject: `Ny intresseanmälan: ${data.group}`,
      body:
        `En ny intresseanmälan har kommit in till gruppen ${data.group}.\n\n` +
        `Alla uppgifter finns i kalkylarket:\n${sheetUrl()}`,
    }),
  },

  kontakt: {
    sheet: "Meddelanden",
    fields: [
      ["name", "Namn", true],
      ["email", "E-post", true],
      ["message", "Meddelande", true],
    ],
    notify: (data) => ({
      subject: `Nytt meddelande från ${data.name}`,
      body:
        `${data.name} (${data.email}) skrev via hemsidan:\n\n${data.message}\n\n` +
        `Svara direkt på det här mejlet för att svara ${data.name}.\n` +
        `Alla meddelanden: ${sheetUrl()}`,
      replyTo: data.email,
    }),
  },
};

// ===== Receiving a submission =============================================

function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    const form = FORMS[params.form];
    if (!form) return reply(false, "unknown form");

    // Honeypot: a field hidden from people. If it's filled in, a bot sent
    // this — answer "ok" so it doesn't retry, but store nothing.
    if (params.website) return reply(true);

    const data = {};
    for (const [key, , required, type] of form.fields) {
      let value = String(params[key] || "").trim().slice(0, MAX_LENGTH);
      if (type === "checkbox") value = value ? "Ja" : "Nej";
      if (required && (!value || value === "Nej")) return reply(false, `missing ${key}`);
      data[key] = value;
    }

    // One write at a time, so two simultaneous submissions can't clash
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet(form);
      sheet.appendRow([new Date(), ...form.fields.map(([key]) => safeCell(data[key]))]);
    } finally {
      lock.releaseLock();
    }

    const mail = form.notify(data);
    MailApp.sendEmail({ to: NOTIFY_EMAIL, ...mail });

    return reply(true);
  } catch (error) {
    console.error(error);
    return reply(false, "server error");
  }
}

// Opening the web app URL in a browser just shows that it's running
function doGet() {
  return ContentService.createTextOutput("InFlow-formulären tar emot inskick.");
}

// ===== Helpers ============================================================

function reply(ok, error) {
  return ContentService
    .createTextOutput(JSON.stringify(ok ? { ok: true } : { ok: false, error }))
    .setMimeType(ContentService.MimeType.JSON);
}

// The form's tab, created with a heading row the first time
function getSheet(form) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(form.sheet);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(form.sheet);
    sheet.appendRow(["Inkommet", ...form.fields.map(([, heading]) => heading)]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, form.fields.length + 1).setFontWeight("bold");
  }
  return sheet;
}

// Text starting with = + - @ would be run as a formula by Sheets. A leading
// apostrophe makes it plain text (it isn't shown in the cell). Phone numbers
// like +46... are kept as text this way too.
function safeCell(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function sheetUrl() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

// Run this once from the Apps Script editor (select it, click ▶ Kör/Run) to
// check that the sheet and email work before connecting the website.
function testaInskick() {
  const result = doPost({
    parameter: {
      form: "kontakt",
      name: "Test Testsson",
      email: NOTIFY_EMAIL,
      message: "Det här är ett test från Apps Script-redigeraren.",
    },
  });
  console.log(result.getContent());
}
