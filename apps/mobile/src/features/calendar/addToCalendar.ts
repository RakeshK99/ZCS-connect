import { parseIsoDay, type CalendarEvent } from '@zcs/core';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

async function writableCalendarId() {
  if (Platform.OS === 'ios') return (await Calendar.getDefaultCalendarAsync()).id;
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return (cals.find((c) => c.isPrimary && c.allowsModifications) ?? cals.find((c) => c.allowsModifications))?.id;
}

function at(day: string, hms: string | null) {
  const d = parseIsoDay(day);
  if (hms) {
    const [h, m] = hms.split(':').map(Number);
    d.setHours(h!, m!, 0, 0);
  }
  return d;
}

/** Adds a school event to the phone's calendar. Returns false if permission was declined. */
export async function addToPhoneCalendar(e: CalendarEvent): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') return false;
  const calendarId = await writableCalendarId();
  if (!calendarId) throw new Error('No calendar on this phone accepts new events.');
  const allDay = !e.start_time;
  const start = at(e.starts_on, e.start_time);
  const end = e.end_time ? at(e.ends_on ?? e.starts_on, e.end_time) : allDay ? at(e.ends_on ?? e.starts_on, null) : new Date(start.getTime() + 60 * 60_000);
  if (allDay) end.setDate(end.getDate() + 1);
  await Calendar.createEventAsync(calendarId, {
    title: e.title, startDate: start, endDate: end, allDay, location: e.location ?? undefined,
    notes: 'From ZCS Connect · Zeeland Christian School', timeZone: 'America/Detroit',
  });
  return true;
}
