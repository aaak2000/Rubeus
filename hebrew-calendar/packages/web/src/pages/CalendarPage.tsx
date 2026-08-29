import { useCallback, useEffect, useMemo, useState } from 'react';
import { localTimeZone, zonedDateKey, type GeoPoint } from '@hcal/core';
import { api, ApiError, type Calendar, type EventInstance } from '../api/client';
import {
  GREGORIAN_MONTHS_HE,
  buildMonthGrid,
  buildRange,
  buildWeek,
  hebrewMonthSpan,
  hebrewRangeLabel,
  type GridDay,
} from '../hebrew';
import { CalendarHeader } from '../components/CalendarHeader';
import { DayDrawer } from '../components/DayDrawer';
import { EventModal } from '../components/EventModal';
import { MonthView } from '../views/MonthView';
import { WeekView } from '../views/WeekView';
import { AgendaView } from '../views/AgendaView';
import { HebrewYearView } from '../views/HebrewYearView';
import type { ViewMode } from '../views/types';
import { useToast } from '../ui';

const AGENDA_DAYS = 45;

function todayIsoIn(tz: string): string {
  return zonedDateKey(new Date(), tz);
}

export function CalendarPage() {
  const toast = useToast();
  const [tzid, setTzid] = useState<string>(localTimeZone());
  const [anchor, setAnchor] = useState<string>(() => todayIsoIn(localTimeZone()));
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'agenda' : 'month',
  );

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState('');
  const [events, setEvents] = useState<EventInstance[]>([]);
  const [il, setIl] = useState(false);
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventInstance | null>(null);
  const [syncing, setSyncing] = useState(false);

  const anchorYear = Number(anchor.slice(0, 4));
  const anchorMonth = Number(anchor.slice(5, 7));

  // The days each view needs. Kept in one place so the event query and the
  // rendered grid can never disagree about the window.
  const days = useMemo<GridDay[]>(() => {
    if (view === 'week') return buildWeek(anchor, il, tzid);
    if (view === 'agenda') return buildRange(anchor, AGENDA_DAYS, il, tzid);
    return buildMonthGrid(anchorYear, anchorMonth, il, tzid);
  }, [view, anchor, anchorYear, anchorMonth, il, tzid]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.calendars(), api.profile()])
      .then(([cals, profile]) => {
        if (cancelled) return;
        setCalendars(cals);
        const def = cals.find((c) => c.isDefault) ?? cals[0];
        if (def) setCalendarId(def.id);
        if (profile.settings) {
          setIl(profile.settings.il);
          if (profile.settings.tzid) setTzid(profile.settings.tzid);
          const { latitude, longitude, tzid: t } = profile.settings;
          if (latitude != null && longitude != null) {
            setGeo({ latitude, longitude, tzid: t, il: profile.settings.il });
          }
        }
      })
      .catch(() => toast.error('טעינת היומנים נכשלה'));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const loadEvents = useCallback(async () => {
    if (!calendarId || days.length === 0) return;
    setLoading(true);
    try {
      const start = `${days[0]!.iso}T00:00:00Z`;
      const end = `${days[days.length - 1]!.iso}T23:59:59Z`;
      setEvents(await api.events(calendarId, start, end));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'טעינת האירועים נכשלה');
    } finally {
      setLoading(false);
    }
  }, [calendarId, days, toast]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventInstance[]>();
    for (const e of events) {
      const arr = map.get(e.localDate) ?? [];
      arr.push(e);
      map.set(e.localDate, arr);
    }
    return map;
  }, [events]);

  const shift = useCallback(
    (direction: -1 | 1) => {
      const d = new Date(`${anchor}T00:00:00`);
      if (view === 'month' || view === 'year') d.setMonth(d.getMonth() + direction);
      else if (view === 'week') d.setDate(d.getDate() + 7 * direction);
      else d.setDate(d.getDate() + AGENDA_DAYS * direction);
      setAnchor(zonedDateKey(new Date(d.getTime() - d.getTimezoneOffset() * 60000), 'UTC'));
    },
    [anchor, view],
  );

  const goToday = useCallback(() => {
    const t = todayIsoIn(tzid);
    setAnchor(t);
    setSelected(t);
  }, [tzid]);

  // Keyboard shortcuts, ignored while typing or with a modifier held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, ViewMode> = { m: 'month', w: 'week', a: 'agenda', y: 'year' };
      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        goToday();
      } else if (map[key]) {
        e.preventDefault();
        setView(map[key]!);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToday]);

  async function syncNow() {
    if (!calendarId) return;
    setSyncing(true);
    try {
      const r = await api.sync(calendarId);
      const pulled = r.pulledCreated + r.pulledUpdated + r.pulledDeleted;
      const pushed = r.pushedCreated + r.pushedUpdated + r.pushedDeleted;
      toast.success(`הסנכרון הושלם — נמשכו ${pulled}, נדחפו ${pushed}`);
      if (r.errors.length > 0) toast.error(`${r.errors.length} פריטים נכשלו בסנכרון`);
      await loadEvents();
    } catch (err) {
      // A failure here used to be swallowed silently.
      toast.error(err instanceof ApiError ? err.message : 'הסנכרון נכשל');
    } finally {
      setSyncing(false);
    }
  }

  function afterSave() {
    setCreatingOn(null);
    setEditing(null);
    void loadEvents();
  }

  const selectedDay = selected ? days.find((d) => d.iso === selected) : undefined;
  const selectedCalendar = calendars.find((c) => c.id === calendarId);
  const hebrewLabel = hebrewRangeLabel(days.length ? days : []);
  const gregorianLabel =
    view === 'week'
      ? `${days[0]?.dayOfMonth ?? ''}–${days[6]?.dayOfMonth ?? ''} ב${GREGORIAN_MONTHS_HE[anchorMonth - 1]} ${anchorYear}`
      : `${GREGORIAN_MONTHS_HE[anchorMonth - 1]} ${anchorYear}`;

  const viewProps = {
    days,
    eventsByDate,
    selected,
    onSelect: setSelected,
    onCreate: setCreatingOn,
    onOpenEvent: setEditing,
  };

  return (
    <div className="calendar-page">
      <CalendarHeader
        hebrewLabel={hebrewLabel}
        gregorianLabel={gregorianLabel}
        view={view}
        onViewChange={setView}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        calendars={calendars}
        calendarId={calendarId}
        onCalendarChange={setCalendarId}
        syncing={syncing}
        canSync={Boolean(selectedCalendar?.connectionId)}
        onSync={syncNow}
      />

      <div className={`calendar-body${selectedDay ? ' has-drawer' : ''}`}>
        <div className="calendar-main">
          {view === 'month' && <MonthView {...viewProps} loading={loading} />}
          {view === 'week' && <WeekView {...viewProps} tzid={tzid} />}
          {view === 'agenda' && <AgendaView {...viewProps} tzid={tzid} />}
          {view === 'year' && (
            <HebrewYearView
              hebrewYear={days[0]?.hebrewYear ?? 5786}
              selected={selected}
              onSelectMonth={(m) => {
                const span = hebrewMonthSpan(days[0]?.hebrewYear ?? 5786, m);
                setAnchor(span.startIso);
                setView('month');
              }}
            />
          )}
        </div>

        {selectedDay && (
          <DayDrawer
            day={selectedDay}
            events={eventsByDate.get(selectedDay.iso) ?? []}
            geo={geo}
            tzid={tzid}
            onClose={() => setSelected(null)}
            onCreate={setCreatingOn}
            onOpenEvent={setEditing}
          />
        )}
      </div>

      {creatingOn && calendarId && (
        <EventModal
          calendarId={calendarId}
          dateIso={creatingOn}
          tzid={tzid}
          onClose={() => setCreatingOn(null)}
          onSaved={afterSave}
        />
      )}
      {editing && calendarId && (
        <EventModal
          calendarId={calendarId}
          event={editing}
          tzid={tzid}
          onClose={() => setEditing(null)}
          onSaved={afterSave}
        />
      )}
    </div>
  );
}
