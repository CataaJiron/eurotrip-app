import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC5_UCzONGpJ09sqEqwG-g-nTjvczhgvw4",
  authDomain: "planner-viajes.firebaseapp.com",
  databaseURL: "https://planner-viajes-default-rtdb.firebaseio.com",
  projectId: "planner-viajes",
  storageBucket: "planner-viajes.firebasestorage.app",
  messagingSenderId: "549091766875",
  appId: "1:549091766875:web:57b615f32216e02c45c57e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const DB_KEY = "eurotrip-v1";

export async function saveToFirebase(data) {
  try {
    await set(ref(db, DB_KEY), { ...data, lastSaved: Date.now() });
    return true;
  } catch (e) {
    return false;
  }
}

export function subscribeToFirebase(callback) {
  const dbRef = ref(db, DB_KEY);
  const unsub = onValue(dbRef, (snapshot) => {
    const val = snapshot.val();
    if (val) callback(val);
  });
  return unsub;
}
