import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || 'unknown';

  const title = "יום הולדת 80 לעמיר ז'ביליק 🚜";
  const origin = request.nextUrl.origin;
  const description = `נשמח לראותכם! לפרטים ואישור הגעה: ${origin}/?id=${id}`;
  const location = "מוזיאון הטרקטור בעין ורד";
  
  // June 5, 2026, 20:00 IDT -> 17:00 UTC
  // June 6, 2026, 00:00 IDT -> 21:00 UTC
  const start = "20260605T170000Z";
  const end = "20260605T210000Z";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Amir80//RSVP//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  return new Response(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="event.ics"',
    },
  });
}
