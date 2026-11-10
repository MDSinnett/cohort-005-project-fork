// PROTOTYPE — throwaway. Lives on branch `prototype/notification-bell`, never merged.
// Question: "What should the Notification bell and inbox look and behave like?"
// Three variants of the bell + inbox, mounted in the real app layout, switchable
// via `?variant=A|B|C` and the floating bar (← / → keys). In-memory only: fixtures
// are the six v1 catalogue events (E1–E6), picked by the current user's role.
//
//   A — "Sidebar bell + popover": bell beside the Cadence wordmark, dropdown list.
//   B — "Nav item + drawer": "Notifications (3)" in the nav, full-height slide-over
//        grouped Today / Earlier with an Unread/All filter.
//   C — "Top bar + inbox page": bell top-right of the main area, opens a full
//        two-pane inbox over the page; new arrivals also toast.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Receipt,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";

// ─── Fixtures ────────────────────────────────────────────────────────────────

type EventKind =
  | "refund_approved" // E1
  | "refund_declined" // E2
  | "refund_open" // E3
  | "seat_claimed" // E4
  | "question_asked" // E5
  | "question_answered"; // E6

export interface ProtoNotification {
  id: number;
  kind: EventKind;
  text: React.ReactNode;
  plain: string;
  excerpt?: string;
  href: string;
  minutesAgo: number;
  read: boolean;
}

const LESSON = "/courses/introduction-to-typescript/lessons/1";
const COURSE = "Introduction to TypeScript";

let nextId = 100;

function make(
  kind: EventKind,
  minutesAgo: number,
  read = false,
  who = "Olivia Martinez"
): ProtoNotification {
  const id = nextId++;
  const b = (s: string) => <strong className="font-semibold">{s}</strong>;
  switch (kind) {
    case "refund_approved":
      return {
        id, kind, minutesAgo, read, href: "/settings",
        plain: `Your Refund Request for ${COURSE} was approved.`,
        text: <>Your Refund Request for {b(COURSE)} was approved.</>,
        excerpt: "Note: Sorry it wasn't a fit — refund on its way.",
      };
    case "refund_declined":
      return {
        id, kind, minutesAgo, read, href: "/settings",
        plain: `Your Refund Request for ${COURSE} was declined.`,
        text: <>Your Refund Request for {b(COURSE)} was declined.</>,
        excerpt: "More than 30 days since purchase and 80% of lessons completed.",
      };
    case "refund_open":
      return {
        id, kind, minutesAgo, read, href: "/admin/refunds",
        plain: `${who} asked for a Refund on ${COURSE} (Individual Purchase).`,
        text: <>{b(who)} asked for a Refund on {b(COURSE)} (Individual Purchase).</>,
      };
    case "seat_claimed":
      return {
        id, kind, minutesAgo, read, href: "/team",
        plain: `${who} claimed a Seat on ${COURSE}.`,
        text: <>{b(who)} claimed a Seat on {b(COURSE)}.</>,
      };
    case "question_asked":
      return {
        id, kind, minutesAgo, read, href: `${LESSON}#comment-${id}`,
        plain: `${who} asked a question on What is TypeScript?`,
        text: <>{b(who)} asked a question on {b("What is TypeScript?")}</>,
        excerpt: "Why does tsc still emit JS when there are type errors? I expected the build to fail…",
      };
    case "question_answered":
      return {
        id, kind, minutesAgo, read, href: `${LESSON}#comment-${id}`,
        plain: `${who} answered your question on What is TypeScript?`,
        text: <>{b(who)} answered your question on {b("What is TypeScript?")}</>,
        excerpt: "Set noEmitOnError: true in tsconfig — by default tsc emits regardless of errors…",
      };
  }
}

