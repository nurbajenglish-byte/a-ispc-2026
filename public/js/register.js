/* ─────────────────────────────────────────────────────────────────────────────
   A-ISPC 2026 — Registration Form Controller
   Handles: validation, member-3 toggle, review summary, Stripe redirect
───────────────────────────────────────────────────────────────────────────── */

"use strict";

(function () {
  // ── DOM refs ───────────────────────────────────────────────────────────────
  const form        = document.getElementById("registration-form");
  const errorBanner = document.getElementById("form-error");
  const errorText   = document.getElementById("form-error-text");
  const submitBtn   = document.getElementById("submitBtn");
  const btnText     = submitBtn.querySelector(".btn-pay__text");
  const btnIcon     = submitBtn.querySelector(".btn-pay__icon");
  const btnLoading  = submitBtn.querySelector(".btn-pay__loading");
  const reviewBox   = document.getElementById("reviewBox");
  const reviewGrid  = document.getElementById("reviewGrid");

  // Member-3 toggle
  const addMember3Checkbox = document.getElementById("addMember3");
  const member3Fields      = document.getElementById("member3Fields");
  const member3Name        = document.getElementById("member3Name");
  const member3Age         = document.getElementById("member3Age");

  // Progress steps
  const progressSteps = document.querySelectorAll(".form-progress__step");

  // ── Member 3 toggle ────────────────────────────────────────────────────────
  addMember3Checkbox.addEventListener("change", () => {
    const show = addMember3Checkbox.checked;
    member3Fields.hidden = !show;
    member3Name.required = show;
    member3Age.required  = show;
    if (!show) {
      member3Name.value = "";
      member3Age.value  = "";
    }
  });

  // ── Live progress tracking ─────────────────────────────────────────────────
  // Mark sections as "active" based on scroll/focus — simple section-complete logic
  const sections = document.querySelectorAll(".form-section");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const sectionNum = entry.target.dataset.section;
        progressSteps.forEach(step => {
          const n = parseInt(step.dataset.step);
          step.classList.toggle("active",    n === parseInt(sectionNum));
          step.classList.toggle("completed", n < parseInt(sectionNum));
        });
      }
    });
  }, { threshold: 0.4 });
  sections.forEach(s => observer.observe(s));

  // ── Input: clear errors on change ─────────────────────────────────────────
  form.addEventListener("input", () => {
    if (!errorBanner.hidden) hideError();
  });

  // ── Build review summary ───────────────────────────────────────────────────
  function buildReview(data) {
    reviewGrid.innerHTML = "";

    const rows = [
      ["Team Name",  data.teamName],
      ["Division",   data.division],
      ["School",     data.schoolName],
      ["Country",    data.country],
      ["Member 1",   `${data.member1Name}, age ${data.member1Age}`],
      data.member2Name ? ["Member 2", `${data.member2Name}, age ${data.member2Age}`] : null,
      data.member3Name ? ["Member 3", `${data.member3Name}, age ${data.member3Age}`] : null,
      ["Mentor",     data.mentorName],
      ["Mentor Email", data.mentorEmail],
    ].filter(Boolean);

    rows.forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      reviewGrid.appendChild(dt);
      reviewGrid.appendChild(dd);
    });

    reviewBox.hidden = false;
    reviewBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── Validation helpers ─────────────────────────────────────────────────────
  function showError(msg) {
    errorText.textContent = msg;
    errorBanner.hidden = false;
    errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideError() {
    errorBanner.hidden = true;
    errorText.textContent = "";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function validateForm(data) {
    if (!data.teamName.trim())
      return "Please enter your team name.";

    if (!["Junior", "Senior"].includes(data.division))
      return "Please select a competition division (Junior or Senior).";

    if (!data.schoolName.trim())
      return "Please enter your school name.";

    if (!data.country)
      return "Please select your country.";

    if (!data.member1Name.trim() || !data.member1Age)
      return "Please enter the name and age for Member 1.";

    const m1Age = parseInt(data.member1Age);
    if (isNaN(m1Age) || m1Age < 12 || m1Age > 18)
      return "Member 1 age must be between 12 and 18.";

    if (!data.member2Name.trim() || !data.member2Age)
      return "Please enter the name and age for Member 2 (minimum 2 team members required).";

    const m2Age = parseInt(data.member2Age);
    if (isNaN(m2Age) || m2Age < 12 || m2Age > 18)
      return "Member 2 age must be between 12 and 18.";

    if (addMember3Checkbox.checked) {
      if (!data.member3Name.trim() || !data.member3Age)
        return "Please enter the name and age for Member 3, or uncheck the third member option.";
      const m3Age = parseInt(data.member3Age);
      if (isNaN(m3Age) || m3Age < 12 || m3Age > 18)
        return "Member 3 age must be between 12 and 18.";
    }

    if (!data.mentorName.trim())
      return "Please enter the mentor teacher's full name.";

    if (!isValidEmail(data.mentorEmail))
      return "Please enter a valid email address for the mentor teacher.";

    if (!document.getElementById("agreeTerms").checked)
      return "Please confirm that you agree to the Competition Rules and Terms.";

    return null; // no errors
  }

  // ── Set submit button to loading state ────────────────────────────────────
  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    btnText.hidden     = isLoading;
    btnIcon.hidden     = isLoading;
    btnLoading.hidden  = !isLoading;
  }

  // ── Form submit ────────────────────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    // Collect form data
    const data = {
      teamName    : document.getElementById("teamName").value.trim(),
      division    : (form.querySelector('input[name="division"]:checked') || {}).value || "",
      schoolName  : document.getElementById("schoolName").value.trim(),
      country     : document.getElementById("country").value,
      member1Name : document.getElementById("member1Name").value.trim(),
      member1Age  : document.getElementById("member1Age").value.trim(),
      member2Name : document.getElementById("member2Name").value.trim(),
      member2Age  : document.getElementById("member2Age").value.trim(),
      member3Name : addMember3Checkbox.checked ? document.getElementById("member3Name").value.trim() : "",
      member3Age  : addMember3Checkbox.checked ? document.getElementById("member3Age").value.trim() : "",
      mentorName  : document.getElementById("mentorName").value.trim(),
      mentorEmail : document.getElementById("mentorEmail").value.trim().toLowerCase(),
    };

    // Client-side validation
    const validationError = validateForm(data);
    if (validationError) {
      showError(validationError);
      return;
    }

    // Build and show review summary before redirecting
    buildReview(data);

    // Short pause so user sees the summary, then redirect
    setLoading(true);

    try {
      const response = await fetch("/api/create-checkout-session", {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Server error. Please try again.");
      }

      if (!result.url) {
        throw new Error("No checkout URL received. Please contact support.");
      }

      // Redirect to Stripe Hosted Checkout
      window.location.href = result.url;

    } catch (err) {
      setLoading(false);
      showError(err.message);
    }
  });

})();
