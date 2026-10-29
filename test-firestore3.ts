import { initializeApp } from "firebase/app";
import { getFirestore, setDoc, doc } from "firebase/firestore";
import fs from "fs";

const configStr = fs.readFileSync("firebase-applet-config.json", "utf8");
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function test() {
  console.log("Writing test user...");
  try {
    await setDoc(doc(db, "users", "test_quota_check"), {
      email: "test@test.com",
      timestamp: new Date().toISOString()
    });
    console.log("Write successful!");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
test();
