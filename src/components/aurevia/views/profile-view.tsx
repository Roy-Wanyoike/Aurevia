"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  UserCircle,
  Mail,
  Calendar,
  Building2,
  ShieldCheck,
  KeyRound,
  Save,
  Plus,
  AlertCircle,
  Crown,
  CheckCircle2,
} from "lucide-react";
import { useUser, useUpdateUser, useOrganizations, useCreateOrg } from "@/lib/aurevia/hooks";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Aurevia Profile view (issue #118).
//
// Self-service account management surface for the operator:
//   1. Identity card — avatar, email, role, member-since.
//   2. Organizations — list of orgs the user belongs to with their role +
//      plan, plus a "create org" form (auto-adds the current user as owner).
//   3. Edit name — inline PATCH form against /api/v1/user.
//   4. Account security — link to the password reset flow + session info.
//
// Data comes from /api/v1/user (useUser hook) + /api/v1/organizations
// (useOrganizations hook). Mutations use useUpdateUser + useCreateOrg.
//
// Form state is owned by leaf components so it initializes from the
// `initial*` props via useState's initializer — no setState-in-effect.
// A successful mutation invalidates the user/org queries, the parent
// re-renders with fresh data, and the `key` prop on each form remounts it
// so the input reflects the persisted value (not the local-edited one).
// ---------------------------------------------------------------------------

function initials(name: string | null | undefined, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
    return (first + second).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "owner":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "admin":
      return "border-rose-500/30 bg-rose-500/10 text-rose-400";
    case "member":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "viewer":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-400";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function planBadgeClass(plan: string): string {
  switch (plan) {
    case "enterprise":
      return "border-purple-500/30 bg-purple-500/10 text-purple-400";
    case "pro":
      return "border-teal-500/30 bg-teal-500/10 text-teal-400";
    case "free":
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function ProfileView() {
  const user = useUser();
  const orgs = useOrganizations();

  if (user.isLoading && !user.data) return <ProfileSkeleton />;
  if (user.isError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load profile</AlertTitle>
          <AlertDescription>
            {user.error?.message ?? "Unknown error"}.{" "}
            <Button
              variant="link"
              className="h-auto p-0 text-destructive underline"
              onClick={() => user.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const u = user.data;
  if (!u) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No authenticated user. Sign in to manage your profile.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Combine the orgs list — prefer the dedicated /organizations query (it
  // carries role + createdAt), fall back to the embedded user.organizations.
  const orgList = orgs.data ?? u.organizations ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your identity, organization memberships, and account security.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Identity card — spans 1 col on lg */}
        <Card className="p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials(u.name, u.email)}
              </AvatarFallback>
            </Avatar>
            <h3 className="mt-3 text-lg font-semibold">{u.name ?? "Unnamed"}</h3>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{u.email}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className={roleBadgeClass(u.role)}>
                <UserCircle className="mr-1 h-3 w-3" />
                {u.role}
              </Badge>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Member since {new Date(u.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        </Card>

        {/* Edit + security column — spans 2 cols on lg */}
        <div className="space-y-6 lg:col-span-2">
          {/* Edit name — keyed on id+name so a successful save (which mutates
              the cached user.name) remounts the form with the new value. */}
          <EditNameForm key={`name-${u.id}-${u.name ?? ""}`} initialName={u.name ?? ""} />

          {/* Account security */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Account security</h3>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Password</div>
                    <div className="text-xs text-muted-foreground">
                      Reset your password via the forgot-password flow.
                    </div>
                  </div>
                </div>
                <a
                  href="/auth/forgot-password"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Reset password
                </a>
              </div>
              <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Session</div>
                    <div className="text-xs text-muted-foreground">
                      NextAuth JWT session, 30-day expiry. Sign out from the sign-in page to revoke.
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Active
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Organizations */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold">Organizations</h3>
          <Badge variant="outline" className="ml-auto text-xs">
            {orgList.length} total
          </Badge>
        </div>

        <div className="space-y-2">
          {orgList.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-card/40 px-4 py-8 text-center">
              <Building2 className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                You don&apos;t belong to any organizations yet.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Create your first workspace below.
              </p>
            </div>
          ) : (
            orgList.map((o) => (
              <div
                key={o.id}
                className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                    {o.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {o.name}
                      {o.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{o.slug}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={roleBadgeClass(o.role)}>
                    {o.role}
                  </Badge>
                  <Badge variant="outline" className={planBadgeClass(o.plan)}>
                    {o.plan}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create organization form — keyed on the org list length so a
            successful create (which appends to the list) remounts the form
            and clears its inputs. */}
        <CreateOrgForm key={`org-${orgList.length}`} />
      </Card>
    </div>
  );
}

function EditNameForm({ initialName }: { initialName: string }) {
  const update = useUpdateUser();
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);

  function saveName() {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    if (name.trim() === initialName) {
      toast.info("No changes to save");
      return;
    }
    update.mutate(
      { name: name.trim() },
      {
        onSuccess: (data) => {
          toast.success("Profile updated");
          qc.invalidateQueries({ queryKey: ["user"] });
          if (data.user) qc.setQueryData(["user"], data.user);
        },
        onError: (e: any) => toast.error(e?.message ?? "Update failed"),
      }
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <UserCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Display name</h3>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            maxLength={100}
          />
        </div>
        <Button
          onClick={saveName}
          disabled={update.isPending || name.trim() === initialName.trim()}
          className="gap-2 sm:w-auto"
        >
          <Save className="h-4 w-4" />
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Display name is shown across the app (sidebar, audit logs, journal). Email cannot be changed here.
      </p>
    </Card>
  );
}

function CreateOrgForm() {
  const createOrg = useCreateOrg();
  const qc = useQueryClient();
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");

  function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) {
      toast.error("Organization name is required");
      return;
    }
    createOrg.mutate(
      {
        name: newOrgName.trim(),
        slug: newOrgSlug.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Organization created");
          setNewOrgName("");
          setNewOrgSlug("");
          qc.invalidateQueries({ queryKey: ["organizations"] });
          qc.invalidateQueries({ queryKey: ["user"] });
        },
        onError: (e: any) => toast.error(e?.message ?? "Create failed"),
      }
    );
  }

  return (
    <form onSubmit={handleCreateOrg} className="mt-5 rounded-md border border-border/60 bg-card/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Create organization
        </h4>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="org-name" className="text-xs">Name</Label>
          <Input
            id="org-name"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="Acme Capital"
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-slug" className="text-xs">Slug (optional)</Label>
          <Input
            id="org-slug"
            value={newOrgSlug}
            onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase())}
            placeholder="acme-capital"
            className="font-mono"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={createOrg.isPending || !newOrgName.trim()}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {createOrg.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        You will be added as the owner of the new organization. Slug is auto-derived from the name if left blank.
      </p>
    </form>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-1" />
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
