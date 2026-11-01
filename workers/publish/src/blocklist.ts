// Known-spam source domains for agent submissions (hard block, checked in
// code before any Jev call). Match is on the source_url hostname, including
// subdomains. Keep this list small and evidence-based: add a domain only
// after it actually submits spam. Seeded with obvious throwaway/spam hosts.
export const SPAM_DOMAIN_BLOCKLIST: ReadonlySet<string> = new Set([
  'spam.example',
  'free-money.example',
  'tempmail.spam',
  'guerrillamail.com',
  'mailinator.com',
  '10minutemail.com',
  'yopmail.com',
]);

export function isBlockedDomain(sourceUrl?: string): boolean {
  if (!sourceUrl) return false;
  let host: string;
  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  for (const d of SPAM_DOMAIN_BLOCKLIST) {
    if (host === d || host.endsWith(`.${d}`)) return true;
  }
  return false;
}
