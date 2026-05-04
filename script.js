const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const navShell = document.querySelector(".nav-shell");
const yearTarget = document.querySelector("#year");
const jobsForm = document.querySelector("#jobs-form");
const jobsFormStatus = document.querySelector("#jobs-form-status");

if (navToggle && siteNav && navShell) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navShell.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("open");
      navShell.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear().toString();
}

if (jobsForm && jobsFormStatus) {
  jobsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const endpoint = jobsForm.dataset.endpoint;
    const submitButton = jobsForm.querySelector('button[type="submit"]');

    if (!endpoint) {
      jobsFormStatus.textContent = "Form endpoint not configured yet.";
      jobsFormStatus.className = "jobs-form-status is-error";
      return;
    }

    const formData = new FormData(jobsForm);
    const payload = Object.fromEntries(formData.entries());

    submitButton?.setAttribute("disabled", "disabled");
    jobsFormStatus.textContent = "Sending application...";
    jobsFormStatus.className = "jobs-form-status";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Request failed.");
      }

      jobsForm.reset();
      jobsFormStatus.textContent = "Application sent successfully.";
      jobsFormStatus.className = "jobs-form-status is-success";
    } catch (error) {
      jobsFormStatus.textContent =
        "There was a problem sending the form. Please try again.";
      jobsFormStatus.className = "jobs-form-status is-error";
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });
}
