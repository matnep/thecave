// The moderator panel (/panel): for a phone or tablet on stage. Big, readable questions, what's on the TV right now,
// the TV remote, and quick approve / show / answered. Same login as the admin page.
import { useEffect, useMemo, useState } from 'react';
import { AArrowDown, AArrowUp, Check, EyeOff, LogOut, Tv, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { Brand, LiveBadge, Login, TvRemote, post, tvSummary, useAct, useAuth, useRoom } from '@/shared';

const SIZES = ['text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];

export default function Panel() {
  const { auth, signIn, signOut } = useAuth();
  return (
    <>
      {auth === 'out' && <Login onIn={signIn} label="Moderator" />}
      {auth === 'in' && <Board onOut={signOut} />}
      <Toaster position="top-center" richColors />
    </>
  );
}

// keep the phone from dimming while it's on the lectern
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const grab = () => navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    const again = () => document.visibilityState === 'visible' && grab();
    grab();
    document.addEventListener('visibilitychange', again);
    return () => { document.removeEventListener('visibilitychange', again); lock?.release?.(); };
  }, []);
}

function Board({ onOut }) {
  useWakeLock();
  const { state, live } = useRoom(onOut);
  const act = useAct(onOut);
  const [size, setSize] = useState(() => Number(localStorage.getItem('cave-panel-size') ?? 2));
  useEffect(() => localStorage.setItem('cave-panel-size', String(size)), [size]);
  const [tab, setTab] = useState('approved');
  const signOut = async () => { await post('/api/logout').catch(() => {}); onOut(); };

  const lists = useMemo(() => {
    const qs = state?.questions || [];
    return {
      approved: qs.filter((q) => q.status === 'approved').reverse(),   // oldest first
      pending: qs.filter((q) => q.status === 'pending').reverse(),
      answered: qs.filter((q) => q.status === 'answered'),            // newest first
    };
  }, [state?.questions]);

  const { label, q: onTv, tv } = tvSummary(state);
  const text = SIZES[size];

  return (
    <div className="min-h-svh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
          <Brand label="Moderator" />
          <LiveBadge live={live} />
          <div className="ml-auto flex items-center">
            <Button variant="ghost" size="icon" aria-label="Smaller text" disabled={size === 0} onClick={() => setSize((s) => Math.max(0, s - 1))}><AArrowDown /></Button>
            <Button variant="ghost" size="icon" aria-label="Bigger text" disabled={size === SIZES.length - 1} onClick={() => setSize((s) => Math.min(SIZES.length - 1, s + 1))}><AArrowUp /></Button>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut /></Button>
          </div>
        </div>
      </header>

      {!state ? <p className="p-10 text-center text-muted-foreground">Connecting…</p> : (
        <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 p-4">
          {/* what the audience is looking at */}
          <Card className="gap-3 border-primary/50 py-4 shadow-[0_0_40px_-16px] shadow-primary/50">
            <CardContent className="grid gap-3 px-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[.2em] text-primary">On the TV now</span>
                {tv?.kind && <Badge variant={tv.manual ? 'default' : 'secondary'}>{tv.manual ? 'Manual' : 'Slideshow'}</Badge>}
              </div>
              {onTv ? (
                <div>
                  <p className={cn(text, 'font-medium leading-snug break-words')}>“{onTv.text}”</p>
                  <p className="mt-2 text-base text-muted-foreground">— {onTv.name || 'anonymous'}{onTv.presenter && ` · for ${onTv.presenter}`}</p>
                </div>
              ) : <p className="text-lg text-muted-foreground">{label}</p>}
              <TvRemote state={state} act={act} size="lg" />
              {/* camera zoom on the backdrop: in close on the TV, or back out to the whole cave */}
              <Button variant={state.settings.focus ? 'default' : 'secondary'} className="h-12"
                onClick={() => act('focus', { on: !state.settings.focus }, state.settings.focus ? 'Zoomed out' : 'Zoomed in on the TV')}>
                {state.settings.focus ? <><ZoomOut />Zoom out to the cave</> : <><ZoomIn />Zoom in on the TV</>}
              </Button>
              {onTv && (
                <Button variant="outline" className="h-12" onClick={() => act('answered', { id: onTv.id }, 'Marked answered')}><Check />Answered: take it off the TV</Button>
              )}
            </CardContent>
          </Card>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid h-11 w-full grid-cols-3">
              <TabsTrigger value="approved">Queue <Count n={lists.approved.length} /></TabsTrigger>
              <TabsTrigger value="pending">Waiting <Count n={lists.pending.length} hot /></TabsTrigger>
              <TabsTrigger value="answered">Answered</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3">
            {lists[tab].length ? lists[tab].map((q) => (
              <Item key={q.id} q={q} text={text} onTv={tv?.kind === 'question' && tv.id === q.id} act={act} />
            )) : <p className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">Nothing here.</p>}
          </div>
        </main>
      )}
    </div>
  );
}

const Count = ({ n, hot }) => (
  <span className={cn('ml-1.5 rounded-full px-1.5 text-[11px] tabular-nums', hot && n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{n}</span>
);

function Item({ q, text, onTv, act }) {
  const go = (action, ok) => act(action, { id: q.id }, ok);
  const fresh = Date.now() - q.at < 90_000;
  const time = new Date(q.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <Card className={cn('gap-3 py-4', onTv && 'border-primary/70 bg-primary/5')}>
      <CardContent className="grid gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {onTv && <Badge><Tv />on screen</Badge>}
          {fresh && !onTv && <Badge variant="secondary">new</Badge>}
          {!!q.flagged && <Badge variant="destructive">flagged</Badge>}
          <span className="font-medium text-foreground/80">{q.name || 'anonymous'}</span>
          <span>{time}</span>
          {q.presenter && <span>for {q.presenter}</span>}
        </div>
        <p className={cn(text, 'leading-snug break-words')}>{q.text}</p>
        <div className="grid grid-cols-2 gap-2">
          {q.status === 'pending' && <>
            <Button className="h-11" onClick={() => go('approve', 'Approved')}><Check />Approve</Button>
            <Button variant="secondary" className="h-11" onClick={() => go('reject')}><EyeOff />Hide</Button>
          </>}
          {q.status === 'approved' && <>
            <Button className="h-11" disabled={onTv} onClick={() => go('spotlight', 'On the TV now')}><Tv />Show now</Button>
            <Button variant="secondary" className="h-11" onClick={() => go('answered', 'Marked answered')}><Check />Answered</Button>
          </>}
          {q.status === 'answered' && <Button variant="secondary" className="col-span-2 h-11" onClick={() => go('spotlight', 'Back on the TV')}><Tv />Show again</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