function fixturesFor(role: UserRole | null, isTeamAdmin: boolean): ProtoNotification[] {
  if (role === UserRole.Admin)
    return [
      make("refund_open", 4),
      make("refund_open", 95, false, "James Park"),
      make("refund_open", 60 * 26, true, "Liam Thompson"),
    ];
  if (role === UserRole.Instructor)
    return [
      make("question_asked", 2),
      make("question_asked", 40, false, "Emma Wilson"),
      make("question_asked", 60 * 5, false, "Sophia Davis"),
      make("question_asked", 60 * 30, true, "Liam Thompson"),
      make("question_asked", 60 * 72, true, "Ava Nakamura"),
    ];
  if (isTeamAdmin)
    return [
      make("seat_claimed", 10, false, "Noah Blackwood"),
      make("seat_claimed", 12, false, "Ava Nakamura"),
      make("seat_claimed", 60 * 3, false, "Liam Thompson"),
      make("refund_approved", 60 * 50, true),
    ];
  return [
    make("question_answered", 7, false, "Sarah Chen"),
    make("refund_declined", 60 * 2),
    make("refund_approved", 60 * 49, true),
  ];
}

function arrivalFor(role: UserRole | null, isTeamAdmin: boolean): ProtoNotification {
  if (role === UserRole.Admin) return make("refund_open", 0, false, "Sophia Davis");
  if (role === UserRole.Instructor) return make("question_asked", 0, false, "James Park");
  if (isTeamAdmin) return make("seat_claimed", 0, false, "Emma Wilson");
  return make("question_answered", 0, false, "Marcus Johnson");
}

