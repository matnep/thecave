// The Cave admin: moderate questions, run the TV, sound and effects, and set who's on stage.
// Live state arrives over a WebSocket (role=admin); every change is a POST to /api/admin/<action>.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing, Check, Clock, ExternalLink, EyeOff, Flag, Flame, LogOut, MonitorPlay, Plus, QrCode, RotateCcw, Search,
  Smartphone, Trash2, Tv, Undo2, UserRound, Volume2, VolumeX, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  Brand, Confirm, LiveBadge, Login, SwitchRow, TvRemote, post, tvSummary, useAct, useAuth, useRoom,
} from '@/shared';

export default function App() {
  const { auth, signIn, signOut } = useAuth();
  return (
    <>
      {auth === 'out' && <Login onIn={signIn} />}
      {auth === 'in' && <Dashboard onOut={signOut} />}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}

const Title = ({ children }) => <CardTitle className="font-display text-lg font-normal tracking-wider">{children}</CardTitle>;

function Dashboard({ onOut }) {
  const { state, live } = useRoom(onOut);
  const act = useAct(onOut);
  const signOut = async () => { await post('/api/logout').catch(() => {}); onOut(); };
  const formUrl = state?.formUrl && state.formUrl !== '/form' ? state.formUrl : `${location.origin}/form`;

  return (
    <div className="min-h-svh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Brand />
          <LiveBadge live={live} />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a href={formUrl} target="_blank" rel="noopener"><QrCode /><span className="hidden lg:inline">{formUrl.replace(/^https?:\/\//, '')}</span></a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/panel" target="_blank" rel="noopener"><Smartphone /><span className="hidden sm:inline">Panel</span></a>
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
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6">
            <NowOnTv state={state} act={act} />
            <Questions state={state} act={act} />
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6">
            <TvCard settings={state.settings} act={act} />
            <SoundCard settings={state.settings} act={act} />
            <LiveControls settings={state.settings} act={act} />
            <Presenters settings={state.settings} act={act} />
          </div>
        </main>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ what's on the TV
function NowOnTv({ state, act }) {
  const { label, q, tv } = tvSummary(state);
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Title>ON THE TV NOW</Title>
          {tv?.kind && <Badge variant={tv.manual ? 'default' : 'secondary'}>{tv.manual ? 'Manual' : 'Slideshow'}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-black/30 p-4">
          {q ? (
            <>
              <p className="text-lg leading-snug break-words">“{q.text}”</p>
              <p className="mt-2 text-sm text-muted-foreground">— {q.name || 'anonymous'}</p>
            </>
          ) : <p className="text-muted-foreground">{label}</p>}
        </div>
        <TvRemote state={state} act={act} />
      </CardContent>
    </Card>
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
        <Title>QUESTIONS</Title>
        <CardDescription>Everything under “On the TV” rotates on the backdrop until you mark it answered or hide it.</CardDescription>
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
          {rows.length ? rows.map((q) => <Question key={q.id} q={q} onTv={state.tv?.kind === 'question' && state.tv.id === q.id} showStatus={tab === 'all'} act={act} />)
            : <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Question({ q, onTv, showStatus, act }) {
  const go = (action, ok) => act(action, { id: q.id }, ok);
  const time = new Date(q.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const btn = 'flex-1 sm:flex-none';
  return (
    <div className={cn('rounded-lg border bg-muted/40 p-3 transition-colors hover:bg-muted/70', q.flagged && 'border-destructive/50', onTv && 'border-primary/70 bg-primary/5')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug break-words">
            {onTv && <Badge className="mr-1.5 align-middle"><Tv />on screen</Badge>}
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
          <Confirm title="Delete this question?" body="It's removed for good, including from the TV." action="Delete" onConfirm={() => go('delete', 'Deleted')}>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Delete"><Trash2 /></Button>
          </Confirm>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ controls
// a slider that moves freely while dragging and saves when let go
function Level({ id, label, icon: Icon, value, min = 0, max = 1, step = .05, format, onCommit, muted, onMute, disabled }) {
  const [v, setV] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setV(value); }, [value]);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-2">{Icon && <Icon className="size-4 text-muted-foreground" />}{label}</Label>
        <div className="flex items-center gap-1">
          <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{format ? format(v) : v}</span>
          {onMute && (
            <Button variant={muted ? 'default' : 'ghost'} size="icon" className="size-8" onClick={() => onMute(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
          )}
        </div>
      </div>
      <Slider id={id} min={min} max={max} step={step} value={[v]} disabled={disabled || muted}
        onValueChange={([x]) => { dragging.current = true; setV(x); }}
        onValueCommit={([x]) => { dragging.current = false; onCommit(x); }} />
    </div>
  );
}
const pct = (x) => `${Math.round(x * 100)}%`;

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
        <Title>TV</Title>
        <CardDescription>The slideshow: QR code, then up to three questions, then a partner logo, and round again.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Level id="secs" label="Each question stays up" icon={Clock} value={s.questionSecs} min={5} max={120} step={5}
          format={(x) => `${x}s`} onCommit={(secs) => act('questionSecs', { secs })} />
        <form onSubmit={save} className="grid gap-2">
          <Label htmlFor="caption">Caption under the QR</Label>
          <div className="flex gap-2">
            <Input id="caption" maxLength={40} className="uppercase" value={caption}
              onChange={(e) => { dirty.current = true; setCaption(e.target.value); }} />
            <Button>Save</Button>
          </div>
        </form>
        <SwitchRow id="sponsors" label="Partner logos on the TV" hint="Each partner logo takes a turn between rounds."
          checked={s.sponsors !== false} onChange={(on) => act('sponsors', { on })} />
        <Separator />
        <SwitchRow id="chroma" label="Chromatic aberration" hint="Colour fringing toward the edges of the backdrop, like an old lens."
          checked={!!s.chroma?.on} onChange={(on) => act('chroma', { on })} />
        <Level id="chromaAmt" label="Strength" value={s.chroma?.amount ?? .6} format={pct} disabled={!s.chroma?.on}
          onCommit={(amount) => act('chroma', { amount })} />
      </CardContent>
    </Card>
  );
}

const CHIMES = [['marimba', 'Marimba'], ['bowl', 'Singing bowl'], ['dingdong', 'Ding-dong'], ['none', 'No sound']];

function SoundCard({ settings: s, act }) {
  const sound = s.sound || {}, amb = s.ambience || {};
  return (
    <Card className="gap-4">
      <CardHeader>
        <Title>SOUND</Title>
        <CardDescription>Plays from the backdrop laptop. Sound starts after the first key press there (F for fullscreen is enough).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label className="flex items-center gap-2"><BellRing className="size-4 text-muted-foreground" />New question sound</Label>
          <div className="flex gap-2">
            <Select value={sound.chime || 'marimba'} onValueChange={(chime) => act('sound', { chime })}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>{CHIMES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="secondary" onClick={() => act('tv', { cmd: 'test' }, 'Played on the backdrop')}>Test</Button>
          </div>
        </div>
        <Level id="chimeVol" label="Question sound volume" value={sound.volume ?? .6} format={pct}
          muted={!!sound.muted} onMute={(muted) => act('sound', { muted })} onCommit={(volume) => act('sound', { volume })} />
        <Level id="fireVol" label="Campfire crackle" icon={Flame} value={amb.volume ?? .35} format={pct}
          muted={!!amb.muted} onMute={(muted) => act('ambience', { muted })} onCommit={(volume) => act('ambience', { volume })} />
      </CardContent>
    </Card>
  );
}

function LiveControls({ settings: s, act }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <Title>LIVE CONTROLS</Title>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SwitchRow id="moderation" label="Approve before the TV" hint="Questions wait here until you approve them. Swear words (English & Malay) are always held."
          checked={s.moderation} onChange={(on) => act('moderation', { on })} />
        <SwitchRow id="focus" label="Zoom into the TV" hint="The backdrop camera moves in close on the TV screen."
          checked={s.focus} onChange={(on) => act('focus', { on })} />
        <Separator />
        <Confirm title="Clear the TV?" body="Every question on the TV is marked as answered, so the slideshow starts empty." action="Clear"
          onConfirm={() => act('clear', {}, 'TV cleared')}>
          <Button variant="outline" className="w-full text-destructive hover:text-destructive"><X />Mark all TV questions answered</Button>
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
        <Title>PRESENTERS</Title>
        <CardDescription>“On stage” shows their name under the logo and on the audience form.</CardDescription>
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
        <Button variant="link" className="h-auto justify-start p-0 text-muted-foreground" asChild>
          <a href="/" target="_blank" rel="noopener"><ExternalLink />Open the backdrop</a>
        </Button>
      </CardContent>
    </Card>
  );
}
