/*
 * Shared course loading — used by kursschema.html (the schedule) and
 * anmalan.html (the group dropdown). Load after js-yaml and before the
 * page's own script.
 *
 * Each course is a .yaml file in InFlow/Kurser/ — outside the website folder,
 * one subfolder per course (see Kurser/_mall.yaml for all fields).
 * tools/build_courses.py bundles them into data/kurser.json, which is what
 * the browser loads (tools/serve.py rebuilds it automatically).
 */
const COURSES_BUNDLE = "data/kurser.json";

const DAYS = [
  { key: "mon", name: "Måndag" },
  { key: "tue", name: "Tisdag" },
  { key: "wed", name: "Onsdag" },
  { key: "thu", name: "Torsdag" },
  { key: "fri", name: "Fredag" },
  { key: "sat", name: "Lördag" },
  { key: "sun", name: "Söndag" },
];

const toHours = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
};

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- Date helpers (all in local time) ---------- */

const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const startOfWeek = (date) => addDays(date, -((date.getDay() + 6) % 7)); // Monday

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const parseDate = (text) => {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// ISO 8601 week number (weeks start on Monday, week 1 contains the first Thursday)
function weekNumber(date) {
  const thursday = addDays(startOfWeek(date), 3);
  const firstThursday = addDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
  return 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

// "2026-09-24" — used to match cancelled dates
const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/* ---------- Loading courses from InFlow/Kurser/ (via data/kurser.json) ---------- */

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_PATTERN = /^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/; // "34" or "34-51"
const DMY_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/; // "24/09/2026"

// Accepts a YAML list, a single value, or comma-separated text — always returns a list of strings
const toList = (value) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

// weeks: [34, 35, "40-45"] -> Set of week numbers. A range like "48-3" wraps
// over new year. Returns null when there's no weeks line (= every week).
function parseWeeks(value, warn) {
  if (value == null || value === "") return null;
  const weeks = new Set();
  for (const item of toList(value)) {
    const match = item.match(WEEK_PATTERN);
    const first = match && Number(match[1]);
    const last = match && Number(match[2] ?? match[1]);
    if (!match || first < 1 || first > 53 || last < 1 || last > 53) {
      warn(`week "${item}" should be a number 1–53 or a range like "34-51"`);
      continue;
    }
    for (let w = first; ; w = (w % 53) + 1) {
      weeks.add(w);
      if (w === last) break;
    }
  }
  return weeks;
}

// "24/09/2026" -> "2026-09-24", or null if it isn't a real date
function parseDmy(text) {
  const match = text.match(DMY_PATTERN);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (date.getDate() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1) return null;
  return dateKey(date);
}

// Date-specific notes, used by "cancelled" and "specific_info".
// Returns a Map of "2026-09-24" -> list of note texts (may be empty).
// Accepted forms (can be mixed):
//   - 21/09/2026: Sjukdom            list item with a note
//   - 21/09/2026                     list item without a note
//   - 21/09/2026 -Sjukdom            date and note in one text
//   21/09/2026: Sjukdom              a plain key: value mapping (no dashes)
function parseDatedNotes(value, field, warn) {
  const notes = new Map();
  if (value == null || value === "") return notes;

  const add = (dateText, note) => {
    const key = parseDmy(String(dateText).trim());
    if (!key) {
      warn(`${field} date "${dateText}" should be a real date like "24/09/2026"`);
      return;
    }
    const texts = (Array.isArray(note) ? note : [note])
      .map((text) => (text == null ? "" : String(text).trim()))
      .filter(Boolean);
    notes.set(key, [...(notes.get(key) || []), ...texts]);
  };

  for (const entry of Array.isArray(value) ? value : [value]) {
    if (entry && typeof entry === "object") {
      for (const [dateText, note] of Object.entries(entry)) add(dateText, note);
    } else {
      // "21/09/2026", "21/09/2026 -Sjukdom" or "21/09/2026 Sjukdom"
      const match = String(entry ?? "").trim().match(/^(\S+)\s*(?:-\s*)?([\s\S]*)$/);
      if (match) add(match[1], match[2]);
    }
  }
  return notes;
}

// Check one course from a file. Returns the cleaned-up course, or null (with a
// console warning explaining why) if it can't be shown.
function validateCourse(raw, source) {
  const warn = (problem) => {
    console.warn(`Kursschema: skipping course in ${source} — ${problem}`, raw);
    return null;
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return warn("expected a set of key: value lines");
  if ("sessions" in raw) return warn('"sessions" should be a list (each line starting with "- day:")');

  // weeks / cancelled / specific_info are lists; a bad entry there is ignored
  // (with a warning), not the whole course
  const { weeks, cancelled, specific_info: specificInfo, ...fields } = raw;
  const course = {};
  for (const [key, value] of Object.entries(fields)) {
    course[key] = value == null ? "" : String(value).trim();
  }

  const warnEntry = (problem) => console.warn(`Kursschema: ${source} — ${problem} (ignored)`);
  course.weeks = parseWeeks(weeks, warnEntry);
  course.source = source;
  course.cancelled = parseDatedNotes(cancelled, "cancelled", warnEntry);
  course.specificInfo = parseDatedNotes(specificInfo, "specific_info", warnEntry);

  for (const field of ["day", "start", "end", "title"]) {
    if (!course[field]) return warn(`"${field}" is missing`);
  }

  course.day = course.day.toLowerCase();
  if (!DAYS.some((d) => d.key === course.day)) {
    return warn(`day "${course.day}" should be one of ${DAYS.map((d) => d.key).join(", ")}`);
  }

  for (const field of ["start", "end"]) {
    const match = course[field].match(TIME_PATTERN);
    if (!match || Number(match[1]) > 24 || Number(match[2]) > 59) {
      return warn(`${field} "${course[field]}" should look like "19:00"`);
    }
    course[field] = `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  if (toHours(course.end) <= toHours(course.start)) return warn("end must be after start");

  for (const field of ["from", "until"]) {
    if (course[field] && !DATE_PATTERN.test(course[field])) {
      return warn(`${field} "${course[field]}" should look like "2026-08-24"`);
    }
  }

  return course;
}

// A course that meets several times a week lists them under "sessions":
// each session becomes its own slot, sharing the course's other fields.
// A session may also override a field (e.g. a different place that day).
function expandSessions(entry) {
  if (!entry || typeof entry !== "object" || !("sessions" in entry)) return [entry];
  const { sessions, ...shared } = entry;
  if (!Array.isArray(sessions)) return [{ ...shared, sessions }]; // let validation report it
  return sessions.map((session) => ({ ...shared, ...session }));
}

// data/kurser.json holds every course's YAML text, named after its folder
// (Kurser/6-7_ekängen/schedule.yaml -> "6-7_ekängen.yaml"). A broken file is
// reported and skipped; the rest still load.
async function loadCourses() {
  const response = await fetch(COURSES_BUNDLE, { cache: "no-store" });
  if (!response.ok) throw new Error(`${COURSES_BUNDLE}: ${response.status}`);
  const { files } = await response.json();

  return files.flatMap(({ path, yaml }) => {
    try {
      // CORE_SCHEMA keeps dates like 2026-08-24 as plain text
      const data = jsyaml.load(yaml, { schema: jsyaml.CORE_SCHEMA });
      // A file can hold one course, or a list of courses
      const entries = (Array.isArray(data) ? data : [data]).flatMap(expandSessions);
      return entries.map((entry) => validateCourse(entry, path)).filter(Boolean);
    } catch (error) {
      console.error(`Kursschema: could not read ${path}:`, error.message);
      return [];
    }
  });
}

// Every group that has at least one course, in natural order (6-7 before 10-11)
const courseGroups = (courses) =>
  [...new Set(courses.map((c) => c.group).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
