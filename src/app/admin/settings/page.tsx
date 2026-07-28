"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type ConfigEntry = { value: unknown; source: "exam" | "term" | "system" | "default" };
type ConfigMap = Record<string, ConfigEntry>;

const SOURCE_LABEL: Record<ConfigEntry["source"], string> = {
  exam: "override tại đề",
  term: "kế thừa từ khóa thi",
  system: "cấu hình hệ thống",
  default: "mặc định",
};

/**
 * P7 — Cài đặt hệ thống (settings cascade, tầng system).
 * Tầng exam override trong tab Check-in/Cấu hình của từng đề.
 */
export default function AdminSettingsPage() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [rulesText, setRulesText] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  const [savedRules, setSavedRules] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((json) => setConfig(json.config ?? {}));
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((json) => setRulesText(json.settings?.rules_text ?? ""))
      .catch(() => {});
  }, []);

  async function saveConfig(key: string, value: unknown) {
    setSavingKey(key);
    setConfig((c) => (c ? { ...c, [key]: { value, source: "system" } } : c)); // optimistic
    try {
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, scope: "system" }),
      });
    } finally {
      setSavingKey(null);
    }
  }

  async function saveRules() {
    setSavingRules(true);
    setSavedRules(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules_text: rulesText }),
      });
      if (res.ok) setSavedRules(true);
    } finally {
      setSavingRules(false);
    }
  }

  const entry = (key: string) => config?.[key];
  const sourceBadge = (key: string) => (
    <Badge variant="outline" className="ml-2 text-xs font-normal">
      {SOURCE_LABEL[entry(key)?.source ?? "default"]}
    </Badge>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Cài đặt
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cấu hình phân tầng: Hệ thống → Khóa thi → Đề thi. Giá trị ở đây là mặc định toàn
          hệ thống; từng đề có thể override (VD bật check-in trong tab Check-in của đề).
        </p>
      </div>

      {config === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full animate-shimmer" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Giám sát & chống gian lận</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-sm">
                  Silent detection (fingerprint, đa thiết bị, IP)
                  {sourceBadge("silent_detection_enabled")}
                </span>
                <Checkbox
                  checked={entry("silent_detection_enabled")?.value === true}
                  disabled={savingKey === "silent_detection_enabled"}
                  onCheckedChange={(v) => saveConfig("silent_detection_enabled", v === true)}
                />
              </label>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-sm">
                  Check-in QR khi rời phòng (mặc định cho mọi đề)
                  {sourceBadge("exit_checkin_enabled")}
                </span>
                <Checkbox
                  checked={entry("exit_checkin_enabled")?.value === true}
                  disabled={savingKey === "exit_checkin_enabled"}
                  onCheckedChange={(v) => saveConfig("exit_checkin_enabled", v === true)}
                />
              </label>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  Chu kỳ đổi mã QR (giây)
                  {sourceBadge("checkin_token_rotate_seconds")}
                </span>
                <Input
                  type="number"
                  min={15}
                  max={300}
                  className="w-24"
                  defaultValue={Number(entry("checkin_token_rotate_seconds")?.value ?? 45)}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 15 && v <= 300) saveConfig("checkin_token_rotate_seconds", v);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kết quả & hiển thị</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-sm">
                  Công khai leaderboard cho thí sinh trong portal
                  {sourceBadge("leaderboard_public")}
                </span>
                <Checkbox
                  checked={entry("leaderboard_public")?.value === true}
                  disabled={savingKey === "leaderboard_public"}
                  onCheckedChange={(v) => saveConfig("leaderboard_public", v === true)}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nội dung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  Tên đơn vị tổ chức
                  {sourceBadge("organizer_name")}
                </span>
                <Input
                  className="w-64"
                  defaultValue={String(entry("organizer_name")?.value ?? "")}
                  placeholder="Ban tổ chức"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v) saveConfig("organizer_name", v);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quy chế dự thi (trang /landing)</CardTitle>
          <CardDescription>
            Mỗi dòng hiển thị nguyên văn. Để trống nếu muốn dùng danh sách quy chế mặc định.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={10}
            placeholder="Để trống sẽ dùng nội dung mặc định (không chuyển tab, không thoát fullscreen...)"
            className="font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <Button onClick={saveRules} disabled={savingRules}>
              {savingRules ? "Đang lưu…" : "Lưu quy chế"}
            </Button>
            {savedRules && <span className="text-sm text-emerald-600">✓ Đã lưu</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
