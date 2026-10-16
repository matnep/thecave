// Pieces shared by the admin page (/admin) and the moderator panel (/panel):
// sign-in, the live connection to the room, and the TV remote.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Play, QrCode, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export class SignedOut extends Error {}

export async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (r.status === 401 && path !== '/api/login') throw new SignedOut();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

// signed in already? (cookie from an earlier visit)
export function useAuth() {
  const [auth, setAuth] = useState('checking');   // checking | out | in
  useEffect(() => { post('/api/admin/ping').then(() => setAuth('in')).catch(() => setAuth('out')); }, []);
  const signIn = useCallback(() => setAuth('in'), []);
  const signOut = useCallback(() => setAuth('out'), []);
  return { auth, signIn, signOut };
}

export function Brand({ className, label = 'Admin' }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img src="/logo.png" alt="The Cave" className="h-8 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,170,60,.35)]" />
      <span className="text-[11px] uppercase tracking-[.25em] text-muted-foreground">{label}</span>
    </div>
  );
}

export function Login({ onIn, label }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await post('/api/login', { password: pw }); onIn(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); setPw(''); }
  };
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Brand className="justify-center" label={label} />
          <CardDescription className="pt-2">Sign in with the admin password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" autoComplete="current-password" autoFocus required value={pw} onChange={(e) => setPw(e.target.value)} />
            <Button disabled={busy} className="mt-1">{busy ? 'Signing in…' : 'Sign in'}</Button>
            <p className="min-h-5 text-sm text-destructive" role="alert">{err}</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

// live state from the room: the full snapshot, plus quick 'tv' updates when the backdrop changes slide
export function useRoom(onOut) {
  const [state, setState] = useState(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let ws, ping, retry, closed = false;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?role=admin`);
      ws.onopen = () => { setLive(true); ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000); };
      ws.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        const msg = JSON.parse(ev.data);
        if (msg.type === 'state') setState(msg);
        if (msg.type === 'tv') setState((s) => s && { ...s, tv: msg.tv });
      };
      ws.onclose = () => {
        clearInterval(ping); setLive(false);
        if (!closed) retry = setTimeout(probe, 1500);
      };
    };
    // a refused upgrade looks like a plain close; check we're still signed in before retrying
    const probe = () => post('/api/admin/ping').then(connect).catch((e) => (e instanceof SignedOut ? onOut() : connect()));
    connect();
    return () => { closed = true; clearTimeout(retry); clearInterval(ping); ws?.close(); };
  }, [onOut]);
  return { state, live };
}

// POST an admin action; toasts on failure (and optionally on success)
export function useAct(onOut) {
  return useCallback(async (action, body, ok) => {
    try { await post('/api/admin/' + action, body); if (ok) toast.success(ok); return true; }
    catch (e) { if (e instanceof SignedOut) onOut(); else toast.error(e.message); return false; }
  }, [onOut]);
}

export function LiveBadge({ live }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium', live ? 'text-success' : 'text-muted-foreground')}>
      <span className={cn('size-2 rounded-full', live ? 'bg-success animate-pulse' : 'bg-destructive')} />
      {live ? 'Live' : 'Reconnecting'}
    </span>
  );
}

export function Confirm({ children, title, body, action, onConfirm }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SwitchRow({ id, label, hint, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Label htmlFor={id} className="grid cursor-pointer gap-1 font-normal">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

// what the backdrop says is on its TV right now
export function tvSummary(state) {
  const tv = state?.tv;
  if (!state?.displays) return { label: 'Backdrop not open', q: null, tv };
  if (!tv?.kind) return { label: 'Starting up…', q: null, tv };
  const q = tv.kind === 'question' ? state.questions.find((x) => x.id === tv.id) : null;
  const label = tv.kind === 'qr' ? 'QR code' : tv.kind === 'partner' ? 'Partner logo' : q ? 'Question' : 'Question';
  return { label, q, tv };
}

// next / previous / QR / back to the slideshow, same as the presenter's arrow keys
// cols = 2 for narrow spots (a 2x2 grid with labels), 4 for a single row
export function TvRemote({ state, act, size = 'default', cols = 4 }) {
  const { tv } = tvSummary(state);
  const send = (cmd) => act('tv', { cmd });
  const big = size === 'lg';
  return (
    <div className="grid gap-2">
      {tv?.manual && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="flex-1">The TV is on <b>manual</b>: it holds the current slide. Press <b>Slideshow</b> to let questions rotate on their own.</span>
        </div>
      )}
      <div className={cn('grid gap-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-4')}>
        {[
          ['prev', 'Prev', <ChevronLeft key="i" />, 'secondary'],
          ['qr', 'QR', <QrCode key="i" />, 'secondary'],
          ['next', 'Next', <ChevronRight key="i" />, 'secondary'],
          ['auto', 'Slideshow', <Play key="i" />, tv?.manual ? 'default' : 'outline'],
        ].map(([cmd, label, icon, variant]) => (
          <Button key={cmd} variant={variant} onClick={() => send(cmd)} aria-label={label}
            className={cn(big ? 'h-16 flex-col gap-1 text-[11px]' : 'gap-1.5')}>
            {icon}<span className={cn(!big && cols !== 2 && 'hidden sm:inline')}>{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
