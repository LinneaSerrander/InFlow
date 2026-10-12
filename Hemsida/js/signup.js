/*
 * Intresseanmälan — fills the "Grupp" dropdown with the groups from the
 * course files in InFlow/Kurser/ (the "group:" line). Uses js/courses.js.
 * Courses whose "until" date has passed are left out.
 */
const groupSelect = document.querySelector("[data-course-groups]");

if (groupSelect) {
  const placeholder = groupSelect.querySelector("option[value='']");

  loadCourses()
    .then((courses) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const current = courses.filter((c) => !c.until || parseDate(c.until) >= today);
      const groups = courseGroups(current);

      if (!groups.length) {
        placeholder.textContent = "Inga grupper att anmäla sig till just nu";
        return;
      }

      placeholder.textContent = "Välj grupp";
      for (const group of groups) {
        groupSelect.add(new Option(group, group));
      }
    })
    .catch((error) => {
      console.error("Intresseanmälan: could not load the course groups.", error);
      placeholder.textContent = "Grupperna kunde inte laddas – kontakta oss";
    });
}
