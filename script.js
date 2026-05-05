const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const navShell = document.querySelector(".nav-shell");
const yearTarget = document.querySelector("#year");
const jobsForm = document.querySelector("#jobs-form");
const jobsFormStatus = document.querySelector("#jobs-form-status");
const waterWaveSvgs = document.querySelectorAll(".wave-water .wave-svg, .footer-wave .wave-svg");
const photoMarquee = document.querySelector(".photo-marquee");
const internalAnchorLinks = document.querySelectorAll('a[href^="#"]');

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let scrollAnimationFrame = null;

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const getCenteredScrollTarget = (target) => {
  const rect = target.getBoundingClientRect();
  const currentY = window.scrollY || window.pageYOffset;
  const viewportHeight = window.innerHeight;
  const targetHeight = Math.min(rect.height, viewportHeight * 0.82);
  const centeredOffset = (viewportHeight - targetHeight) / 2;
  const destination = currentY + rect.top - centeredOffset;
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - viewportHeight
  );

  return Math.min(Math.max(destination, 0), maxScroll);
};

const animateWindowScroll = (destination) => {
  if (scrollAnimationFrame) {
    window.cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame = null;
  }

  if (reduceMotionQuery.matches) {
    window.scrollTo(0, destination);
    return;
  }

  const startY = window.scrollY || window.pageYOffset;
  const distance = destination - startY;
  const duration = 1100;
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeInOutCubic(progress);

    window.scrollTo(0, startY + distance * easedProgress);

    if (progress < 1) {
      scrollAnimationFrame = window.requestAnimationFrame(step);
    } else {
      scrollAnimationFrame = null;
    }
  };

  scrollAnimationFrame = window.requestAnimationFrame(step);
};

internalAnchorLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");

    if (!href || href === "#") {
      return;
    }

    const target = document.querySelector(href);

    if (!target) {
      return;
    }

    event.preventDefault();

    const destination = href === "#top" ? 0 : getCenteredScrollTarget(target);
    animateWindowScroll(destination);
    window.history.replaceState(null, "", href);

    if (siteNav && navShell && navToggle) {
      siteNav.classList.remove("open");
      navShell.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
});

if (navToggle && siteNav && navShell) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navShell.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
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

if (photoMarquee) {
  const feedUrl = photoMarquee.dataset.feedUrl;
  const photoCards = Array.from(photoMarquee.querySelectorAll(".photo-card"));

  const updatePhotoMarquee = async () => {
    if (!feedUrl || !photoCards.length) {
      return;
    }

    try {
      const response = await fetch(feedUrl, { method: "GET" });

      if (!response.ok) {
        throw new Error("Feed request failed.");
      }

      const feed = await response.json();
      const items = Array.isArray(feed.items)
        ? feed.items
            .map((item) => {
              const imageUrl =
                item.image?.trim() ||
                item.attachments?.[0]?.url?.trim() ||
                "";
              const postUrl = item.url?.trim() || "";
              const title = item.title?.trim() || item.content_text?.trim() || "";

              if (!imageUrl || !postUrl) {
                return null;
              }

              return { imageUrl, postUrl, title };
            })
            .filter(Boolean)
        : [];

      if (!items.length) {
        return;
      }

      photoCards.forEach((card, index) => {
        const image = card.querySelector("img");
        const link = card.querySelector(".photo-card-link");

        if (!image || !link) {
          return;
        }

        const item = items[index % items.length];
        const isDuplicate = card.hasAttribute("aria-hidden");

        image.src = item.imageUrl;
        image.referrerPolicy = "no-referrer";
        image.alt = isDuplicate ? "" : item.title || "Recent Instagram post from The Wash Company";
        link.href = item.postUrl;
        link.setAttribute(
          "aria-label",
          isDuplicate
            ? "Instagram post"
            : item.title || "Open Instagram post from The Wash Company"
        );
      });
    } catch (error) {
      console.error("Unable to load Instagram feed for marquee.", error);
    }
  };

  updatePhotoMarquee();
}

if (waterWaveSvgs.length) {
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

    if (!reduceMotionQuery.matches) {
      waveAnimationFrame = window.requestAnimationFrame(renderWaves);
    }
  };

  const renderStaticWaves = () => renderWaves(0);

  renderStaticWaves();

  if (!reduceMotionQuery.matches) {
    waveAnimationFrame = window.requestAnimationFrame(renderWaves);
  }

  if (typeof reduceMotionQuery.addEventListener === "function") {
    reduceMotionQuery.addEventListener("change", () => {
      if (waveAnimationFrame) {
        window.cancelAnimationFrame(waveAnimationFrame);
        waveAnimationFrame = null;
      }

      renderStaticWaves();

      if (!reduceMotionQuery.matches) {
        waveAnimationFrame = window.requestAnimationFrame(renderWaves);
      }
    });
  }
}
