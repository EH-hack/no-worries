import * as fs from "fs";
import * as path from "path";
import { AppState, newAppState } from "./billing/types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

let state: AppState | null = null;
let writeLock = false;

export function getState(): AppState {
  if (state) return state;

  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      state = JSON.parse(raw) as AppState;
    } else {
      state = newAppState();
    }
  } catch (err) {
    console.error("Failed to load state, starting fresh:", err);
    state = newAppState();
  }

  return state;
}

export async function saveState(): Promise<void> {
  if (writeLock) {
    // Simple retry — good enough for hackathon
    await new Promise((r) => setTimeout(r, 50));
    return saveState();
  }

  writeLock = true;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(getState(), null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } finally {
    writeLock = false;
  }
}
