import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

for (const dir of ['test-results', 'playwright-report']) {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true })
}
