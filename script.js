const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const navShell = document.querySelector(".nav-shell");
const yearTarget = document.querySelector("#year");
const jobsForm = document.querySelector("#jobs-form");
const jobsFormStatus = document.querySelector("#jobs-form-status");
const waterWaveSvgs = document.querySelectorAll(".wave-water .wave-svg, .footer-wave .wave-svg");

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

if (waterWaveSvgs.length) {
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SVG_WIDTH = 1440;
  let waveAnimationFrame = null;

  const buildWavePath = ({
    width,
    height,
    baseY,
    amplitudeA,
    amplitudeB,
    phase,
    frequencyA,
    frequencyB,
    orientation,
  }) => {
    const step = 36;
    let path = `M 0 ${baseY.toFixed(2)}`;

    for (let x = 0; x <= width + step; x += step) {
      const normalized = (x / width) * Math.PI * 2;
      const y =
        baseY +
        Math.sin(normalized * frequencyA + phase) * amplitudeA +
        Math.sin(normalized * frequencyB + phase * 1.35) * amplitudeB;

      path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }

    if (orientation === "top") {
      path += ` L ${width} ${height} L 0 ${height} Z`;
    } else {
      path += ` L ${width} 0 L 0 0 Z`;
    }

    return path;
  };

  const waveConfigs = Array.from(waterWaveSvgs).map((svg, index) => {
    const isFooter = svg.closest(".footer-wave");
    const orientation = svg.dataset.orientation || svg.closest(".wave-water")?.dataset.orientation || "top";
    const backPath = svg.querySelector(".wave-layer-back");
    const frontPath = svg.querySelector(".wave-layer-front");
    const backColor = svg.dataset.layerBack || svg.closest(".wave-water")?.dataset.layerBack || "#86e7ff";
    const frontColor = svg.dataset.layerFront || svg.closest(".wave-water")?.dataset.layerFront || "#0bb5ef";
    const height = Number(svg.viewBox.baseVal.height) || 140;
    const topWaveBase = isFooter ? 56 : 76;
    const bottomWaveBase = isFooter ? 66 : 48;

    backPath?.setAttribute("fill", backColor);
    frontPath?.setAttribute("fill", frontColor);

    return {
      svg,
      backPath,
      frontPath,
      orientation,
      height,
      baseY: orientation === "top" ? topWaveBase : bottomWaveBase,
      backAmplitudeA: isFooter ? 9 : 10,
      backAmplitudeB: isFooter ? 4 : 5,
      frontAmplitudeA: isFooter ? 12 : 13,
      frontAmplitudeB: isFooter ? 5 : 6,
      backFrequencyA: 1.3,
      backFrequencyB: 2.1,
      frontFrequencyA: 1.55,
      frontFrequencyB: 2.5,
      backSpeed: 0.00092 + index * 0.00003,
      frontSpeed: 0.00135 + index * 0.00004,
      bobSpeed: 0.00082 + index * 0.000015,
      bobAmount: isFooter ? 2.4 : 3.2,
      basePhase: index * 0.9,
    };
  });

  const renderWaves = (time) => {
    waveConfigs.forEach((wave, index) => {
      if (!wave.backPath || !wave.frontPath) {
        return;
      }

      const backPhase = time * wave.backSpeed + wave.basePhase;
      const frontPhase = time * wave.frontSpeed + wave.basePhase * 1.15;
      const bobOffset = Math.sin(time * wave.bobSpeed + index) * wave.bobAmount;

      const backPathData = buildWavePath({
        width: SVG_WIDTH,
        height: wave.height,
        baseY: wave.baseY + bobOffset,
        amplitudeA: wave.backAmplitudeA,
        amplitudeB: wave.backAmplitudeB,
        phase: backPhase,
        frequencyA: wave.backFrequencyA,
        frequencyB: wave.backFrequencyB,
        orientation: wave.orientation,
      });

      const frontPathData = buildWavePath({
        width: SVG_WIDTH,
        height: wave.height,
        baseY: wave.baseY + bobOffset * 0.7 + (wave.orientation === "top" ? 10 : -10),
        amplitudeA: wave.frontAmplitudeA,
        amplitudeB: wave.frontAmplitudeB,
        phase: frontPhase,
        frequencyA: wave.frontFrequencyA,
        frequencyB: wave.frontFrequencyB,
        orientation: wave.orientation,
      });

      wave.backPath.setAttribute("d", backPathData);
      wave.frontPath.setAttribute("d", frontPathData);
    });

    if (!reducedMotionQuery.matches) {
      waveAnimationFrame = window.requestAnimationFrame(renderWaves);
    }
  };

  const renderStaticWaves = () => renderWaves(0);

  renderStaticWaves();

  if (!reducedMotionQuery.matches) {
    waveAnimationFrame = window.requestAnimationFrame(renderWaves);
  }

  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", () => {
      if (waveAnimationFrame) {
        window.cancelAnimationFrame(waveAnimationFrame);
        waveAnimationFrame = null;
      }

      renderStaticWaves();

      if (!reducedMotionQuery.matches) {
        waveAnimationFrame = window.requestAnimationFrame(renderWaves);
      }
    });
  }
}
