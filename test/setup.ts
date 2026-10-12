import { clearCache } from '@dn/server'
import { beforeEach } from 'vitest'

// Tests change data between requests; a cached shared read would hide the change.
beforeEach(() => clearCache())
