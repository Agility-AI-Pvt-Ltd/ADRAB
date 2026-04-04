import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import type { Submission } from '../types';
import { Avatar } from './shared';

const START_HOUR = 9;
const END_HOUR = 19;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Generate 28 scrollable days (21 days in past, 6 days in future)
function getScrollableDays(baseDate: Date) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 21);
  return Array.from({ length: 28 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function yPos(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const decimalHour = h + m / 60;
  if (decimalHour < START_HOUR || decimalHour > END_HOUR) return null;
  // 1 hour = 80px block height
  return (decimalHour - START_HOUR) * 80;
}

export default function CalendarTimeline({
  submissions,
  onSelect,
}: {
  submissions: Submission[];
  onSelect?: (submission: Submission) => void;
}) {
  const [baseDate] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const scrollDays = useMemo(() => getScrollableDays(baseDate), [baseDate]);
  
  // Format MM-DD for string comparison
  const getFmt = (d: Date) => `${d.getMonth()}-${d.getDate()}`;
  
  const todayFmt = getFmt(new Date());

  // Auto-scroll near the end on mount
  useLayoutEffect(() => {
    if (scrollRef.current) {
      // scroll near the end so today is visible
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  // Filter submissions to visible range and group by day
  const eventsByDay = useMemo(() => {
    const groups: Record<number, Submission[]> = {};
    for (let i = 0; i < scrollDays.length; i++) groups[i] = [];

    const startAt = scrollDays[0].getTime();
    const endAt = scrollDays[scrollDays.length - 1].getTime() + 86400000;

    submissions.forEach(sub => {
      if (!sub.submitted_at && !sub.created_at) return;
      const d = new Date(sub.submitted_at ?? sub.created_at);
      const t = d.getTime();
      
      if (t >= startAt && t < endAt) {
        // Calculate day index safely (ignoring daylight saving shifts)
        const dStart = new Date(d);
        dStart.setHours(0, 0, 0, 0);
        const dayIdx = Math.round((dStart.getTime() - startAt) / 86400000);
        if (dayIdx >= 0 && dayIdx < scrollDays.length) {
          groups[dayIdx].push(sub);
        }
      }
    });
    return groups;
  }, [submissions, scrollDays]);

  return (
    <div className="calendar-card">
      <div className="calendar-header">
        <h3 className="calendar-title">Tasks overview</h3>
      </div>

      <div className="calendar-grid">
        {/* Timeline (Left Axis) */}
        <div className="calendar-axis-y">
          {HOURS.map(h => (
            <div key={h} className="calendar-time-label">
              {h.toString().padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Days Columns */}
        <div className="calendar-days-container" ref={scrollRef}>
          {/* Days Header */}
          <div className="calendar-days-header" style={{ gridTemplateColumns: `repeat(${scrollDays.length}, minmax(130px, 1fr))` }}>
            {scrollDays.map((date, i) => {
              const isToday = getFmt(date) === todayFmt;
              // Add a slight transparency to far past dates to match visual hierarchy
              const isPast = date.getTime() < new Date().setHours(0,0,0,0);
              
              return (
                <div key={i} className={`calendar-day-head ${isToday ? 'active' : ''}`} style={{ opacity: isToday ? 1 : isPast ? 0.6 : 0.8 }}>
                  <div className="calendar-day-name">{DAY_NAMES[date.getDay()]}</div>
                  <div className="calendar-day-num">{date.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Tracks Area */}
          <div className="calendar-tracks" style={{ height: `${(END_HOUR - START_HOUR + 1) * 80}px`, gridTemplateColumns: `repeat(${scrollDays.length}, minmax(130px, 1fr))` }}>
            {/* Background Dashed Lines */}
            <div className="calendar-bg-lines" style={{ gridTemplateColumns: `repeat(${scrollDays.length}, minmax(130px, 1fr))` }}>
              {scrollDays.map((_, i) => (
                <div key={i} className="calendar-bg-line" />
              ))}
            </div>

            {/* Event Blocks plotted via Absolute Positioning */}
            {scrollDays.map((_, dayIdx) => (
              <div key={dayIdx} className="calendar-track">
                {eventsByDay[dayIdx].map(sub => {
                  const top = yPos(sub.submitted_at ?? sub.created_at);
                  if (top === null) return null;

                  // Determine status/score color themes
                  let theme = 'gray';
                  if (sub.status === 'approved') theme = 'green';
                  else if (sub.status === 'rejected') theme = 'red';
                  else if (sub.ai_score && sub.ai_score > 75) theme = 'blue';

                  return (
                    <div
                      key={sub.id}
                      className={`calendar-event ${theme}`}
                      style={{ top: `${top}px`, height: '80px' }}
                      onClick={() => onSelect?.(sub)}
                      role={onSelect ? 'button' : undefined}
                      tabIndex={onSelect ? 0 : undefined}
                      onKeyDown={(event) => {
                        if (!onSelect) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(sub);
                        }
                      }}
                    >
                      <div className="calendar-event-content">
                        <div className="calendar-event-title">
                          {sub.doc_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="calendar-event-desc">
                          {sub.content.substring(0, 45)}...
                        </div>
                      </div>
                      <div className="calendar-event-avatars">
                        <Avatar name={sub.author?.name} email={sub.author?.email} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
