import { Platform } from 'react-native';
import { createEventInCalendarAsync } from 'expo-calendar/legacy';
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { eventICS, eventSchema, type EventCard } from './rich-message';
export async function addEventToCalendar(input: EventCard) {
  const event = eventSchema.parse(input);
  // The supported system editor needs no calendar-read permission on iOS 17+ or Android.
  if (
    Platform.OS === 'android' ||
    (Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 17)
  ) {
    await createEventInCalendarAsync({
      title: event.title,
      startDate: new Date(event.start),
      endDate: new Date(event.end),
      location: event.location,
      notes: event.notes,
    });
    return;
  }
  // Older iOS can import an explicit event file without granting access to existing calendars.
  const file = new File(Paths.cache, `mnelo-event-${Date.now()}.ics`);
  try {
    file.write(eventICS(event));
    await shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics' });
  } finally {
    if (file.exists) file.delete();
  }
}
