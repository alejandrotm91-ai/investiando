import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection } from "firebase/firestore";
import fs from "fs";

const configStr = fs.readFileSync("firebase-applet-config.json", "utf8");
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function test() {
  console.log("Fetching users...");
  try {
    const snap = await getDocs(collection(db, "users"));
    console.log("Users count:", snap.docs.length);
    snap.forEach(d => console.log(d.id, d.data().email));
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
test();
