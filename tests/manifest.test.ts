import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const manifest = JSON.parse(read('package.json')) as Record<string, any>

describe('package identity', () => {
  it('is dsh-btw 0.1.0 and needs DeepSeek Harness 0.2.1-rc.1 or later', () => {
    expect(manifest.name).toBe('dsh-btw')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.engines.dsh).toBe('>=0.2.1-rc.1')
  })

  it('shows the package name on the Plugins page in both languages', () => {
    for (const language of ['zh', 'en']) {
      expect(JSON.parse(read(`locale/${language}.json`)).meta.title).toBe('dsh-btw')
    }
  })

  it('inserts one row named after the package', () => {
    expect(read('cordis.patch.yml')).toMatch(/- id: dsh-btw\n\s+name: dsh-btw\n/u)
  })

  it('ships a web client bundle built from this version', () => {
    expect(manifest.dsh.client.platform).toBe('web')
    expect(read('lib/client.js').startsWith(`/* dsh-btw ${manifest.version} `)).toBe(true)
  })
})
