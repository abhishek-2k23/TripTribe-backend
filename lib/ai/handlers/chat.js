// A chat reply. The user's message was saved when the request came in; this writes the answer.

import AiMessage from "../../../models/aiMessage.model.js";
import AiThread from "../../../models/aiThread.model.js";
import { callStructured } from "../client.js";
import { chatTripContext, loadTripSnapshot } from "../context.js";
import { JobFailure } from "../errors.js";
import { CHAT_PROMPT_V1 } from "../prompts.js";
import { CHAT_SCHEMA } from "../schemas.js";
import { loadJob } from "./shared.js";

const HISTORY_LIMIT = 20;

function toClaudeMessages(history, trip) {
  const turns = history
    .filter((message) => message.content?.trim())
    .map((message) => ({ role: message.role, content: message.content }));
  while (turns.length && turns[0].role !== "user") turns.shift();

  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") {
    throw new JobFailure("NOTHING_TO_ANSWER", "There's no new question to answer.");
  }

  // Trip context rides with the newest question, so the system prompt stays frozen and cacheable.
  const context = trip
    ? `<trip_context>\n${JSON.stringify(chatTripContext(trip))}\n</trip_context>`
    : "<trip_context>No trip is linked to this conversation.</trip_context>";
  turns[turns.length - 1] = {
    role: "user",
    content: [
      { type: "text", text: context },
      { type: "text", text: last.content },
    ],
  };
  return turns;
}

export async function chatHandler({ jobId, step, runStep }) {
  const job = await loadJob(step, jobId);

  const messages = await runStep("context", async () => {
    const [history, trip] = await Promise.all([
      AiMessage.find({ thread: job.thread }).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).lean(),
      job.trip ? loadTripSnapshot(job.trip) : null,
    ]);
    return { value: toClaudeMessages(history.reverse(), trip) };
  });

  const reply = await runStep("reply", async () => {
    const { data, usage } = await callStructured({
      step: "chat",
      system: CHAT_PROMPT_V1,
      messages,
      schema: CHAT_SCHEMA,
    });
    return { value: data, usage: [usage] };
  });

  const suggestions = (reply.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3);

  const messageId = await step.run("save-reply", async () => {
    const message = await AiMessage.create({
      thread: job.thread,
      user: job.user,
      role: "assistant",
      content: reply.reply,
      suggestions,
      job: jobId,
    });
    await AiThread.updateOne({ _id: job.thread }, { $set: { lastMessageAt: message.createdAt } });
    return String(message._id);
  });

  return { threadId: job.thread, messageId, reply: reply.reply, suggestions };
}
