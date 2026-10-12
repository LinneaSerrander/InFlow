/*
 * Sends the website's forms (Intresseanmälan, Kontakta oss) to the Google
 * Apps Script receiver, which stores them in the Google Sheet and emails us.
 * The receiver's code is in InFlow/google-script/formular.gs.
 *
 * A form takes part by having data-form="<name>" (must match a key in FORMS
 * in formular.gs) and data-success="<thank-you text>".
 */

// The web app URL from Apps Script: Deploy → Manage deployments → Web app URL.
// Empty = forms aren't connected yet (visitors get a message to email instead).
const FORM_ENDPOINT = "";

const CONTACT_EMAIL = "info@inflow.se";

function showFormStatus(form, type, text) {
  let status = form.querySelector(".form-status");
  if (!status) {
    status = document.createElement("p");
    status.setAttribute("role", type === "error" ? "alert" : "status");
    form.append(status);
  }
  status.className = `form-status form-status--${type}`;
  status.textContent = text;
}

async function sendForm(form) {
  const body = new URLSearchParams(new FormData(form));
  body.set("form", form.dataset.form);

  // A plain POST without custom headers, so the browser accepts Google's answer
  const response = await fetch(FORM_ENDPOINT, { method: "POST", body });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "unknown error");
}

document.querySelectorAll("form[data-form]").forEach((form) => {
  const button = form.querySelector("[type=submit]");
  const buttonText = button.textContent;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!FORM_ENDPOINT) {
      showFormStatus(form, "error",
        `Formuläret är inte igång ännu. Mejla oss gärna på ${CONTACT_EMAIL} så länge.`);
      return;
    }

    button.disabled = true;
    button.textContent = "Skickar…";

    try {
      await sendForm(form);

      // Replace the form with the thank-you message
      const thanks = document.createElement("div");
      thanks.className = "form-status form-status--success";
      thanks.setAttribute("role", "status");
      thanks.tabIndex = -1;
      thanks.textContent = form.dataset.success || "Tack! Vi har tagit emot ditt meddelande.";
      form.replaceWith(thanks);
      thanks.focus();
    } catch (error) {
      console.error("Form could not be sent:", error);
      showFormStatus(form, "error",
        `Något gick fel och det skickades inte. Försök igen om en stund, eller mejla oss på ${CONTACT_EMAIL}.`);
      button.disabled = false;
      button.textContent = buttonText;
    }
  });
});
