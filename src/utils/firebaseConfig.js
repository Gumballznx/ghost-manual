let firebaseUrl = ''
let firebaseAuth = ''

try {
    const config = require('../../data/config.json')
    if (config && config.firebaseUrl && !config.firebaseUrl.includes('seu-projeto')) {
        firebaseUrl = String(config.firebaseUrl).trim()
    }
    if (config && config.firebaseAuth) {
        firebaseAuth = String(config.firebaseAuth).trim()
    }
} catch {}

// A variável de ambiente tem prioridade sobre o config.json (evita deixar o segredo em arquivo)
if (process.env.FIREBASE_AUTH) {
    firebaseAuth = String(process.env.FIREBASE_AUTH).trim()
}

if (firebaseUrl && !firebaseAuth) {
    console.warn('[FIREBASE] ⚠️ firebaseAuth não definido: as requisições vão sem autenticação. As regras do banco precisam estar abertas, o que permite que qualquer pessoa com a URL leia e altere os dados. Defina "firebaseAuth" no config.json ou a variável FIREBASE_AUTH.')
}

firebaseUrl = firebaseUrl.replace(/\/+$/, '')
const firebaseHost = firebaseUrl.replace(/^https?:\/\//, '')

const https = require('https')

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 64,
    maxFreeSockets: 16,
    keepAliveMsecs: 15000
})

function buildFirebaseUrl(path) {
    let cleanPath = (path || '').replace(/^\/+/, '')
    const params = new URLSearchParams()
    if (cleanPath.includes('?')) {
        const idx = cleanPath.indexOf('?')
        for (const [k, v] of new URLSearchParams(cleanPath.slice(idx + 1))) params.append(k, v)
        cleanPath = cleanPath.slice(0, idx)
    }
    if (firebaseAuth) params.set('auth', firebaseAuth)
    const query = params.toString()
    return `${firebaseUrl}/${cleanPath}.json${query ? '?' + query : ''}`
}

// Só aceita respostas 2xx que não sejam um objeto de erro do Firebase.
// Sem isso, um {"error":"Permission denied"} viraria "dado" e sobrescreveria o backup local.
function parseFirebaseResponse(statusCode, body) {
    if (statusCode < 200 || statusCode >= 300) return { ok: false, error: `HTTP ${statusCode}` }
    let data
    try { data = JSON.parse(body) } catch { return { ok: false, error: 'JSON inválido' } }
    if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.error === 'string' && Object.keys(data).length === 1) {
        return { ok: false, error: data.error }
    }
    return { ok: true, data }
}

function fetchFirebase(path, isRetry = false) {
    if (!firebaseUrl) return Promise.resolve(null)
    return new Promise(res => {
        const url = buildFirebaseUrl(path)
        const req = https.get(url, { agent: isRetry ? false : httpsAgent, timeout: 5000 }, r => {
            let d = ''
            r.on('data', c => d += c)
            r.on('end', () => {
                const parsed = parseFirebaseResponse(r.statusCode, d)
                if (!parsed.ok) {
                    console.error('[GET_ERROR]', String(path).split('?')[0], parsed.error)
                    return res(null)
                }
                res(parsed.data)
            })
        })
        req.on('error', (err) => {
            if (!isRetry && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                return fetchFirebase(path, true).then(res)
            }
            res(null)
        })
        req.on('timeout', () => {
            req.destroy()
            if (!isRetry) {
                return fetchFirebase(path, true).then(res)
            }
            res(null)
        })
    })
}

function putFirebase(path, data, isRetry = false) {
    if (!firebaseUrl) return Promise.resolve(false)
    return new Promise(res => {
        try {
            const pData = JSON.stringify(data)
            const url = buildFirebaseUrl(path)
            const req = https.request(url, {
                method: 'PUT',
                agent: isRetry ? false : httpsAgent,
                timeout: 5000,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pData) }
            }, r => {
                r.resume()
                res(r.statusCode >= 200 && r.statusCode < 300)
            })
            req.on('error', (err) => {
                if (!isRetry && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                    return putFirebase(path, data, true).then(res)
                }
                console.error('[PUT_ERROR]', path, err.message)
                res(false)
            })
            req.on('timeout', () => {
                req.destroy()
                if (!isRetry) {
                    return putFirebase(path, data, true).then(res)
                }
                console.error('[PUT_TIMEOUT]', path)
                res(false)
            })
            req.write(pData)
            req.end()
        } catch (err) {
            console.error('[PUT_EXCEPTION]', path, err.message)
            res(false)
        }
    })
}

function patchFirebase(path, data, isRetry = false) {
    if (!firebaseUrl) return Promise.resolve(false)
    return new Promise(res => {
        try {
            const pData = JSON.stringify(data)
            const url = buildFirebaseUrl(path)
            const req = https.request(url, {
                method: 'PATCH',
                agent: isRetry ? false : httpsAgent,
                timeout: 5000,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pData) }
            }, r => {
                r.resume()
                res(r.statusCode >= 200 && r.statusCode < 300)
            })
            req.on('error', (err) => {
                if (!isRetry && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                    return patchFirebase(path, data, true).then(res)
                }
                console.error('[PATCH_ERROR]', path, err.message)
                res(false)
            })
            req.on('timeout', () => {
                req.destroy()
                if (!isRetry) {
                    return patchFirebase(path, data, true).then(res)
                }
                console.error('[PATCH_TIMEOUT]', path)
                res(false)
            })
            req.write(pData)
            req.end()
        } catch (err) {
            console.error('[PATCH_EXCEPTION]', path, err.message)
            res(false)
        }
    })
}

function deleteFirebase(path) {
    if (!firebaseUrl) return Promise.resolve(false)
    return new Promise(res => {
        try {
            const url = buildFirebaseUrl(path)
            const req = https.request(url, {
                method: 'DELETE',
                agent: httpsAgent,
                timeout: 10000
            }, r => {
                r.resume()
                res(r.statusCode >= 200 && r.statusCode < 300)
            })
            req.on('error', () => res(false))
            req.on('timeout', () => { req.destroy(); res(false) })
            req.end()
        } catch {
            res(false)
        }
    })
}

module.exports = {
    FIREBASE_DB_URL: firebaseUrl,
    FIREBASE_HOST: firebaseHost,
    FIREBASE_AUTH_ENABLED: !!firebaseAuth,
    httpsAgent,
    buildFirebaseUrl,
    fetchFirebase,
    putFirebase,
    patchFirebase,
    deleteFirebase
}
