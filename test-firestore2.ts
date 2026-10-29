import { initializeApp } from "firebase/app";
import { getFirestore, getDoc, doc } from "firebase/firestore";
import fs from "fs";

const configStr = fs.readFileSync("firebase-applet-config.json", "utf8");
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

function normalizeEmailToDocId(email: string): string {
  if (!email) return "anonymous_user";
  return email.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

async function test(email: string) {
  const cleanEmail = email.toLowerCase().trim();
  const docId = normalizeEmailToDocId(email);
  console.log("Checking email:", cleanEmail, "docId:", docId);
  try {
    let snap = await getDoc(doc(db, "users", docId));
    if (snap.exists()) {
      console.log("Found by docId:", snap.data().email);
      return;
    }
    snap = await getDoc(doc(db, "users", cleanEmail));
    if (snap.exists()) {
      console.log("Found by cleanEmail:", snap.data().email);
      return;
    }
    console.log("Not found in Firestore!");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
test("altemu11@icloud.com");
