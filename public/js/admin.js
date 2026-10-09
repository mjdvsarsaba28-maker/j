let allBookings = [];

async function fetchBookings() {
  const tbody = document.getElementById("bookings-tbody");
  tbody.innerHTML = '<tr><td colspan="8" class="state-container">Loading bookings...</td></tr>';

  try {
    const response = await fetch("/api/admin/bookings", {
      credentials: "same-origin"
    });

    if (response.status === 401) {
      window.location.href = "/admin/index.html";
      return;
    }

    if (!response.ok) {
      throw new Error("Failed to retrieve bookings list.");
    }

    allBookings = await response.json();
    updateSummaryStats(allBookings);
    renderBookingsTable();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="state-container" style="color: var(--danger-color);">${error.message}</td></tr>`;
  }
}

function updateSummaryStats(bookings) {
  const total = bookings.length;
  const pending = bookings.filter((b) => b.status === "pending").length;
  const confirmed = bookings.filter((b) => b.status === "confirmed").length;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-pending").textContent = pending;
  document.getElementById("stat-confirmed").textContent = confirmed;
}

function renderBookingsTable() {
  const tbody = document.getElementById("bookings-tbody");
  const searchQuery = document.getElementById("search-input").value.toLowerCase().trim();
  const statusFilter = document.getElementById("status-filter").value;

  const filtered = allBookings.filter((booking) => {
    const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
    const matchesSearch =
      booking.reference.toLowerCase().includes(searchQuery) ||
      booking.name.toLowerCase().includes(searchQuery) ||
      booking.service_name.toLowerCase().includes(searchQuery) ||
      booking.contact.toLowerCase().includes(searchQuery);

    return matchesStatus && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="state-container">No bookings found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((b) => `
    <tr>
      <td><strong>${b.reference}</strong></td>
      <td>${b.service_name}</td>
      <td>
        <div><strong>${b.name}</strong></div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">${b.email}</div>
      </td>
      <td>${b.contact}</td>
      <td>${formatDate(b.booking_date)}<br><small style="color: var(--text-secondary);">${b.booking_time}</small></td>
      <td>${b.guests}</td>
      <td><span class="badge badge-${b.status}">${b.status}</span></td>
      <td>
        <div class="action-group">
          ${b.status !== "confirmed" ? `<button onclick="updateStatus('${b.id}', 'confirm')" class="btn btn-primary btn-xs">Confirm</button>` : ""}
          ${b.status !== "cancelled" ? `<button onclick="updateStatus('${b.id}', 'cancel')" class="btn btn-secondary btn-xs">Cancel</button>` : ""}
          <button onclick="deleteBooking('${b.id}', '${b.reference}')" class="btn btn-danger btn-xs">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function updateStatus(id, action) {
  hideBanner();
  try {
    const response = await fetch(`/api/admin/bookings/${id}/${action}`, {
      method: "PATCH",
      credentials: "same-origin"
    });

    if (response.status === 401) {
      window.location.href = "/admin/index.html";
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Failed to ${action} booking.`);

    showBanner(`Booking status successfully updated to ${action}ed!`, "success");
    await fetchBookings();
  } catch (error) {
    showBanner(error.message, "error");
  }
}

async function deleteBooking(id, reference) {
  if (!confirm(`Are you sure you want to permanently delete booking ${reference}?`)) {
    return;
  }

  hideBanner();
  try {
    const response = await fetch(`/api/admin/bookings/${id}`, {
      method: "DELETE",
      credentials: "same-origin"
    });

    if (response.status === 401) {
      window.location.href = "/admin/index.html";
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete booking.");

    showBanner(`Booking ${reference} has been deleted.`, "success");
    await fetchBookings();
  } catch (error) {
    showBanner(error.message, "error");
  }
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } catch (error) {
    console.error("Logout error:", error.message);
  } finally {
    window.location.href = "/admin/index.html";
  }
});

document.getElementById("search-input").addEventListener("input", renderBookingsTable);
document.getElementById("status-filter").addEventListener("change", renderBookingsTable);

document.addEventListener("DOMContentLoaded", fetchBookings);