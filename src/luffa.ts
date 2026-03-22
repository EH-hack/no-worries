import axios from "axios";
import { SECRET, BASE_URL } from "./config";

export interface AtMention {
  name: string;
  did: string;       // the user's UID
  length: number;
  location: number;
}

export interface RawMessage {
  uid: string;
  atList: AtMention[];
  text: string;
  urlLink: string | null;
  msgId: string;
  type?: string | number; // "2" = system message (join/leave)
}

export interface GroupRawMessage extends RawMessage {
  uid: string;
}

export interface ReceiveItem {
  uid: string;
  count: number;
  message: string[];
  type: 0 | 1;
}

let pollCount = 0;

export async function testConnection(): Promise<void> {
  try {
    console.log(`Testing Luffa API connection to ${BASE_URL}/receive ...`);
    console.log(`Secret prefix: ${SECRET.slice(0, 8)}...`);
    const res = await axios.post(
      `${BASE_URL}/receive`,
      { secret: SECRET },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log(`Luffa API test: status=${res.status} isArray=${Array.isArray(res.data)} data=${JSON.stringify(res.data).slice(0, 200)}`);
  } catch (err: any) {
    console.error(`Luffa API test FAILED:`, err.response?.status, err.response?.data ?? err.message);
  }
}

export async function fetchMessages(): Promise<ReceiveItem[]> {
  const res = await axios.post<ReceiveItem[]>(
    `${BASE_URL}/receive`,
    { secret: SECRET },
    { headers: { "Content-Type": "application/json" } }
  );
  if (!Array.isArray(res.data)) {
    pollCount++;
    console.error(`Poll #${pollCount} - Luffa API returned non-array (status ${res.status}):`, JSON.stringify(res.data));
    return [];
  }
  const items: ReceiveItem[] = res.data;
  pollCount++;
  if (pollCount % 30 === 1 || items.length > 0) {
    console.log(`Poll #${pollCount} - items: ${items.length}`, items.length > 0 ? JSON.stringify(res.data) : "");
  }
  return items;
}

export async function sendDM(uid: string, text: string): Promise<void> {
  console.log(`DM -> ${uid}: ${text.slice(0, 80)}...`);
  await axios.post(
    `${BASE_URL}/send`,
    { secret: SECRET, uid, msg: JSON.stringify({ text }) },
    { headers: { "Content-Type": "application/json" } }
  );
}

export async function sendGroup(groupId: string, text: string): Promise<void> {
  console.log(`Group -> ${groupId}: ${text.slice(0, 80)}...`);
  await axios.post(
    `${BASE_URL}/sendGroup`,
    { secret: SECRET, uid: groupId, msg: JSON.stringify({ text }), type: "1" },
    { headers: { "Content-Type": "application/json" } }
  );
}

export async function sendGroupWithLink(
  groupId: string,
  text: string,
  url: string
): Promise<void> {
  console.log(`Group link -> ${groupId}: ${text.slice(0, 80)}... url=${url}`);
  await axios.post(
    `${BASE_URL}/sendGroup`,
    { secret: SECRET, uid: groupId, msg: JSON.stringify({ text, urlLink: url }), type: "1" },
    { headers: { "Content-Type": "application/json" } }
  );
}

export async function sendGroupWithButton(
  groupId: string,
  text: string,
  buttons: Array<{ name: string; selector: string }>
): Promise<void> {
  console.log(`Group button -> ${groupId}: ${text.slice(0, 80)}...`);
  const msg = JSON.stringify({
    text,
    button: buttons.map((b) => ({ ...b, isHidden: "0" })),
    dismissType: "select",
  });
  await axios.post(
    `${BASE_URL}/sendGroup`,
    { secret: SECRET, uid: groupId, msg, type: "2" },
    { headers: { "Content-Type": "application/json" } }
  );
}
