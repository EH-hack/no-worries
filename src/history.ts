import OpenAI from "openai";
import { MAX_HISTORY } from "./config";

const conversationHistory = new Map<string, OpenAI.ChatCompletionMessageParam[]>();

export function getHistory(conversationId: string): OpenAI.ChatCompletionMessageParam[] {
  if (!conversationHistory.has(conversationId)) {
    conversationHistory.set(conversationId, []);
  }
  return conversationHistory.get(conversationId)!;
}

export function addToHistory(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): void {
  const history = getHistory(conversationId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function clearHistory(conversationId: string): void {
  conversationHistory.delete(conversationId);
}
