const API_ROOT = "https://lakeside-laundromat-jobs.chwalik.workers.dev";
const form = document.querySelector("#weight-form");
const clientName = document.querySelector("#page-title");
const binColorField = document.querySelector("#bin-color-field");
const weightInput = document.querySelector("#weight");
const weightLabel = document.querySelector("#weight-label");
const weightHelp = document.querySelector("#weight-help");
const preview = document.querySelector("#preview");
const laundryPreview = document.querySelector("#laundry-preview");
const chargePreview = document.querySelector("#charge-preview");
const status = document.querySelector("#status");
const params = new URLSearchParams(window.location.search);
const clientId = params.get("client") || "";
const token = params.get("token") || "";
let client = null;

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function getSelectedBinColor() {
  return form.querySelector('input[name="binColor"]:checked')?.value || "";
}

function calculatePreview() {
  const scaleWeight = Number(weightInput.value);
  const binColor = getSelectedBinColor();
  let laundryWeight = scaleWeight;

  if (client?.usesBins) {
    if (!binColor || !Number.isFinite(scaleWeight)) {
      preview.hidden = true;
      return;
    }
    laundryWeight = scaleWeight - client.binWeights[binColor];
  }

  if (!Number.isFinite(laundryWeight) || laundryWeight <= 0) {
    preview.hidden = true;
    return;
  }

  preview.hidden = false;
  laundryPreview.textContent = `${laundryWeight.toFixed(1)} lb`;
  chargePreview.textContent = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(laundryWeight * client.rate);
}

async function loadClient() {
  if (!clientId || !token) {
    clientName.textContent = "Invalid weight-entry link";
    setStatus("Please scan the QR code assigned to the client.", "error");
    return;
  }

  try {
    const query = new URLSearchParams({ client: clientId, token });
    const response = await fetch(`${API_ROOT}/api/weights/client?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "This link is not valid.");

    client = result;
    clientName.textContent = client.name;
    document.title = `${client.name} | Laundry Weight Entry`;
    form.hidden = false;

    if (client.usesBins) {
      binColorField.hidden = false;
      binColorField.querySelectorAll("input").forEach((input) => {
        input.required = true;
      });
      weightLabel.textContent = "Laundry + bin weight";
      weightHelp.textContent = "Enter the total scale weight with the laundry still in the bin.";
    }
  } catch (error) {
    clientName.textContent = "Invalid weight-entry link";
    setStatus(error.message || "Please scan the client QR code again.", "error");
  }
}

form.addEventListener("input", calculatePreview);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector("button[type=submit]");
  const scaleWeight = Number(weightInput.value);
  const binColor = getSelectedBinColor();

  if (!Number.isFinite(scaleWeight) || scaleWeight <= 0) {
    setStatus("Enter a valid weight greater than zero.", "error");
    return;
  }
  if (client.usesBins && !binColor) {
    setStatus("Choose the bin color.", "error");
    return;
  }
  if (client.usesBins && scaleWeight <= client.binWeights[binColor]) {
    setStatus("The total weight must be greater than the empty bin weight.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Saving…";
  setStatus("Saving the weight…");

  try {
    const response = await fetch(`${API_ROOT}/api/weights/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: clientId,
        token,
        weight: scaleWeight,
        binColor,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The weight could not be saved.");

    form.reset();
    preview.hidden = true;
    setStatus(`✓ ${result.message}`, "success");
    weightInput.focus();
  } catch (error) {
    setStatus(error.message || "The weight could not be saved. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save weight";
  }
});

loadClient();
