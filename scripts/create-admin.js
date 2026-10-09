require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

async function createAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!supabaseUrl) {
    console.error("Error: Missing SUPABASE_URL in environment variables.");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error("Error: Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.");
    process.exit(1);
  }
  if (!username) {
    console.error("Error: Missing ADMIN_USERNAME in environment variables.");
    process.exit(1);
  }
  if (!password) {
    console.error("Error: Missing ADMIN_PASSWORD in environment variables.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: existingUser, error: fetchError } = await supabase
      .from("admins")
      .select("username")
      .eq("username", username)
      .maybeSingle();

    if (fetchError) {
      console.error("Error checking existing admin:", fetchError.message);
      process.exit(1);
    }

    if (existingUser) {
      console.log(`Admin user "${username}" already exists in the database.`);
      process.exit(0);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { error: insertError } = await supabase
      .from("admins")
      .insert([
        {
          username: username,
          password_hash: passwordHash
        }
      ]);

    if (insertError) {
      console.error("Failed to insert admin record:", insertError.message);
      process.exit(1);
    }

    console.log(`Admin account successfully created for username: "${username}"`);
    process.exit(0);
  } catch (error) {
    console.error("Unexpected error during admin creation:", error.message);
    process.exit(1);
  }
}

createAdmin();