function ago(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 60 / 24)}d ago`;
}

function KindIcon({ kind, className }: { kind: EventKind; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  if (kind.startsWith("refund")) return <Receipt className={c} />;
  if (kind === "seat_claimed") return <UsersRound className={c} />;
  return <MessageSquare className={c} />;
}

// ─── Shared in-memory state ──────────────────────────────────────────────────

export function useProtoNotifications(
  role: UserRole | null,
  isTeamAdmin: boolean,
  empty: boolean
) {
  const [items, setItems] = useState<ProtoNotification[]>(() =>
    fixturesFor(role, isTeamAdmin)
  );
  useEffect(() => setItems(fixturesFor(role, isTeamAdmin)), [role, isTeamAdmin]);
  const visible = empty ? [] : items;
  return {
    items: visible,
    unread: visible.filter((n) => !n.read).length,
    markRead: (id: number) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n))),
    toggleRead: (id: number) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: !n.read } : n))),
    markAllRead: () => setItems((xs) => xs.map((n) => ({ ...n, read: true }))),
    arrive: () => {
      const n = arrivalFor(role, isTeamAdmin);
      setItems((xs) => [n, ...xs]);
      return n;
    },
  };
}

type Store = ReturnType<typeof useProtoNotifications>;

function useOpenAndGo(store: Store, close: () => void) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (n: ProtoNotification) => {
    store.markRead(n.id);
    close();
    const [path, hash] = n.href.split("#");
    const q = new URLSearchParams();
    for (const k of ["variant", "empty"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    navigate(`${path}?${q}${hash ? `#${hash}` : ""}`);
  };
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOut();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [on, onOut, ref]);
}

// ─── Variant A: sidebar bell + popover ───────────────────────────────────────
// Bell sits in the sidebar header next to "Cadence". Popover opens to the right,
// newest first, max ~6 visible then scrolls. Click = navigate + mark read.
// Unread rows get a dot + tinted background. "Mark all read" in the header.

export function VariantASidebarBell({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const go = useOpenAndGo(store, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-5" />
        <Badge count={store.unread} className="absolute -right-1.5 -top-1" />
      </button>
      {open && (
        <div className="absolute left-full top-0 z-40 ml-3 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {store.unread > 0 && (
              <button
                onClick={store.markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          {store.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <Bell className="size-8 opacity-30" />
              You're all caught up.
              <span className="text-xs">Notifications about your courses will show up here.</span>
            </div>
          ) : (
            <ul className="max-h-[26rem] divide-y overflow-y-auto">
              {store.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => go(n)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-accent",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <KindIcon kind={n.kind} className="mt-0.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className={cn(n.read && "text-muted-foreground")}>{n.text}</div>
                      {n.excerpt && (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          “{n.excerpt}”
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">{ago(n.minutesAgo)}</div>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Variant B: nav item + slide-over drawer ─────────────────────────────────
// "Notifications" is a first-class nav item with a count. Opens a full-height
// drawer beside the sidebar, grouped Today / Earlier, Unread/All tabs, per-row
// read/unread toggle on hover. Read rows stay in "All".

// D = A's sidebar bell opening B's full drawer.
// E = A's sidebar bell + dropdown, with B's Unread/All tabs, grouping and
//     per-row read toggle inside the dropdown.
export function VariantBNavDrawer({
  store,
  trigger = "nav",
  shape = "drawer",
}: {
  store: Store;
  trigger?: "nav" | "bell";
  shape?: "drawer" | "popover";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const go = useOpenAndGo(store, () => setOpen(false));

  const shown = store.items.filter((n) => tab === "all" || !n.read);
  const today = shown.filter((n) => n.minutesAgo < 60 * 24);
  const earlier = shown.filter((n) => n.minutesAgo >= 60 * 24);

  const group = (label: string, xs: ProtoNotification[]) =>
    xs.length > 0 && (
      <section>
        <div className="sticky top-0 bg-background/95 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
          {label}
        </div>
        {xs.map((n) => (
          <div
            key={n.id}
            className="group relative flex gap-3 border-l-2 px-5 py-3 hover:bg-accent"
            style={{ borderLeftColor: n.read ? "transparent" : "var(--primary)" }}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <KindIcon kind={n.kind} />
            </div>
            <button onClick={() => go(n)} className="min-w-0 flex-1 text-left text-sm">
              <div className={cn(n.read && "text-muted-foreground")}>{n.text}</div>
              {n.excerpt && (
                <div className="mt-1 line-clamp-2 rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                  {n.excerpt}
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">{ago(n.minutesAgo)}</div>
            </button>
            <button
              onClick={() => store.toggleRead(n.id)}
              title={n.read ? "Mark as unread" : "Mark as read"}
              className="invisible self-start rounded p-1 text-muted-foreground hover:bg-background group-hover:visible"
            >
              {n.read ? <Bell className="size-4" /> : <Check className="size-4" />}
            </button>
          </div>
        ))}
      </section>
    );

  return (
    <div ref={ref} className={cn(shape === "popover" && "relative")}>
      {trigger === "bell" ? (
        <button
          onClick={() => setOpen((o) => !o)}
          title="Notifications"
          className={cn(
            "relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            open && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
        >
          <Bell className="size-5" />
          <Badge count={store.unread} className="absolute -right-1.5 -top-1" />
        </button>
      ) : (
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        Notifications
        <Badge count={store.unread} className="ml-auto" />
      </button>
      )}
      {open && (
        <div
          className={cn(
            "z-40 flex flex-col bg-background text-foreground",
            shape === "drawer"
              ? "fixed bottom-0 left-56 top-0 w-[26rem] border-r shadow-2xl"
              : "absolute left-full top-0 ml-3 max-h-[32rem] w-96 rounded-lg border shadow-xl"
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-5">
            <span className="font-semibold">Notifications</span>
            <div className="flex items-center gap-2">
              {store.unread > 0 && (
                <button
                  onClick={store.markAllRead}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-1 border-b px-5 py-2">
            {(["unread", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t}
                {t === "unread" && store.unread > 0 && ` (${store.unread})`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
                <BellOff className="size-8 opacity-30" />
                {tab === "unread" && store.items.length > 0 ? (
                  <>
                    No unread Notifications.
                    <button onClick={() => setTab("all")} className="text-xs underline">
                      Show all
                    </button>
                  </>
                ) : (
                  <>Nothing here yet.</>
                )}
              </div>
            ) : (
              <>
                {group("Today", today)}
                {group("Earlier", earlier)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variant C: top bar bell + full inbox ────────────────────────────────────
// A thin top bar over the main area holds the bell (top-right, web-app style).
// Clicking opens an inbox that covers the page: list on the left, the selected
// Notification's detail on the right with an explicit "Go to …" button. So
// selecting ≠ navigating; selecting marks read. New arrivals also toast.

const destLabel: Record<EventKind, string> = {
  refund_approved: "Go to Settings",
  refund_declined: "Go to Settings",
  refund_open: "Review Refund Requests",
  seat_claimed: "Go to Team",
  question_asked: "Open Question",
  question_answered: "Open Answer",
};

export function VariantCTopBar({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const go = useOpenAndGo(store, () => setOpen(false));
  const selected = store.items.find((n) => n.id === sel) ?? null;

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-end border-b bg-background/90 px-6 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          className="relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <Bell className="size-4" />
          {store.unread > 0 ? `${store.unread} new` : "Inbox"}
          {store.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-500" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-y-0 left-56 right-0 z-40 flex flex-col bg-background">
          <div className="flex h-14 items-center justify-between border-b px-6">
            <h2 className="text-lg font-semibold">Inbox</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={store.markAllRead}
                disabled={store.unread === 0}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <CheckCheck className="size-4" /> Mark all read
              </button>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-5" />
              </button>
            </div>
          </div>
          {store.items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Bell className="size-12 opacity-20" />
              <div className="text-base font-medium">Inbox zero</div>
              <div className="text-sm">When something needs your attention, it lands here.</div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <ul className="w-[24rem] shrink-0 overflow-y-auto border-r">
                {store.items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        setSel(n.id);
                        store.markRead(n.id);
                      }}
                      className={cn(
                        "flex w-full gap-3 border-b px-5 py-3 text-left text-sm",
                        sel === n.id ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate", !n.read && "font-semibold")}>{n.plain}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{ago(n.minutesAgo)}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex-1 overflow-y-auto p-10">
                {selected ? (
                  <div className="max-w-xl space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <KindIcon kind={selected.kind} /> {ago(selected.minutesAgo)}
                    </div>
                    <div className="text-lg">{selected.text}</div>
                    {selected.excerpt && (
                      <blockquote className="border-l-4 pl-4 text-muted-foreground">{selected.excerpt}</blockquote>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => go(selected)}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        {destLabel[selected.kind]} →
                      </button>
                      <button
                        onClick={() => store.toggleRead(selected.id)}
                        className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
                      >
                        Mark as unread
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Select a Notification to read it.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Floating switcher ───────────────────────────────────────────────────────

export const VARIANTS = [
  { key: "A", name: "Sidebar bell + popover" },
  { key: "B", name: "Nav item + drawer" },
  { key: "C", name: "Top bar + inbox page" },
  { key: "D", name: "A's bell → B's drawer" },
  { key: "E", name: "A's dropdown with B's tabs" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export function usePrototypeVariant() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("variant");
  const variant: VariantKey = VARIANTS.some((v) => v.key === raw) ? (raw as VariantKey) : "A";
  const empty = params.get("empty") === "1";
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  return { variant, empty, set };
}

export function PrototypeSwitcher({
  onArrive,
}: {
  onArrive: () => void;
}) {
  const { variant, empty, set } = usePrototypeVariant();
  const idx = VARIANTS.findIndex((v) => v.key === variant);
  const cycle = (d: number) =>
    set({ variant: VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button onClick={() => cycle(-1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-52 text-center font-medium">
        {variant} ({VARIANTS[idx].name})
      </span>
      <button onClick={() => cycle(1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/20" />
      <button onClick={onArrive} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/10">
        + New arrives
      </button>
      <label className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs hover:bg-white/10">
        <input type="checkbox" checked={empty} onChange={(e) => set({ empty: e.target.checked ? "1" : null })} />
        Empty
      </label>
      <span className="ml-1 rounded bg-fuchsia-500 px-1.5 text-[10px] font-bold uppercase">prototype</span>
    </div>
  );
}

export function announceArrival(variant: VariantKey, n: ProtoNotification) {
  // Only C toasts; A and B rely on the badge alone, so the difference is visible.
  if (variant !== "C") return;
  toast(n.plain, { icon: <Bell className="size-4" /> });
}
