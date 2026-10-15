// The Cave admin: moderate questions, run the TV and set who's on stage.
// Live state arrives over a WebSocket (role=admin); every change is a POST to /api/admin/<action>.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, Clock, ExternalLink, EyeOff, Flag, LogOut, MonitorPlay, Plus, QrCode, RotateCcw, Search,
  Trash2, Tv, Undo2, UserRound, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

class SignedOut extends Error {}

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (r.status === 401 && path !== '/api/login') throw new SignedOut();
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

export default function App() {
  const [auth, setAuth] = useState('checking');   // checking | out | in
  useEffect(() => {
    post('/api/admin/ping').then(() => setAuth('in')).catch(() => setAuth('out'));
  }, []);
  return (
    <>
      {auth === 'out' && <Login onIn={() => setAuth('in')} />}
      {auth === 'in' && <Dashboard onOut={() => setAuth('out')} />}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}

function Brand({ className }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img src="/logo.png" alt="The Cave" className="h-8 w-auto object-contain drop-shadow-[0_0_12px_rgba(255,170,60,.35)]" />
      <span className="text-[11px] uppercase tracking-[.25em] text-muted-foreground">Admin</span>
    </div>
  );
}

// ------------------------------------------------------------------ sign in
function Login({ onIn }) {
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
          <Brand className="justify-center" />
          <CardDescription className="pt-2">Sign in to run the backdrop.</CardDescription>
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

// ------------------------------------------------------------------ live state
function useRoom(onOut) {
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

function Dashboard({ onOut }) {
  const { state, live } = useRoom(onOut);
  const act = useCallback(async (action, body, ok) => {
    try { await post('/api/admin/' + action, body); if (ok) toast.success(ok); return true; }
    catch (e) { if (e instanceof SignedOut) onOut(); else toast.error(e.message); return false; }
  }, [onOut]);
  const signOut = async () => { await post('/api/logout').catch(() => {}); onOut(); };

  const formUrl = state?.formUrl && state.formUrl !== '/form' ? state.formUrl : `${location.origin}/form`;

  return (
    <div className="min-h-svh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Brand />
          <Badge variant="outline" className={cn('ml-1 gap-1.5', live ? 'text-success' : 'text-muted-foreground')}>
            <span className={cn('size-2 rounded-full', live ? 'bg-success animate-pulse' : 'bg-destructive')} />
            {live ? 'Live' : 'Reconnecting'}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a href={formUrl} target="_blank" rel="noopener"><QrCode /><span className="hidden md:inline">{formUrl.replace(/^https?:\/\//, '')}</span></a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/" target="_blank" rel="noopener"><MonitorPlay /><span className="hidden sm:inline">Backdrop</span></a>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut /><span className="hidden sm:inline">Sign out</span></Button>
          </div>
        </div>
      </header>

      {!state ? (
        <p className="p-10 text-center text-muted-foreground">Connecting…</p>
      ) : (
        <main className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)] lg:items-start">
          <Questions state={state} act={act} />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6">
            <LiveControls settings={state.settings} act={act} />
            <Presenters settings={state.settings} act={act} />
            <TvCard settings={state.settings} act={act} />
          </div>
        </main>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ questions
const TABS = [['pending', 'Waiting'], ['approved', 'On the TV'], ['answered', 'Answered'], ['rejected', 'Hidden'], ['all', 'All']];
const STATUS = { pending: 'Waiting', approved: 'On the TV', answered: 'Answered', rejected: 'Hidden' };

function Questions({ state, act }) {
  const [tab, setTab] = useState('pending');
  const [term, setTerm] = useState('');
  const [who, setWho] = useState('all');
  const qs = state.questions;
  const names = useMemo(() => [...new Set(qs.map((q) => q.presenter).filter(Boolean))], [qs]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, k === 'all' ? qs.length : qs.filter((q) => q.status === k).length])), [qs]);
  const t = term.trim().toLowerCase();
  const rows = qs
    .filter((q) => tab === 'all' || q.status === tab)
    .filter((q) => who === 'all' || q.presenter === who)
    .filter((q) => !t || q.text.toLowerCase().includes(t) || q.name.toLowerCase().includes(t));
  if (tab === 'pending' || tab === 'approved') rows.reverse();   // oldest first: the order they'll be taken

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="font-display text-lg font-normal tracking-wider">QUESTIONS</CardTitle>
        <CardDescription>Approve what goes on the TV, or put one up right now.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <TabsList className="w-max">
              {TABS.map(([k, label]) => (
                <TabsTrigger key={k} value={k} className="gap-1.5">
                  {label}
                  <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', counts[k] && k === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{counts[k]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search questions or names…" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All presenters</SelectItem>
              {names.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          {rows.length ? rows.map((q) => <Question key={q.id} q={q} showStatus={tab === 'all'} act={act} />)
            : <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Question({ q, showStatus, act }) {
  const go = (action, ok) => act(action, { id: q.id }, ok);
  const time = new Date(q.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const btn = 'flex-1 sm:flex-none';
  return (
    <div className={cn('rounded-lg border bg-muted/40 p-3 transition-colors hover:bg-muted/70', q.flagged && 'border-destructive/50')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug break-words">
            {!!q.flagged && <Badge variant="destructive" className="mr-1.5 align-middle"><Flag />flagged</Badge>}
            {q.text}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{q.name || 'anonymous'}</span>
            {q.presenter && <span>for {q.presenter}</span>}
            <span className="inline-flex items-center gap-1"><Clock className="size-3" />{time}</span>
            {showStatus && <Badge variant="secondary">{STATUS[q.status]}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:flex-nowrap sm:justify-end">
          {q.status === 'pending' && <>
            <Button size="sm" className={btn} onClick={() => go('approve', 'Approved')}><Check />Approve</Button>
            <Button size="sm" variant="secondary" className={btn} onClick={() => go('spotlight', 'On the TV now')}><Tv />TV now</Button>
            <Button size="sm" variant="ghost" className={btn} onClick={() => go('reject')}><EyeOff />Hide</Button>
          </>}
          {q.status === 'approved' && <>
            <Button size="sm" className={btn} onClick={() => go('spotlight', 'On the TV now')}><Tv />TV now</Button>
            <Button size="sm" variant="secondary" className={btn} onClick={() => go('answered')}><Check />Answered</Button>
            <Button size="sm" variant="ghost" className={btn} onClick={() => go('reject')}><EyeOff />Hide</Button>
          </>}
          {q.status === 'answered' && <Button size="sm" variant="secondary" className={btn} onClick={() => go('spotlight', 'On the TV now')}><RotateCcw />Show again</Button>}
          {q.status === 'rejected' && <Button size="sm" variant="secondary" className={btn} onClick={() => go('restore')}><Undo2 />Back to waiting</Button>}
          <Confirm
            title="Delete this question?" body="It's removed for good, including from the TV." action="Delete"
            onConfirm={() => go('delete', 'Deleted')}
          >
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Delete"><Trash2 /></Button>
          </Confirm>
        </div>
      </div>
    </div>
  );
}

function Confirm({ children, title, body, action, onConfirm }) {
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

// ------------------------------------------------------------------ side cards
function SwitchRow({ id, label, hint, checked, onChange }) {
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

function LiveControls({ settings: s, act }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="font-display text-lg font-normal tracking-wider">LIVE CONTROLS</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SwitchRow id="moderation" label="Approve before the TV" hint="Questions wait here until you approve them. Swear words (English & Malay) are always held."
          checked={s.moderation} onChange={(on) => act('moderation', { on })} />
        <SwitchRow id="focus" label="Zoom into the TV" hint="The backdrop camera moves in close on the TV screen."
          checked={s.focus} onChange={(on) => act('focus', { on })} />
        <Separator />
        <Confirm title="Clear the TV queue?" body="Every question still queued for the TV is marked as answered." action="Clear queue"
          onConfirm={() => act('clear', {}, 'Queue cleared')}>
          <Button variant="outline" className="w-full text-destructive hover:text-destructive"><X />Clear the TV queue</Button>
        </Confirm>
      </CardContent>
    </Card>
  );
}

function Presenters({ settings: s, act }) {
  const [list, setList] = useState(s.presenters);
  const dirty = useRef(false);
  // follow the server unless there are unsaved edits
  useEffect(() => { if (!dirty.current) setList(s.presenters); }, [s.presenters]);
  const edit = (i, patch) => { dirty.current = true; setList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p))); };
  const save = async (msg = 'Presenters saved') => {
    const ok = await act('presenters', { presenters: list }, msg);
    if (ok) dirty.current = false;
    return ok;
  };
  const setLive = async (p) => {
    if (dirty.current || (p && !s.presenters.some((x) => x.id === p.id))) { if (!(await save(null))) return; }
    act('live', { id: p ? p.id : null }, p ? `${p.name || 'Presenter'} is on stage` : 'Nobody on stage');
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="font-display text-lg font-normal tracking-wider">PRESENTERS</CardTitle>
        <CardDescription>"On stage" shows their name under the logo and on the audience form.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!list.length && <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">No presenters yet.</p>}
        {list.map((p, i) => {
          const isLive = p.id === s.live;
          return (
            <div key={p.id} className={cn('grid gap-2 rounded-lg border p-3', isLive && 'border-primary/70 bg-primary/5 shadow-[0_0_24px_-8px] shadow-primary/40')}>
              <div className="flex gap-2">
                <Input placeholder="Name" value={p.name} onChange={(e) => edit(i, { name: e.target.value })} />
                <Button variant="ghost" size="icon" aria-label="Remove presenter"
                  onClick={() => { dirty.current = true; setList((l) => l.filter((_, j) => j !== i)); }}><Trash2 /></Button>
              </div>
              <Input placeholder="Talk title (optional)" value={p.title || ''} onChange={(e) => edit(i, { title: e.target.value })} />
              <Button size="sm" variant={isLive ? 'default' : 'secondary'} onClick={() => setLive(isLive ? null : p)}>
                {isLive ? <><span className="size-2 rounded-full bg-primary-foreground animate-pulse" />On stage</> : 'Put on stage'}
              </Button>
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1"
            onClick={() => { dirty.current = true; setList((l) => [...l, { id: crypto.randomUUID(), name: '', title: '' }]); }}><Plus />Add</Button>
          <Button className="flex-1" onClick={() => save()}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TvCard({ settings: s, act }) {
  const [caption, setCaption] = useState(s.caption);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setCaption(s.caption); }, [s.caption]);
  const save = async (e) => {
    e.preventDefault();
    if (await act('caption', { caption }, 'Caption saved')) dirty.current = false;
  };
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="font-display text-lg font-normal tracking-wider">TV</CardTitle>
        <CardDescription>The TV shows the QR code, partner logos and audience questions.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={save} className="grid gap-2">
          <Label htmlFor="caption">Caption under the QR</Label>
          <div className="flex gap-2">
            <Input id="caption" maxLength={40} className="uppercase" value={caption}
              onChange={(e) => { dirty.current = true; setCaption(e.target.value); }} />
            <Button>Save</Button>
          </div>
        </form>
        <SwitchRow id="sponsors" label="Partner logos on the TV" hint="Between questions, each partner logo takes a turn after the QR code."
          checked={s.sponsors !== false} onChange={(on) => act('sponsors', { on })} />
        <Button variant="link" className="h-auto justify-start p-0 text-muted-foreground" asChild>
          <a href="/" target="_blank" rel="noopener"><ExternalLink />Open the backdrop</a>
        </Button>
      </CardContent>
    </Card>
  );
}
