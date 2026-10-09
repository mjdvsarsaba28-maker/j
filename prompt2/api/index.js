require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const supabase = require("./supabase");

const app = express();

app.use(express.json());
app.use(cookieParser());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, "../public")));

// JWT Authentication Middleware for Admin Routes
const authenticateAdmin = (req, res, next) => {
  const token = req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
};

// Helper: Generate Unique Reference Number (e.g., BK12A34B)
const generateReference = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return `BK${randomPart}`;
};

// -----------------------------------------------------------------------------
// PUBLIC ROUTES
// -----------------------------------------------------------------------------

// GET /api/services - Retrieve active services ordered by name
app.get("/api/services", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching services:", error.message);
      return res.status(500).json({ error: "Failed to retrieve services" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Unexpected error in GET /api/services:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/bookings - Submit a new booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { service_id, name, contact, email, booking_date, booking_time, guests, notes } = req.body;

    if (!service_id || !name || !contact || !email || !booking_date || !booking_time) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    // Validate booking date (no past dates)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(booking_date);
    if (isNaN(selectedDate.getTime()) || selectedDate < today) {
      return res.status(400).json({ error: "Booking date cannot be in the past" });
    }

    // Validate booking time (between 07:00 and 17:00)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
    if (!timeRegex.test(booking_time)) {
      return res.status(400).json({ error: "Invalid booking time format" });
    }

    const [hours, minutes] = booking_time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    const minMinutes = 7 * 60; // 07:00
    const maxMinutes = 17 * 60; // 17:00

    if (totalMinutes < minMinutes || totalMinutes > maxMinutes) {
      return res.status(400).json({ error: "Booking time must be between 07:00 and 17:00" });
    }

    // Validate guests (at least 1)
    const parsedGuests = parseInt(guests, 10);
    if (isNaN(parsedGuests) || parsedGuests < 1) {
      return res.status(400).json({ error: "Guests count must be at least 1" });
    }

    // Generate unique reference
    let reference = generateReference();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      const { data: existing } = await supabase
        .from("bookings")
        .select("reference")
        .eq("reference", reference)
        .maybeSingle();

      if (!existing) {
        isUnique = true;
      } else {
        reference = generateReference();
        attempts++;
      }
    }

    if (!isUnique) {
      return res.status(500).json({ error: "Failed to generate unique reference number. Please try again." });
    }

    // Insert booking with default status "pending"
    const { data, error } = await supabase
      .from("bookings")
      .insert([
        {
          reference: reference,
          service_id: service_id,
          name: name.trim(),
          contact: contact.trim(),
          email: email.trim(),
          booking_date: booking_date,
          booking_time: booking_time,
          guests: parsedGuests,
          notes: notes ? notes.trim() : null,
          status: "pending"
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating booking:", error.message);
      return res.status(500).json({ error: "Failed to save booking" });
    }

    return res.status(201).json({
      message: "Booking submitted successfully",
      reference: data.reference
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/bookings:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bookings/:reference - Get booking details by reference number
app.get("/api/bookings/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .select("*, services(name, description, price)")
      .eq("reference", reference.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const responseData = {
      id: data.id,
      reference: data.reference,
      name: data.name,
      contact: data.contact,
      email: data.email,
      booking_date: data.booking_date,
      booking_time: data.booking_time,
      guests: data.guests,
      notes: data.notes,
      status: data.status,
      created_at: data.created_at,
      service_name: data.services ? data.services.name : "N/A",
      service_price: data.services ? data.services.price : 0
    };

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Unexpected error in GET /api/bookings/:reference:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------------------------------------------------------
// ADMIN ROUTES
// -----------------------------------------------------------------------------

// POST /api/admin/login - Authenticate admin and set httpOnly cookie
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("admin_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 24 * 60 * 60 * 1000 // 1 day in milliseconds
    });

    return res.status(200).json({ message: "Login successful", username: admin.username });
  } catch (error) {
    console.error("Unexpected error in POST /api/admin/login:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/logout - Clear admin cookie
app.post("/api/admin/logout", authenticateAdmin, (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return res.status(200).json({ message: "Logged out successfully" });
});

// GET /api/admin/bookings - Retrieve all bookings (newest first)
app.get("/api/admin/bookings", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, services(name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching admin bookings:", error.message);
      return res.status(500).json({ error: "Failed to retrieve bookings" });
    }

    const formattedBookings = data.map((b) => ({
      id: b.id,
      reference: b.reference,
      service_id: b.service_id,
      service_name: b.services ? b.services.name : "N/A",
      name: b.name,
      contact: b.contact,
      email: b.email,
      booking_date: b.booking_date,
      booking_time: b.booking_time,
      guests: b.guests,
      notes: b.notes,
      status: b.status,
      created_at: b.created_at
    }));

    return res.status(200).json(formattedBookings);
  } catch (error) {
    console.error("Unexpected error in GET /api/admin/bookings:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/bookings/:id/confirm - Confirm a booking
app.patch("/api/admin/bookings/:id/confirm", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error confirming booking:", error ? error.message : "Not found");
      return res.status(404).json({ error: "Booking not found or update failed" });
    }

    return res.status(200).json({ message: "Booking confirmed successfully", booking: data });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/admin/bookings/:id/confirm:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/bookings/:id/cancel - Cancel a booking
app.patch("/api/admin/bookings/:id/cancel", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Error cancelling booking:", error ? error.message : "Not found");
      return res.status(404).json({ error: "Booking not found or update failed" });
    }

    return res.status(200).json({ message: "Booking cancelled successfully", booking: data });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/admin/bookings/:id/cancel:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/bookings/:id - Delete a booking
app.delete("/api/admin/bookings/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting booking:", error.message);
      return res.status(500).json({ error: "Failed to delete booking" });
    }

    return res.status(200).json({ message: "Booking deleted successfully" });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/admin/bookings/:id:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Export Express app for Vercel Serverless Function
module.exports = app;

// Local development listener
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}