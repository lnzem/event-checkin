// web/register/app.js - client-side registration logic
(function () {
  var form = document.getElementById("register-form");
  var submitBtn = document.getElementById("submit-btn");
  var formSection = document.getElementById("form-section");
  var successSection = document.getElementById("success-section");
  var backBtn = document.getElementById("back-btn");
  var qrImg = document.getElementById("qr-image");
  var ticketIdEl = document.getElementById("ticket-id");
  var nameEl = document.getElementById("attendee-name");

  var LABELS = {
    full_name: "Full Name",
    email: "Email",
    organization: "Organization",
    contact_number: "Contact Number"
  };

  var MESSAGES = {
    full_name: "Full Name is required",
    email: "Enter a valid email address",
    organization: "Organization is required",
    contact_number: "Enter a valid PH mobile number (09XXXXXXXXX or +639XXXXXXXXX)"
  };

  function isValid(name, value) {
    var v = value.trim();
    switch (name) {
      case "full_name":
        return v.length > 0;
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      case "organization":
        return v.length > 0;
      case "contact_number":
        return /^(?:09\d{9}|\+639\d{9})$/.test(v);
      default:
        return true;
    }
  }

  function showError(input, msg) {
    var errDiv = input.parentElement.querySelector(".error-msg");
    if (errDiv) errDiv.textContent = msg;
  }

  function clearError(input) {
    var errDiv = input.parentElement.querySelector(".error-msg");
    if (errDiv) errDiv.textContent = "";
  }

  // Validate on blur
  var inputs = form.querySelectorAll("input");
  for (var i = 0; i < inputs.length; i++) {
    (function (inp) {
      inp.addEventListener("blur", function () {
        if (!isValid(inp.name, inp.value)) {
          showError(inp, MESSAGES[inp.name] || "Invalid field");
        } else {
          clearError(inp);
        }
      });
    })(inputs[i]);
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();

    // Validate all fields
    var valid = true;
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (!isValid(inp.name, inp.value)) {
        showError(inp, MESSAGES[inp.name] || "Invalid field");
        valid = false;
      } else {
        clearError(inp);
      }
    }
    if (!valid) return;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.classList.add("loading");
    var originalText = submitBtn.textContent;
    submitBtn.textContent = "Registering...";

    var payload = {
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      organization: form.organization.value.trim(),
      contact_number: form.contact_number.value.trim()
    };

    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.json().then(function (err) {
            throw new Error(err.message || "Registration failed");
          });
        }
        return resp.json();
      })
      .then(function (data) {
        // Populate success view
        ticketIdEl.textContent = data.ticket_id;
        nameEl.textContent = data.full_name;
        qrImg.src = data.qr_data_url;

        // Swap views
        formSection.classList.add("hidden");
        successSection.classList.remove("hidden");
      })
      .catch(function (err) {
        alert(err.message || "Network error - please try again.");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.classList.remove("loading");
        submitBtn.textContent = originalText;
      });
  });

  backBtn.addEventListener("click", function () {
    form.reset();
    // Clear all error messages
    var errorDivs = form.querySelectorAll(".error-msg");
    for (var i = 0; i < errorDivs.length; i++) {
      errorDivs[i].textContent = "";
    }
    successSection.classList.add("hidden");
    formSection.classList.remove("hidden");
  });
})();
