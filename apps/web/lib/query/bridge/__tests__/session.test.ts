import { describe, it, expect, beforeEach } from "vitest";
import { createTestQueryClient } from "@/test-utils/render-with-query";
import { registerSessionBridge } from "../session";
import { qk } from "@/lib/query/keys";
import type { MessagesData, TurnsData, TaskPlanData } from "@/lib/query/query-options/session";

// ---------------------------------------------------------------------------
// Fake WebSocket client
// ---------------------------------------------------------------------------
type Handler = (message: { payload: Record<string, unknown>; timestamp?: string }) => void;

function makeFakeWs() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(event: string, handler: Handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => set?.delete(handler);
    },
    emit(event: string, payload: Record<string, unknown>, timestamp?: string) {
      const set = handlers.get(event);
      if (!set) return;
      for (const h of set) h({ payload, timestamp });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("session bridge", () => {
  let ws: ReturnType<typeof makeFakeWs>;
  let qc: ReturnType<typeof createTestQueryClient>;
  let cleanup: () => void;

  beforeEach(() => {
    ws = makeFakeWs();
    qc = createTestQueryClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanup = registerSessionBridge(ws as any, qc);
  });

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  it("seeds message cache on first session.message.added", () => {
    ws.emit("session.message.added", {
      message_id: "msg-1",
      session_id: "sess-1",
      task_id: "task-1",
      author_type: "user",
      content: "hello",
      type: "message",
      created_at: "2024-01-01T00:00:00Z",
    });

    const data = qc.getQueryData<MessagesData>(qk.session.messages("sess-1"));
    expect(data?.messages).toHaveLength(1);
    expect(data?.messages[0].id).toBe("msg-1");
    expect(data?.messages[0].content).toBe("hello");
  });

  it("deduplicates messages by id on session.message.added", () => {
    // Seed initial message
    ws.emit("session.message.added", {
      message_id: "msg-dup",
      session_id: "sess-2",
      task_id: "task-2",
      author_type: "agent",
      content: "first",
      type: "message",
      created_at: "2024-01-01T00:00:00Z",
    });

    // Same ID again (e.g., duplicate WS event)
    ws.emit("session.message.added", {
      message_id: "msg-dup",
      session_id: "sess-2",
      task_id: "task-2",
      author_type: "agent",
      content: "updated content",
      type: "message",
      created_at: "2024-01-01T00:00:01Z",
    });

    const data = qc.getQueryData<MessagesData>(qk.session.messages("sess-2"));
    // Should have only one entry, merged with updated content
    expect(data?.messages).toHaveLength(1);
    expect(data?.messages[0].content).toBe("updated content");
  });

  it("updates existing message on session.message.updated", () => {
    // Seed a message first
    ws.emit("session.message.added", {
      message_id: "msg-upd",
      session_id: "sess-3",
      task_id: "task-3",
      author_type: "agent",
      content: "original",
      type: "tool_call",
      created_at: "2024-01-01T00:00:00Z",
    });

    // Update it
    ws.emit("session.message.updated", {
      message_id: "msg-upd",
      session_id: "sess-3",
      task_id: "task-3",
      author_type: "agent",
      content: "original",
      type: "tool_call",
      metadata: { status: "complete" },
      created_at: "2024-01-01T00:00:00Z",
    });

    const data = qc.getQueryData<MessagesData>(qk.session.messages("sess-3"));
    expect(data?.messages[0].metadata).toMatchObject({ status: "complete" });
  });

  it("ignores message.updated when message not in cache", () => {
    // No prior message in cache
    ws.emit("session.message.updated", {
      message_id: "msg-ghost",
      session_id: "sess-4",
      task_id: "task-4",
      author_type: "agent",
      content: "ghost",
      type: "message",
      created_at: "2024-01-01T00:00:00Z",
    });

    // Should not create a new entry
    expect(qc.getQueryData(qk.session.messages("sess-4"))).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Turns
  // -------------------------------------------------------------------------

  it("adds turn on session.turn.started", () => {
    ws.emit("session.turn.started", {
      id: "turn-1",
      session_id: "sess-5",
      task_id: "task-5",
      started_at: "2024-01-01T00:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    const data = qc.getQueryData<TurnsData>(["session", "sess-5", "turns"]);
    expect(data?.turns).toHaveLength(1);
    expect(data?.activeTurnId).toBe("turn-1");
  });

  it("completes turn on session.turn.completed and clears activeTurnId", () => {
    // Seed turn first
    ws.emit("session.turn.started", {
      id: "turn-2",
      session_id: "sess-6",
      task_id: "task-6",
      started_at: "2024-01-01T00:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    ws.emit("session.turn.completed", {
      id: "turn-2",
      session_id: "sess-6",
      task_id: "task-6",
      completed_at: "2024-01-01T00:01:00Z",
    });

    const data = qc.getQueryData<TurnsData>(["session", "sess-6", "turns"]);
    expect(data?.activeTurnId).toBeNull();
    expect(data?.turns[0].completed_at).toBe("2024-01-01T00:01:00Z");
  });

  it("marks in-progress tool calls as complete on turn completion", () => {
    // Seed a tool_call message with non-terminal status
    const initialData: MessagesData = {
      messages: [
        {
          id: "msg-tool",
          session_id: "sess-7" as import("@/lib/types/http").SessionId,
          task_id: "task-7" as import("@/lib/types/http").TaskId,
          author_type: "agent",
          content: "calling tool",
          type: "tool_call",
          metadata: { tool_call_id: "tc-1", status: "running" },
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      hasMore: false,
      oldestCursor: "msg-tool",
    };
    qc.setQueryData(qk.session.messages("sess-7"), initialData);

    ws.emit("session.turn.completed", {
      id: "turn-3",
      session_id: "sess-7",
      task_id: "task-7",
      completed_at: "2024-01-01T00:01:00Z",
    });

    const data = qc.getQueryData<MessagesData>(qk.session.messages("sess-7"));
    expect((data?.messages[0].metadata as Record<string, unknown>)?.status).toBe("complete");
  });

  // -------------------------------------------------------------------------
  // Task plans
  // -------------------------------------------------------------------------

  it("stores task plan on task.plan.created", () => {
    ws.emit("task.plan.created", {
      id: "plan-1",
      task_id: "task-10",
      title: "My Plan",
      content: "# Plan\n",
      created_by: "agent",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    const data = qc.getQueryData<TaskPlanData>(["session", "plans", "task-10"]);
    expect(data?.plan?.title).toBe("My Plan");
  });

  it("updates task plan on task.plan.updated", () => {
    // Seed
    qc.setQueryData(["session", "plans", "task-11"] as const, {
      plan: { id: "plan-2", task_id: "task-11", title: "Old", content: "old", created_by: "agent", created_at: "t", updated_at: "t1" },
      lastSeenUpdatedAt: "t1",
    });

    ws.emit("task.plan.updated", {
      id: "plan-2",
      task_id: "task-11",
      title: "Updated",
      content: "new content",
      created_by: "agent",
      created_at: "t",
      updated_at: "t2",
    });

    const data = qc.getQueryData<TaskPlanData>(["session", "plans", "task-11"]);
    expect(data?.plan?.title).toBe("Updated");
  });

  it("nullifies plan on task.plan.deleted", () => {
    qc.setQueryData(["session", "plans", "task-12"] as const, {
      plan: { id: "plan-3", task_id: "task-12", title: "Plan", content: "x", created_by: "user", created_at: "t", updated_at: "t1" },
      lastSeenUpdatedAt: "t1",
    });

    ws.emit("task.plan.deleted", { task_id: "task-12" });

    const data = qc.getQueryData<TaskPlanData>(["session", "plans", "task-12"]);
    expect(data?.plan).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it("cleanup removes handlers", () => {
    cleanup();
    ws.emit("session.message.added", {
      message_id: "post-cleanup",
      session_id: "sess-99",
      task_id: "task-99",
      author_type: "user",
      content: "should not appear",
      type: "message",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(qc.getQueryData(qk.session.messages("sess-99"))).toBeUndefined();
  });
});
