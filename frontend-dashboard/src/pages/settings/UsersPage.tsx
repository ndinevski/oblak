/**
 * Users (Identitet) - root only.
 *
 * Lists all accounts and lets the root user create members, grant each one a
 * per-service access level (none / read / write), block/unblock, and delete.
 * The root account itself is defined by OBLAK_ROOT_EMAIL and cannot be edited
 * here.
 */

import { useMemo, useState } from 'react';
import { ShieldCheck, UserPlus, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useIdentitetMe,
  useIdentitetUsers,
  useIdentitetServices,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from '@/hooks/useIdentitet';
import type { AccessLevel, IdentitetService, IdentitetUser } from '@/lib/api/identitet';

const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: 'None',
  read: 'Read',
  write: 'Write',
};

export default function UsersPage() {
  const { data: me } = useIdentitetMe();
  const users = useIdentitetUsers();
  const services = useIdentitetServices();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<IdentitetUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IdentitetUser | null>(null);

  const serviceList = services.data?.services ?? [];

  if (me && !me.isRoot) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Only the root account can manage users.
        </p>
      </div>
    );
  }

  const list = users.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts and grant each one access to specific services. The root
            account is set by OBLAK_ROOT_EMAIL and has full access.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> New user
        </Button>
      </div>

      {users.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.username}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      {u.identitetRole === 'root' ? (
                        <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
                          <ShieldCheck className="h-3 w-3" /> Root
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Member</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <AccessSummary user={u} services={serviceList} />
                    </TableCell>
                    <TableCell>
                      {u.blocked ? (
                        <span className="text-xs text-destructive">Blocked</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Active</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.identitetRole === 'root' ? (
                        <span className="text-xs text-muted-foreground">managed by env</span>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setEditing(u)}
                            aria-label={`Edit ${u.username}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDelete(u)}
                            aria-label={`Delete ${u.username}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateUserDialog open={creating} onOpenChange={setCreating} services={serviceList} />
      <EditUserDialog
        user={editing}
        services={serviceList}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <DeleteUserDialog user={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} />
    </div>
  );
}

function AccessSummary({ user, services }: { user: IdentitetUser; services: IdentitetService[] }) {
  const granted = services.filter((s) => {
    const level = user.grants[s.key];
    return level === 'read' || level === 'write';
  });
  if (granted.length === 0) {
    return <span className="text-xs text-muted-foreground">no access</span>;
  }
  if (granted.length === services.length) {
    return <span className="text-xs text-muted-foreground">all services</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {granted.slice(0, 4).map((s) => (
        <Badge key={s.key} variant="outline" className="text-xs">
          {s.label.split(' (')[0]}: {user.grants[s.key] === 'write' ? 'W' : 'R'}
        </Badge>
      ))}
      {granted.length > 4 && (
        <Badge variant="outline" className="text-xs">
          +{granted.length - 4}
        </Badge>
      )}
    </div>
  );
}

function GrantsEditor({
  services,
  grants,
  onChange,
}: {
  services: IdentitetService[];
  grants: Record<string, AccessLevel>;
  onChange: (grants: Record<string, AccessLevel>) => void;
}) {
  const setAll = (level: AccessLevel) => {
    onChange(Object.fromEntries(services.map((s) => [s.key, level])));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Service access</Label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAll('none')}>
            None
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll('read')}>
            All read
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll('write')}>
            All write
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {services.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="text-sm">{s.label}</span>
            <Select
              value={grants[s.key] ?? 'none'}
              onValueChange={(v) => onChange({ ...grants, [s.key]: v as AccessLevel })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['none', 'read', 'write'] as AccessLevel[]).map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {LEVEL_LABEL[lvl]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  services,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: IdentitetService[];
}) {
  const { toast } = useToast();
  const createUser = useCreateUser();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [grants, setGrants] = useState<Record<string, AccessLevel>>({});

  const defaultGrants = useMemo(
    () => Object.fromEntries(services.map((s) => [s.key, 'read' as AccessLevel])),
    [services],
  );

  const reset = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setGrants({});
  };

  const handleSubmit = async () => {
    try {
      await createUser.mutateAsync({
        username: username.trim(),
        email: email.trim(),
        password,
        grants: Object.keys(grants).length ? grants : defaultGrants,
      });
      toast({ title: 'User created', description: email });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create user',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Creates a member account. Set which services it can reach; you can change these
            any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="u-name">Username</Label>
              <Input id="u-name" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-pass">Password</Label>
            <Input id="u-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <GrantsEditor
            services={services}
            grants={Object.keys(grants).length ? grants : defaultGrants}
            onChange={setGrants}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!username.trim() || !email.trim() || password.length < 6 || createUser.isPending}
          >
            {createUser.isPending ? 'Creating...' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  services,
  onOpenChange,
}: {
  user: IdentitetUser | null;
  services: IdentitetService[];
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const updateUser = useUpdateUser();
  const [grants, setGrants] = useState<Record<string, AccessLevel>>({});
  const [blocked, setBlocked] = useState(false);
  const [seededFor, setSeededFor] = useState<number | null>(null);

  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setGrants({ ...user.grants });
    setBlocked(user.blocked);
  }

  const handleSubmit = async () => {
    if (!user) return;
    try {
      await updateUser.mutateAsync({ id: user.id, patch: { grants, blocked } });
      toast({ title: 'User updated', description: user.email });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update user',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {user?.username}</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Blocked (cannot sign in)</span>
            <Switch checked={blocked} onCheckedChange={setBlocked} />
          </label>
          <GrantsEditor services={services} grants={grants} onChange={setGrants} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateUser.isPending}>
            {updateUser.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: IdentitetUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const deleteUser = useDeleteUser();

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteUser.mutateAsync(user.id);
      toast({ title: 'User deleted', description: user.email });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete user',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user?.username}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the account. Resources they created are not deleted, but no one
            will own them until reassigned. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
