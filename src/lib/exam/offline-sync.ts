/**
 * P1 — Offline-first autosave + event queue (client-only).
 *
 * Nguyên tắc đã chốt:
 * - Đáp án: lưu localStorage TRƯỚC khi gọi API; đánh dấu dirty nếu gửi lỗi,
 *   retry backoff khi có mạng. Trước khi submit phải flush hết dirty.
 * - Submit: LUÔN realtime, không đưa vào queue.
 * - Event/violation log: gửi realtime ngay khi phát sinh; chỉ khi thất bại mới
 *   vào queue, sync lại theo FIFO kèm seq tăng dần để server nhận đúng thứ tự.
 */

export type SaveState = "saved" | "saving" | "offline";

type StoredAnswer = { selected: number[]; dirty: boolean; updated_at: number };
type StoredEvent = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  client_time: string;
};

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage đầy/không khả dụng — degrade về hành vi online-only.
  }
}

export class OfflineSync {
  private answersKey: string;
  private eventsKey: string;
  private seqKey: string;
  private answers: Record<string, StoredAnswer> = {};
  private events: StoredEvent[] = [];
  private stateListeners: ((s: SaveState) => void)[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_BASE_MS;
  private flushing = false;
  private eventFlushing = false;
  private destroyed = false;
  private onOnline = () => {
    this.retryDelay = RETRY_BASE_MS;
    void this.flushAll();
  };

  constructor(sessionKey: string) {
    this.answersKey = `exam_answers_${sessionKey}`;
    this.eventsKey = `exam_events_${sessionKey}`;
    this.seqKey = `exam_seq_${sessionKey}`;
    try {
      this.answers = JSON.parse(safeGet(this.answersKey) ?? "{}");
    } catch {
      this.answers = {};
    }
    try {
      this.events = JSON.parse(safeGet(this.eventsKey) ?? "[]");
    } catch {
      this.events = [];
    }
    window.addEventListener("online", this.onOnline);
  }

  destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    window.removeEventListener("online", this.onOnline);
  }

  onState(cb: (s: SaveState) => void) {
    this.stateListeners.push(cb);
  }

  private emit(s: SaveState) {
    this.stateListeners.forEach((cb) => cb(s));
  }

  private persistAnswers() {
    safeSet(this.answersKey, JSON.stringify(this.answers));
  }
  private persistEvents() {
    safeSet(this.eventsKey, JSON.stringify(this.events));
  }

  private nextSeq(): number {
    const n = Number(safeGet(this.seqKey) ?? "0") + 1;
    safeSet(this.seqKey, String(n));
    return n;
  }

  /** Đáp án dirty còn tồn từ phiên trước (mất mạng rồi thoát) — cần gửi bù. */
  getDirtyAnswers(): { question_id: string; selected_options: number[] }[] {
    return Object.entries(this.answers)
      .filter(([, a]) => a.dirty)
      .map(([question_id, a]) => ({ question_id, selected_options: a.selected }));
  }

  hasDirty(): boolean {
    return Object.values(this.answers).some((a) => a.dirty) || this.events.length > 0;
  }

  /** Lưu local trước → gửi API → clear dirty nếu thành công. */
  async saveAnswer(questionId: string, selected: number[]): Promise<boolean> {
    this.answers[questionId] = { selected, dirty: true, updated_at: Date.now() };
    this.persistAnswers();
    this.emit("saving");
    const ok = await this.sendAnswer(questionId, selected);
    if (ok) {
      const cur = this.answers[questionId];
      // Chỉ clear dirty nếu không có lần chọn mới hơn trong lúc đang gửi.
      if (cur && cur.selected === selected) {
        cur.dirty = false;
        this.persistAnswers();
      }
      if (!this.hasDirty()) this.emit("saved");
      this.retryDelay = RETRY_BASE_MS;
      return true;
    }
    this.emit("offline");
    this.scheduleRetry();
    return false;
  }

  private async sendAnswer(questionId: string, selected: number[]): Promise<boolean> {
    try {
      const res = await fetch("/api/exam/answer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, selected_options: selected }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Log event: thử realtime trước; lỗi → enqueue FIFO với seq.
   * Không bao giờ throw, không chặn UI.
   */
  logEvent(type: string, payload: Record<string, unknown> = {}) {
    const event: StoredEvent = {
      seq: this.nextSeq(),
      type,
      payload,
      client_time: new Date().toISOString(),
    };
    void this.sendEvent(event).then((ok) => {
      if (!ok) {
        this.events.push(event);
        this.persistEvents();
        this.scheduleRetry();
      }
    });
  }

  private async sendEvent(e: StoredEvent): Promise<boolean> {
    try {
      const res = await fetch("/api/exam/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: e.type,
          payload: { ...e.payload, client_seq: e.seq },
          client_time: e.client_time,
        }),
        keepalive: true,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Gửi lại queue event theo đúng thứ tự seq (FIFO, dừng ở event lỗi đầu tiên). */
  private async flushEvents(): Promise<boolean> {
    if (this.eventFlushing) return true;
    this.eventFlushing = true;
    try {
      this.events.sort((a, b) => a.seq - b.seq);
      while (this.events.length > 0) {
        const ok = await this.sendEvent(this.events[0]);
        if (!ok) return false;
        this.events.shift();
        this.persistEvents();
      }
      return true;
    } finally {
      this.eventFlushing = false;
    }
  }

  /** Flush toàn bộ dirty answers + event queue. Trả về true nếu sạch hoàn toàn. */
  async flushAll(): Promise<boolean> {
    if (this.flushing || this.destroyed) return !this.hasDirty();
    this.flushing = true;
    this.emit("saving");
    try {
      let allOk = true;
      for (const { question_id, selected_options } of this.getDirtyAnswers()) {
        const ok = await this.sendAnswer(question_id, selected_options);
        if (ok) {
          const cur = this.answers[question_id];
          if (cur) cur.dirty = false;
        } else {
          allOk = false;
          break;
        }
      }
      this.persistAnswers();
      if (allOk) allOk = await this.flushEvents();
      if (allOk && !this.hasDirty()) {
        this.emit("saved");
        this.retryDelay = RETRY_BASE_MS;
        return true;
      }
      this.emit("offline");
      this.scheduleRetry();
      return false;
    } finally {
      this.flushing = false;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer || this.destroyed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
      void this.flushAll();
    }, this.retryDelay);
  }

  /** Dọn dữ liệu local sau khi nộp bài thành công. */
  clear() {
    try {
      localStorage.removeItem(this.answersKey);
      localStorage.removeItem(this.eventsKey);
      localStorage.removeItem(this.seqKey);
    } catch {
      // ignore
    }
  }
}
