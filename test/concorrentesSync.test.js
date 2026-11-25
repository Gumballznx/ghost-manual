const test = require('node:test')
const assert = require('node:assert/strict')

function salvarCache(modPath) {
  const resolved = require.resolve(modPath)
  const had = Object.prototype.hasOwnProperty.call(require.cache, resolved)
  const prev = require.cache[resolved]
  return () => {
    if (had) require.cache[resolved] = prev
    else delete require.cache[resolved]
  }
}

function limparModulo(modPath) {
  try { delete require.cache[require.resolve(modPath)] } catch {}
}

test('concorrentesSync mescla lista remota e local no ghost-manual sem sobrescrever', async (t) => {
  const restorers = []
  const modPath = '../src/utils/concorrentesSync'
  const stub = (p, val) => {
    restorers.push(salvarCache(p))
    const resolved = require.resolve(p)
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: val }
  }

  t.after(() => {
    for (const r of restorers.reverse()) r()
    limparModulo(modPath)
  })

  const cacheObj = { global: ['258841111111'] }
  let salvoRemoto = null

  stub('../src/utils/firebaseDataLayer', {
    concorrentesStore: {
      loadSync: () => cacheObj,
      getCache: () => cacheObj,
      save: () => {}
    }
  })
  stub('../src/utils/firebaseConfig', {
    fetchFirebase: async () => ['258841111111', '258842222222'],
    putFirebase: async (p, val) => {
      if (p === 'bot_data/concorrentes/global') salvoRemoto = val
      return true
    }
  })

  limparModulo(modPath)
  const { adicionarConcorrentesGlobal } = require(modPath)
  const res = await adicionarConcorrentesGlobal(['258843333333', '258842222222'])

  assert.equal(res.adicionados, 1)
  assert.deepEqual(salvoRemoto, ['258841111111', '258842222222', '258843333333'])
  assert.deepEqual(cacheObj.global, ['258841111111', '258842222222', '258843333333'])
})
