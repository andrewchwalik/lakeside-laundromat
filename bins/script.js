const API_ROOT = "https://lakeside-laundromat-jobs.chwalik.workers.dev";
const form = document.querySelector("#bin-form");
const locationLabel = document.querySelector(".location-label");
const status = document.querySelector("#status");
const params = new URLSearchParams(window.location.search);
const locationId = params.get("location") || "";
const token = params.get("token") || "";

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

async function loadLocation() {
  if (!locationId || !token) {
    locationLabel.textContent = "";
    setStatus("Please scan the QR code on your location’s instruction sheet.", "error");
    return;
  }

  try {
    const query = new URLSearchParams({ location: locationId, token });
    const response = await fetch(`${API_ROOT}/api/bins/location?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "This link is not valid.");
    locationLabel.textContent = `${result.name} | `;
    document.title = `${result.name} | Laundry Service`;
    form.hidden = false;
  } catch (error) {
    locationLabel.textContent = "";
    setStatus(error.message || "Please try scanning the QR code again.", "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  const action = data.get("action");

  if (!action) {
    setStatus("Choose what happened with the bin.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  setStatus("Sending the update…");

  try {
    const response = await fetch(`${API_ROOT}/api/bins/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: locationId,
        token,
        action,
        binCount: Number(data.get("binCount")),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The update could not be sent.");
    form.reset();
    setStatus(`✓ ${result.message} Notifications have been sent.`, "success");
  } catch (error) {
    setStatus(error.message || "The update could not be sent. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send bin update";
  }
});

loadLocation();
