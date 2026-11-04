// Seeds 10 demo patients + appointments for one CRM user. Rows are tagged "[demo-seed]" so --cleanup can remove them.
// Usage (from repo root, credentials via env, never hardcoded):
//   SEED_EMAIL=... SEED_PASSWORD=... node --env-file=.env scripts/seed-demo-patients.mjs
//   SEED_EMAIL=... SEED_PASSWORD=... node --env-file=.env scripts/seed-demo-patients.mjs --cleanup
import { createClient } from "@supabase/supabase-js";

const TAG = "[demo-seed]";
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SEED_EMAIL: email, SEED_PASSWORD: password } = process.env;

if (!url || !anonKey || !email || !password) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SEED_EMAIL or SEED_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

const patients = [
  { name: "Aarav Mehta", phone: "9000000101", dob: "1988-03-14", source: "Walk-in" },
  { name: "Priya Nair", phone: "9000000102", dob: "1992-07-22", source: "Website" },
  { name: "Rohan Gupta", phone: "9000000103", dob: "1979-11-05", source: "Referral" },
  { name: "Sneha Iyer", phone: "9000000104", dob: "1995-01-30", source: "Campaign" },
  { name: "Vikram Singh", phone: "9000000105", dob: "1966-09-18", source: "Walk-in" },
  { name: "Ananya Das", phone: "9000000106", dob: "2001-05-09", source: "Website" },
  { name: "Karan Malhotra", phone: "9000000107", dob: "1984-12-27", source: "Referral" },
  { name: "Meera Reddy", phone: "9000000108", dob: "1973-04-02", source: "Walk-in" },
  { name: "Arjun Verma", phone: "9000000109", dob: "1998-08-16", source: "Campaign" },
  { name: "Divya Kapoor", phone: "9000000110", dob: "1990-10-11", source: "Website" },
];

const services = ["General Consultation", "Follow-up", "Physiotherapy", "Dental Checkup", "Diagnostic Review"];
const staff = ["Dr. Sharma", "Dr. Rao", "Dr. Khan"];
const reasons = ["Fever and cold", "Back pain", "Routine checkup", "Knee pain", "Blood test review", "Headache", "Skin allergy", "Shoulder stiffness", "Follow-up visit", "Dental cleaning"];
// day offset from today, status
const plan = [
  [-14, "completed"], [-10, "completed"], [-7, "completed"], [-5, "cancelled"], [-2, "completed"],
  [0, "booked"], [1, "booked"], [2, "tentative"], [4, "booked"], [7, "tentative"],
];

const pad = (value) => String(value).padStart(2, "0");
function isoDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) {
  console.error("Sign-in failed:", authError.message);
  process.exit(1);
}

const { data: client, error: clientError } = await supabase.from("clients").select("id").eq("crm_user_id", auth.user.id).maybeSingle();
if (clientError || !client?.id) {
  console.error("No client mapped to this user.", clientError?.message ?? "");
  process.exit(1);
}
const clientId = client.id;

if (process.argv.includes("--cleanup")) {
  const { error: apptError } = await supabase.from("appointments").delete().eq("client_id", clientId).like("remark", `${TAG}%`);
  const { error: custError } = await supabase.from("customers").delete().eq("client_id", clientId).eq("notes", TAG);
  if (apptError || custError) {
    console.error("Cleanup failed:", apptError?.message ?? custError?.message);
    process.exit(1);
  }
  console.log("Removed demo-seed appointments and patients.");
  process.exit(0);
}

const { data: existing, error: existingError } = await supabase.from("customers").select("id").eq("client_id", clientId).eq("notes", TAG).limit(1);
if (existingError) {
  console.error("Lookup failed:", existingError.message);
  process.exit(1);
}
if (existing?.length) {
  console.error("Demo data already present. Run with --cleanup first.");
  process.exit(1);
}

const customerRows = patients.map((patient) => ({
  client_id: clientId,
  name: patient.name,
  phone: patient.phone,
  email: `${patient.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
  dob: patient.dob,
  contact_source: patient.source,
  notes: TAG,
}));
const { error: insertCustomersError } = await supabase.from("customers").insert(customerRows);
if (insertCustomersError) {
  console.error("Patient insert failed:", insertCustomersError.message);
  process.exit(1);
}

const appointmentRows = customerRows.map((customer, index) => {
  const startHour = 9 + (index % 8);
  return {
    client_id: clientId,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    service: services[index % services.length],
    staff_name: staff[index % staff.length],
    location: "Main Clinic",
    date: isoDate(plan[index][0]),
    start_time: `${pad(startHour)}:00:00`,
    end_time: `${pad(startHour)}:30:00`,
    status: plan[index][1],
    remark: `${TAG} ${reasons[index]}`,
  };
});
const { error: insertAppointmentsError } = await supabase.from("appointments").insert(appointmentRows);
if (insertAppointmentsError) {
  console.error("Appointment insert failed (patients were already inserted; run --cleanup to undo):", insertAppointmentsError.message);
  process.exit(1);
}

console.log(`Inserted ${customerRows.length} patients and ${appointmentRows.length} appointments for client ${clientId}.`);
