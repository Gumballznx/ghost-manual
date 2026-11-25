const { concorrentesStore } = require('./firebaseDataLayer')
const { fetchFirebase, putFirebase } = require('./firebaseConfig')

const SYNC_TTL_MS = 15000
let lastSyncAt = 0
let intervalStarted = false

function mesclarListasGlobal(...listas) {
    const vistos = new Set()
    const resultado = []
    for (const lista of listas) {
        if (!Array.isArray(lista)) continue
        for (const item of lista) {
            const val = String(item || '').trim()
            if (val && !vistos.has(val)) {
                vistos.add(val)
                resultado.push(val)
            }
        }
    }
    return resultado
}

function obterCacheGlobal() {
    const dados = concorrentesStore.loadSync() || {}
    return Array.isArray(dados.global) ? dados.global : []
}

function atualizarCacheGlobal(listaMesclada) {
    const cache = concorrentesStore.getCache()
    if (cache && typeof cache === 'object') {
        cache.global = listaMesclada
        return cache
    }
    const dados = concorrentesStore.loadSync() || {}
    dados.global = listaMesclada
    return dados
}

async function sincronizarConcorrentesAgora(force = false) {
    const agora = Date.now()
    if (!force && lastSyncAt > 0 && (agora - lastSyncAt) < SYNC_TTL_MS) {
        return obterCacheGlobal()
    }
    try {
        const fbGlobal = await Promise.race([
            fetchFirebase('bot_data/concorrentes/global'),
            new Promise(resolve => setTimeout(() => resolve(undefined), 2000))
        ])
        if (fbGlobal !== undefined) {
            lastSyncAt = Date.now()
            const remoto = Array.isArray(fbGlobal) ? fbGlobal : []
            const local = obterCacheGlobal()
            const mesclado = mesclarListasGlobal(remoto, local)
            atualizarCacheGlobal(mesclado)
            return mesclado
        }
    } catch {}
    return obterCacheGlobal()
}

async function adicionarConcorrentesGlobal(novosIds = []) {
    const novosLimpos = mesclarListasGlobal(novosIds)
    const localAntes = obterCacheGlobal()

    let baseAntes = localAntes
    let remotoOk = false
    try {
        const fbGlobal = await Promise.race([
            fetchFirebase('bot_data/concorrentes/global'),
            new Promise(resolve => setTimeout(() => resolve(undefined), 2500))
        ])
        if (fbGlobal !== undefined) {
            remotoOk = true
            lastSyncAt = Date.now()
            const remoto = Array.isArray(fbGlobal) ? fbGlobal : []
            baseAntes = mesclarListasGlobal(remoto, localAntes)
        }
    } catch {}

    const baseSet = new Set(baseAntes)
    const adicionados = novosLimpos.filter(id => !baseSet.has(id)).length
    const finalGlobal = mesclarListasGlobal(baseAntes, novosLimpos)

    const dados = atualizarCacheGlobal(finalGlobal)

    let salvoFirebase = false
    try {
        salvoFirebase = await putFirebase('bot_data/concorrentes/global', finalGlobal)
    } catch {}

    if (!salvoFirebase && !remotoOk) {
        concorrentesStore.save(dados, true)
    }

    return {
        global: finalGlobal,
        totalGlobal: finalGlobal.length,
        adicionados
    }
}

function iniciarSyncConcorrentes() {
    if (intervalStarted) return
    intervalStarted = true
    const t = setInterval(() => {
        sincronizarConcorrentesAgora(true).catch(() => {})
    }, 60000)
    if (t.unref) t.unref()
}

module.exports = {
    mesclarListasGlobal,
    sincronizarConcorrentesAgora,
    adicionarConcorrentesGlobal,
    iniciarSyncConcorrentes
}
