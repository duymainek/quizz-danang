"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ShieldCheck, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSIONS,
  DEFAULT_SUPERVISOR_PERMISSIONS,
  type PermissionKey,
} from "@/lib/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Invite = {
  id: string;
  token: string;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
};
type RoleRow = { user_id: string; email: string; role: string; created_at: string };

export default function AccessPage() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"supervisor" | "admin">("supervisor");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [perms, setPerms] = useState<PermissionKey[] | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

  const loadPerms = useCallback(async () => {
    const res = await fetch("/api/admin/config");
    const json = await res.json();
    if (res.ok) {
      const v = json.config?.role_permissions?.value;
      setPerms(Array.isArray(v) ? v : DEFAULT_SUPERVISOR_PERMISSIONS);
    }
  }, []);

  async function savePerms(next: PermissionKey[]) {
    const prev = perms;
    setPerms(next); // optimistic
    setSavingPerms(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "role_permissions", value: next, scope: "system" }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Không lưu được phân quyền");
        setPerms(prev); // revert
      }
    } catch {
      alert("Mất kết nối — chưa lưu được phân quyền");
      setPerms(prev);
    } finally {
      setSavingPerms(false);
    }
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/invites");
    const json = await res.json();
    if (res.ok) {
      setInvites(json.invites);
      setRoles(json.roles);
    } else {
      setError(json.error);
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadPerms();
  }, [load, loadPerms]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setWorking(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Phân quyền & mời thành viên</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Mời giám sát viên / admin
          </CardTitle>
          <CardDescription>
            Link mời có hạn 7 ngày, dùng 1 lần. Giám sát viên chỉ xem/giám sát và các thao
            tác vận hành trong ngày thi — không sửa được đề, câu hỏi, cấu hình.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createInvite} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="giamthi@example.com"
                />
              </div>
              <div className="w-full sm:w-44 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Vai trò</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "supervisor" | "admin")}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="supervisor">Giám sát viên</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="w-full sm:w-auto space-y-1.5">
                <label className="hidden sm:block text-xs font-medium text-transparent select-none">
                  &nbsp;
                </label>
                <Button type="submit" disabled={working} className="w-full sm:w-auto">
                  {working ? "Đang tạo…" : "Tạo link mời"}
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Quyền của Giám sát viên
          </CardTitle>
          <CardDescription>
            Tick các tính năng giám sát viên được dùng — áp dụng ngay cho mọi tài khoản
            giám sát viên. Admin luôn có toàn quyền.
            {savingPerms && <span className="ml-2 text-xs">Đang lưu…</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perms === null ? (
            <Skeleton className="h-32 w-full animate-shimmer" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PERMISSIONS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-start gap-2.5 rounded-lg border p-3 text-sm cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    checked={perms.includes(p.key)}
                    onCheckedChange={(v) =>
                      savePerms(
                        v === true
                          ? [...perms, p.key]
                          : perms.filter((k) => k !== p.key)
                      )
                    }
                    className="mt-0.5"
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link mời</CardTitle>
        </CardHeader>
        <CardContent>
          {invites === null ? (
            <Skeleton className="h-24 w-full animate-shimmer" />
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có link mời nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((i) => {
                  const expired = new Date(i.expires_at) < new Date();
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{i.email}</TableCell>
                      <TableCell>
                        <Badge variant={i.role === "admin" ? "default" : "secondary"}>
                          {i.role === "admin" ? "Admin" : "Giám sát viên"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {i.used_at ? (
                          <Badge variant="outline">Đã dùng</Badge>
                        ) : expired ? (
                          <Badge variant="destructive">Hết hạn</Badge>
                        ) : (
                          <Badge variant="secondary">Chờ kích hoạt</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!i.used_at && !expired && (
                          <button
                            onClick={() => copyLink(i.token)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" />
                            {copied === i.token ? "Đã copy!" : "Copy link"}
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thành viên có quyền</CardTitle>
          <CardDescription>
            Tài khoản không có trong danh sách này mặc định là admin (tài khoản gốc).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có thành viên nào được mời qua hệ thống.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Tham gia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                        {r.role === "admin" ? "Admin" : "Giám sát viên"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("vi-VN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
