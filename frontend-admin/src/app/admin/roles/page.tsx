"use client";

import { useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

type RoleAssignment = { user: string; tenant?: string; role: string };

export default function RolesPage() {
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [draft, setDraft] = useState<RoleAssignment>({ user: "", tenant: "", role: "client" });

  const addAssignment = () => {
    if (!draft.user.trim()) return;
    setAssignments((prev) => [...prev, draft]);
    setDraft({ user: "", tenant: "", role: "client" });
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Roles</p>
          <h1 className="text-2xl font-semibold">Roles & permissions</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Assign role</CardTitle>
            <CardDescription>Admin vs client; placeholder for granular permissions</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <Input placeholder="User email" value={draft.user} onChange={(e) => setDraft((d) => ({ ...d, user: e.target.value }))} />
            <Input placeholder="Tenant id (optional)" value={draft.tenant} onChange={(e) => setDraft((d) => ({ ...d, tenant: e.target.value }))} />
            <Select
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              options={[
                { label: "Admin", value: "admin" },
                { label: "Client", value: "client" },
              ]}
            />
            <Button onClick={addAssignment}>Save (UI only)</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Assignments</CardTitle>
              <CardDescription>Not persisted — wire to tenant_members table</CardDescription>
            </div>
            <Badge variant="muted">{assignments.length} entries</Badge>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <EmptyState inline title="No assignments yet" />
            ) : (
              <div className="space-y-2">
                {assignments.map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold">{row.user}</p>
                      <p className="text-xs text-muted-foreground">{row.tenant || "global"}</p>
                    </div>
                    <Badge variant={row.role === "admin" ? "success" : "outline"}>{row.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
