function formatPesos(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP"
  }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(date);
}

function showBanner(message, type = "success") {
  const banner = document.getElementById("message-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.className = `banner banner-${type}`;
  banner.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function hideBanner() {
  const banner = document.getElementById("message-banner");
  if (banner) banner.style.display = "none";
}

function clearErrors() {
  document.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
    el.style.display = "none";
  });
}

function showFieldError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }
}

function setBtnLoading(btn, isLoading, originalText) {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.setAttribute("data-original-text", btn.textContent);
    btn.textContent = "Processing...";
  } else {
    btn.disabled = false;
    btn.textContent = originalText || btn.getAttribute("data-original-text") || "Submit";
  }
}