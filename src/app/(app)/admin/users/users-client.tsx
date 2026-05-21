"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Search, MoreVertical, KeyRound, UserX, UserCheck, Loader2, Copy, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserForm } from "@/components/admin/user-form";
import { RoleBadge } from "@/components/admin/role-badge";
import { setUserActive, sendPasswordResetForUser, type UserView } from "@/lib/utils/admin-actions";
import { formatDate } from "@/lib/utils/format";

export function UsersClient({
  initial, canManage, currentUid,
}: { initial: UserView[]; canManage: boolean; currentUid: string }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [resetLink, setResetLink] = useState<{ link: string; email: string } | null>(null);
  const [working, startWork] = useTransition();

  const filtered = initial.filter((u) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(s) ||
      (u.displayName?.toLowerCase().includes(s) ?? false) ||
      u.role.toLowerCase().includes(s) ||
      (u.supplierName?.toLowerCase().includes(s) ?? false)
    );
  });

  function toggle(uid: string, currentActive: boolean) {
    if (!confirm(currentActive ? "Deactivate this user? They won't be able to sign in." : "Reactivate this user?")) return;
    startWork(async () => {
      try {
        await setUserActive(uid, !currentActive);
        toast.success(currentActive ? "User deactivated" : "User reactivated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed.");
      }
    });
  }

  function resetPassword(uid: string, email: string) {
    startWork(async () => {
      try {
        const res = await sendPasswordResetForUser(uid);
        setResetLink({ link: res.link, email });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to generate link.");
      }
    });
  }

  function copyLink() {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink.link).then(() => toast.success("Copied to clipboard."));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Users</h1>
          <p className="mt-1 text-muted-foreground">
            {initial.length} user{initial.length === 1 ? "" : "s"} in the system.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add user
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email, name, role, or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {initial.length === 0 ? "No users yet." : "No users match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const isMe = u.uid === currentUid;
                  return (
                    <TableRow key={u.uid}>
                      <TableCell className="font-medium">
                        {u.displayName || <span className="text-muted-foreground">—</span>}
                        {isMe && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell><RoleBadge role={u.role} /></TableCell>
                      <TableCell className="text-sm">
                        {u.supplierName ? <span className="truncate">{u.supplierName}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.active ? "success" : "secondary"}>
                          {u.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                      {canManage && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => resetPassword(u.uid, u.email)} disabled={working}>
                                <KeyRound className="mr-2 h-3.5 w-3.5" /> Generate password reset
                              </DropdownMenuItem>
                              {!isMe && (
                                <DropdownMenuItem onClick={() => toggle(u.uid, u.active)} disabled={working}>
                                  {u.active ? <UserX className="mr-2 h-3.5 w-3.5" /> : <UserCheck className="mr-2 h-3.5 w-3.5" />}
                                  {u.active ? "Deactivate" : "Reactivate"}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create a Firebase Auth user and link them to a role. They'll receive a one-time setup link.
            </DialogDescription>
          </DialogHeader>
          <UserForm
            onCreated={() => { setCreateOpen(false); router.refresh(); }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={resetLink !== null} onOpenChange={(o) => !o && setResetLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset link</DialogTitle>
            <DialogDescription>
              Send the link below to <strong>{resetLink?.email}</strong>. It allows them to set a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={resetLink?.link ?? ""} readOnly className="font-mono text-xs" />
            <Button variant="outline" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setResetLink(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
