import OpenAI from "openai";
import { CHATGPT_API_KEY } from "./config";
import { SYSTEM_PROMPT } from "./prompt";
import { getHistory, addToHistory } from "./history";
import { toolDefinitions, executeTool } from "./tools";

const openai = new OpenAI({ apiKey: CHATGPT_API_KEY });

const MAX_TOOL_ROUNDS = 10; // max agentic loop iterations

export async function runAgent(
  conversationId: string,
  userMessage: string,
  groupId?: string
): Promise<string> {
  addToHistory(conversationId, "user", userMessage);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...getHistory(conversationId),
  ];

  // Inject group ID as a separate system hint so GPT always has it available
  if (groupId) {
    messages.push({
      role: "system",
      content: `CONTEXT: The current group ID is "${groupId}". Use this for all tool calls that require a groupId parameter.`,
    });
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: toolDefinitions,
        temperature: 0.7,
        max_tokens: 1200,
      });

      const choice = response.choices[0];
      const msg = choice.message;

      // If the model wants to call tools, execute them and loop
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Add assistant message with tool calls to context
        messages.push(msg as any);

        for (const toolCall of msg.tool_calls) {
          if (toolCall.type !== "function") continue;
          console.log(`Tool call: ${toolCall.function.name}(${toolCall.function.arguments})`);
          let result: string;
          try {
            result = await executeTool(
              toolCall.function.name,
              toolCall.function.arguments,
              groupId
            );
          } catch (toolErr) {
            const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
            console.error(`Tool "${toolCall.function.name}" failed:`, errMsg);
            result = JSON.stringify({ error: `Tool failed: ${errMsg}` });
          }
          console.log(`Tool result: ${result.slice(0, 200)}`);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
        continue; // Loop back to get next GPT response
      }

      // No tool calls — we have a final text response
      const reply = msg.content ?? "Hmm, I got nothing. Try again?";
      addToHistory(conversationId, "assistant", reply);
      return reply;
    }

    // Exceeded max rounds
    const fallback = "I got a bit carried away with calculations there. Here's what I found so far - could you try asking again?";
    addToHistory(conversationId, "assistant", fallback);
    return fallback;
  } catch (err) {
    console.error("Agent error:", err instanceof Error ? err.message : err);
    return "My brain glitched for a sec - try again?";
  }
}
