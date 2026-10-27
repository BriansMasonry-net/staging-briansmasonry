// Admin dates read in the business's own time zone, whatever the Worker's is.
const when = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatWhen(value: string | Date): string {
  return when.format(new Date(value));
}

/** tel: href from whatever the visitor typed. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
