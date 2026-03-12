/**
 * Seed the review queue with synthetic feedback reports for testing.
 *
 * Required env vars:
 *   SEED_BASE_URL         - e.g. https://ai-devops-nexus-web.onrender.com
 *   SEED_PROJECT_ID       - UUID of the project to seed reports into
 *   SEED_SERVICE_TOKEN    - A service token with internal:read scope
 *   SEED_COUNT            - (optional) number of reports to create, default 5
 */
import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const REPORT_TEMPLATES = [
  {
    title: 'Checkout button unresponsive on mobile Safari',
    pageUrl: 'https://open-travel.example.test/checkout',
    environment: 'production',
    severity: 'critical',
    notes: 'Users on iPhone 14 / Safari 17 report the "Book Now" button does nothing on first tap. Second tap sometimes works. Reproducible on checkout step 2.',
    reporter: { email: 'tester-mobile@example.test', role: 'end-user' }
  },
  {
    title: 'Trip dates overlap validation missing',
    pageUrl: 'https://open-travel.example.test/trips/new',
    environment: 'production',
    severity: 'high',
    notes: 'Users can save a trip with a return date before the departure date. No client-side or server-side validation catches this.',
    reporter: { email: 'qa-team@example.test', role: 'qa' }
  },
  {
    title: 'Expense list shows NaN for USD amounts',
    pageUrl: 'https://open-travel.example.test/trips/123/expenses',
    environment: 'production',
    severity: 'high',
    notes: 'When currency is USD and amount contains a comma (e.g. "1,200"), the total displays as NaN. Issue is in the expense parsing logic.',
    reporter: { email: 'finance-user@example.test', role: 'end-user' }
  },
  {
    title: 'Page title missing on trip detail view',
    pageUrl: 'https://open-travel.example.test/trips/456',
    environment: 'production',
    severity: 'medium',
    notes: 'Browser tab shows the app name but not the trip name. The <title> tag is not being set dynamically on the trip detail route.',
    reporter: { email: 'seo-team@example.test', role: 'developer' }
  },
  {
    title: 'Sign out button not visible on small screens',
    pageUrl: 'https://open-travel.example.test/dashboard',
    environment: 'production',
    severity: 'medium',
    notes: 'On screens below 400px the header overflows and the Sign Out button is clipped. No scrollbar appears so users cannot access it.',
    reporter: { email: 'ux-review@example.test', role: 'end-user' }
  },
  {
    title: 'Document upload silently fails for PDFs over 5MB',
    pageUrl: 'https://open-travel.example.test/trips/789/documents',
    environment: 'production',
    severity: 'high',
    notes: 'Uploading a PDF larger than 5MB shows a spinner then resets without any error message. The file is not saved. Users have no idea it failed.',
    reporter: { email: 'traveler@example.test', role: 'end-user' }
  },
  {
    title: 'Dark mode text contrast too low on cards',
    pageUrl: 'https://open-travel.example.test/dashboard',
    environment: 'production',
    severity: 'low',
    notes: 'In dark mode, secondary text on trip cards uses #999 on a #1a1a1a background — contrast ratio is ~2.8:1, below WCAG AA minimum of 4.5:1.',
    reporter: { email: 'accessibility@example.test', role: 'developer' }
  },
  {
    title: 'Search results do not update on back navigation',
    pageUrl: 'https://open-travel.example.test/search',
    environment: 'production',
    severity: 'medium',
    notes: 'After clicking a result and pressing browser back, the search input retains the previous term but the result list is empty until the user re-submits.',
    reporter: { email: 'power-user@example.test', role: 'end-user' }
  }
];

async function requestJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

async function main(): Promise<void> {
  const baseUrl = requireEnv('SEED_BASE_URL').replace(/\/$/, '');
  const projectId = requireEnv('SEED_PROJECT_ID');
  const serviceToken = requireEnv('SEED_SERVICE_TOKEN');
  const count = Math.min(Number(process.env.SEED_COUNT ?? '5'), REPORT_TEMPLATES.length);

  const authHeaders = { Authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' };

  console.log(`Creating widget session for project ${projectId}...`);
  const session = await requestJson<{ accessToken: string }>(
    `${baseUrl}/internal/projects/${projectId}/widget-session`,
    { method: 'POST', headers: authHeaders, body: JSON.stringify({}) }
  );

  // Fetch project key
  const project = await requestJson<{ projectKey: string }>(
    `${baseUrl}/internal/projects/${projectId}`,
    { method: 'GET', headers: authHeaders }
  );

  console.log(`Submitting ${count} feedback reports to project key "${project.projectKey}"...`);
  for (let i = 0; i < count; i++) {
    const template = REPORT_TEMPLATES[i];
    if (!template) break;
    const result = await requestJson<{ reportId: string }>(
      `${baseUrl}/public/projects/${project.projectKey}/feedback`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nexus-widget-token': session.accessToken,
          origin: 'https://open-travel.example.test'
        },
        body: JSON.stringify({
          title: template.title,
          pageUrl: template.pageUrl,
          environment: template.environment,
          severity: template.severity,
          reporter: template.reporter,
          signals: { consoleErrorCount: 0, networkErrorCount: 0, stakeholderCount: 1 },
          notes: template.notes
        })
      }
    );
    console.log(`  [${i + 1}/${count}] Created report ${result.reportId}: ${template.title}`);
  }

  console.log('Done.');
}

void main().catch((error: unknown) => {
  console.error((error instanceof Error ? error.stack : String(error)));
  process.exit(1);
});
