// Mobile navigation toggle
const toggle = document.querySelector(".nav__toggle");
const navList = document.querySelector(".nav__list");

if (toggle && navList) {
  toggle.addEventListener("click", () => {
    const isOpen = navList.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close the menu after picking a link
  navList.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      navList.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

// Highlight the menu link for the current page
const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav__list a").forEach((link) => {
  if (link.getAttribute("href") === currentPage) {
    link.setAttribute("aria-current", "page");
  }
});

// Keep the footer year current
const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();
