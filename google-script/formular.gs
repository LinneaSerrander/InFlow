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
 *   2. adds a row to the form's tab in the sheet (the tab is created if missing).
 *      Sign-ups get one tab per group, named after the group.
 *   3. emails NOTIFY_EMAIL — for sign-ups only that one arrived and for which
 *      group; the personal details stay in the sheet.
 *
 * It also adds the menu "InFlow → Uppdatera mejllistor" to the sheet, which
 * collects the email addresses per group (see Mejllistor further down).
 *
 * After changing this code: Deploy → Manage deployments → ✏️ → Version:
 * "New version" → Deploy. That keeps the same web app URL.
 */

// ===== Settings ===========================================================

// Where the notification emails go
const NOTIFY_EMAIL = "info@inflowstudio.se";

// Longest text accepted in a single field (characters)
const MAX_LENGTH = 2000;

// One entry per form on the website: the key is the form's data-form="..."
// Each field: [name in the HTML, column heading in the sheet, required?, type]
const FORMS = {
  anmalan: {
    // One tab per group, e.g. "Julläger Åtvidaberg, födda 2017-2019"
    sheet: (data) => groupSheetName(data.group),
    fields: [
      ["participant_name", "Deltagare", true],
      ["group", "Grupp", true],
      ["parent1_name", "Vårdnadshavare 1", true],
      ["parent1_phone", "Telefon vårdnadshavare 1", true],
      ["parent1_email", "E-post vårdnadshavare 1", true],
      ["parent2_name", "Vårdnadshavare 2", false],
      ["parent2_phone", "Telefon vårdnadshavare 2", false],
      ["parent2_epost", "E-post vårdnadshavare 2", false],
      ["photo_consent", "Foto/video OK", false, "checkbox"],
      ["privacy_consent", "Godkänt integritetspolicy", true, "checkbox"],
      ["message", "Meddelande", false],
      // Added later, so it's last: older sheets only need a new heading at the end
      ["participant_birth_year", "Födelseår", true],
      // Invoice address, also added later
      ["address_street", "Gatuadress", true],
      ["address_zip", "Postnummer", true],
      ["address_city", "Ort", true],
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
      // Checkboxes and Yes/No choices: only "ja" counts as yes (the photo question sends "" for no)
      if (type === "checkbox") value = value.toLowerCase() === "ja" ? "Ja" : "Nej";
      if (required && (!value || value === "Nej")) return reply(false, `missing ${key}`);
      data[key] = value;
    }

    // One write at a time, so two simultaneous submissions can't clash
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet(form, data);
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

// The form's tab, created with a heading row the first time. form.sheet is
// either a fixed name or a function that picks the name from the data.
function getSheet(form, data) {
  const name = typeof form.sheet === "function" ? form.sheet(data) : form.sheet;
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
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

// A tab name made from the group. Sheets doesn't allow [ ] * ? / \ : in tab
// names, and they can be at most 100 characters.
function groupSheetName(group) {
  const name = String(group || "").replace(/[\[\]*?\/\\:]/g, "-").trim().slice(0, 100);
  return name || "Intresseanmälningar";
}

function sheetUrl() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

// ===== Mejllistor =========================================================
//
// Adds a menu "InFlow → Uppdatera mejllistor" to the sheet. It collects the
// guardians' email addresses from every sign-up tab into the tab
// "Mejllistor": one row per group, ready to paste into Bcc in Gmail.
//
// Optional: add a column called "Status" at the end of a sign-up tab and
// write "Plats" for those who got a place. They then also get their own
// list, "Har plats" (handy for course information). Others, e.g. "Kö", are
// only in "Alla anmälda".

const MAIL_SHEET = "Mejllistor";
const NOT_SIGNUP_SHEETS = ["Meddelanden", MAIL_SHEET];

// Runs by itself when the sheet is opened
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("InFlow")
    .addItem("Uppdatera mejllistor", "uppdateraMejllistor")
    .addToUi();
}

function uppdateraMejllistor() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const rows = [];
  const allPlaced = new Set();
  const allSignedUp = new Set();

  for (const sheet of spreadsheet.getSheets()) {
    if (NOT_SIGNUP_SHEETS.includes(sheet.getName())) continue;
    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) continue;

    const headings = values[0].map((h) => String(h).trim().toLowerCase());
    const emailCols = headings
      .map((h, i) => (h.startsWith("e-post") ? i : -1))
      .filter((i) => i >= 0);
    if (!emailCols.length) continue; // not a sign-up tab
    const statusCol = headings.indexOf("status");

    const placed = new Set();
    const signedUp = new Set();
    for (const row of values.slice(1)) {
      const status = statusCol >= 0 ? String(row[statusCol]).trim().toLowerCase() : "";
      for (const col of emailCols) {
        const email = String(row[col]).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
        signedUp.add(email);
        allSignedUp.add(email);
        if (status.startsWith("plats")) {
          placed.add(email);
          allPlaced.add(email);
        }
      }
    }
    rows.push([sheet.getName(), placed.size, [...placed].join(", "), signedUp.size, [...signedUp].join(", ")]);
  }
  rows.push(["Alla kurser", allPlaced.size, [...allPlaced].join(", "), allSignedUp.size, [...allSignedUp].join(", ")]);

  let sheet = spreadsheet.getSheetByName(MAIL_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(MAIL_SHEET);
  sheet.getDataRange().breakApart();
  sheet.clear();
  // Description at the top of the tab
  const info = [
    ["Mejllistor"],
    ["Så uppdaterar du listorna: klicka på InFlow → Uppdatera mejllistor i menyn högst upp (bredvid Hjälp). " +
     "Listorna uppdateras inte av sig själva, så gör det innan du skickar ett mejl. Syns inte menyn? Ladda om sidan."],
    ["Så skickar du: kopiera en cell med adresser och klistra in i Hemlig kopia (Bcc) i Gmail, aldrig i Till eller Kopia."],
    ["Har plats: skriv rubriken Status i första lediga kolumnen i en kursflik och skriv Plats på raderna för dem som har fått plats. " +
     "Alla anmälda: alla intresseanmälningar, även de som står på kö."],
    [`Senast uppdaterad: ${Utilities.formatDate(new Date(), "Europe/Stockholm", "yyyy-MM-dd HH:mm")}`],
  ];
  sheet.getRange(1, 1, info.length, 1).setValues(info);
  // The longer lines span all five columns, wrapped
  sheet.getRange(2, 1, 3, 5).mergeAcross().setWrap(true).setVerticalAlignment("top");
  sheet.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  sheet.getRange(5, 1).setFontStyle("italic").setFontColor("#6b4f3f");
  const top = info.length + 2; // header row, after a blank row
  const header = ["Grupp", "Har plats", "Adresser – har plats", "Alla anmälda", "Adresser – alla anmälda"];
  sheet.getRange(top, 1, 1, header.length).setValues([header]).setFontWeight("bold").setBackground("#f5f1ed");
  sheet.getRange(top + 1, 1, rows.length, header.length).setValues(rows).setVerticalAlignment("top");
  sheet.getRange(top + rows.length, 1, 1, header.length).setFontWeight("bold");
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidths(2, 1, 80);
  sheet.setColumnWidths(4, 1, 90);
  sheet.setColumnWidth(3, 420);
  sheet.setColumnWidth(5, 420);
  sheet.getRange(top + 1, 3, rows.length, 1).setWrap(true);
  sheet.getRange(top + 1, 5, rows.length, 1).setWrap(true);
  sheet.setFrozenRows(top);
  spreadsheet.setActiveSheet(sheet);
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
