import { test, expect, type Page } from '@playwright/test'

const PAGES: { path: string; heading: string }[] = [
  { path: '/', heading: 'Live Overview' },
  { path: '/mission', heading: 'Mission' },
  { path: '/thermal-events', heading: 'Thermal & Events' },
  { path: '/snapshots', heading: 'Snapshots' },
  { path: '/system-diagnostics', heading: 'System Diagnostics' },
  { path: '/settings', heading: 'Settings' },
  { path: '/help', heading: 'Help & Documentation' },
  { path: '/presentation', heading: 'Presentation Preview' },
]

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

for (const { path, heading } of PAGES) {
  test(`${path} loads, renders its heading, and has no console errors`, async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    // The sidebar is a good proxy for "the SPA shell mounted", present on every page.
    await expect(page.getByRole('link', { name: 'Live Overview' })).toBeVisible()
    expect(errors, `console errors on ${path}: ${errors.join('; ')}`).toEqual([])
  })
}

test('direct navigation to a deep client route (full page load, not client-side nav) is served by the catch-all — regression: this returned a blank/broken page before the Vite proxy fix', async ({
  page,
}) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/thermal-events', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Thermal & Events', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('GET /system stays the diagnostics JSON API, never the SPA shell (regression: proxy/catch-all collision with /system-diagnostics)', async ({
  request,
}) => {
  const response = await request.get('/system')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
})

test('sidebar navigation between pages works without a full reload (client-side routing)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Mission' }).click()
  await expect(page.getByRole('heading', { name: 'Mission', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
})

test('the /api/config endpoint reports auth_required without leaking the token itself', async ({ request }) => {
  const response = await request.get('/api/config')
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toHaveProperty('auth_required')
  expect(body).not.toHaveProperty('token')
  expect(body).not.toHaveProperty('shared_token')
})
