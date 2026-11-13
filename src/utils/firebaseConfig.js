let firebaseUrl = ''
let firebaseAuth = ''
let serviceAccountPath = ''

try {
    const config = require('../../data/config.json')
    if (config && config.firebaseUrl && !config.firebaseUrl.includes('seu-projeto')) {
        firebaseUrl = String(config.firebaseUrl).trim()
    }
    if (config && config.firebaseAuth) {
        firebaseAuth = String(config.firebaseAuth).trim()
    }
    if (config && config.firebaseServiceAccount) {
        serviceAccountPath = String(config.firebaseServiceAccount).trim()
    }
} catch {}

// As variáveis de ambiente têm prioridade sobre o config.json (evita deixar o segredo em arquivo)
if (process.env.FIREBASE_AUTH) {
    firebaseAuth = String(process.env.FIREBASE_AUTH).trim()
}
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccountPath = String(process.env.FIREBASE_SERVICE_ACCOUNT).trim()
}

firebaseUrl = firebaseUrl.replace(/\/+$/, '')
const firebaseHost = firebaseUrl.replace(/^https?:\/\//, '')

const contaDeServico = require('./firebaseServiceAccount')
const serviceAccount = firebaseUrl && serviceAccountPath ? contaDeServico.carregar(serviceAccountPath) : null

if (firebaseUrl) {
    if (serviceAccount) {
        console.log(`[FIREBASE] 🔐 Autenticação via service account ativada (${serviceAccount.client_email}).`)
    } else if (firebaseAuth) {
        console.log('[FIREBASE] 🔐 Autenticação via firebaseAuth ativada.')
    } else {
        console.warn('[FIREBASE] ⚠️ Sem autenticação: as requisições vão anónimas e só funcionam com as regras do banco abertas, o que permite que qualquer pessoa com a URL leia e altere os dados. Defina "firebaseServiceAccount" (caminho do JSON da conta de serviço) no config.json ou a variável FIREBASE_SERVICE_ACCOUNT.')
    }
}

const https = require('https')

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 64,
    maxFreeSockets: 16,
    keepAliveMsecs: 15000
})

// Com conta de serviço, cada pedido leva um token de acesso (válido 1 h, renovado sozinho).
// Esse token tem acesso de administrador: o bot continua a funcionar com as regras fechadas.
let tokenAtual = null

async function prepararAutenticacao(forcarNovo = false) {
    if (!serviceAccount) return
    try {
        tokenAtual = await contaDeServico.obterToken(serviceAccount, { forcarNovo })
    } catch (err) {
        tokenAtual = null
        console.error('[FIREBASE] ❌ Não foi possível obter o token da conta de serviço:', err.message)
    }
}

function buildFirebaseUrl(path) {
    let cleanPath = (path || '').replace(/^\/+/, '')
    const params = new URLSearchParams()
    if (cleanPath.includes('?')) {
        const idx = cleanPath.indexOf('?')
        for (const [k, v] of new URLSearchParams(cleanPath.slice(idx + 1))) params.append(k, v)
        cleanPath = cleanPath.slice(0, idx)
    }
    if (serviceAccount) {
        if (tokenAtual) params.set('access_token', tokenAtual)
    } else if (firebaseAuth) {
        params.set('auth', firebaseAuth)
    }
    const query = params.toString()
    return `${firebaseUrl}/${cleanPath}.json${query ? '?' + query : ''}`
}

// Antes de cada pedido: garante um token válido. Se o servidor responder 401 (token
// expirado ou revogado), pede um token novo e repete o pedido uma vez.
async function comAutenticacao(executar) {
    await prepararAutenticacao()
    const primeiro = await executar()
    if (primeiro && primeiro.status === 401 && serviceAccount) {
        await prepararAutenticacao(true)
        return executar()
    }
    return primeiro
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

function pedidoGet(path, isRetry = false) {
    return new Promise(res => {
        const url = buildFirebaseUrl(path)
        const req = https.get(url, { agent: isRetry ? false : httpsAgent, timeout: 5000 }, r => {
            let d = ''
            r.on('data', c => d += c)
            r.on('end', () => {
                const parsed = parseFirebaseResponse(r.statusCode, d)
                if (!parsed.ok) {
                    if (r.statusCode !== 401) console.error('[GET_ERROR]', String(path).split('?')[0], parsed.error)
                    return res({ status: r.statusCode, data: null })
                }
                res({ status: r.statusCode, data: parsed.data })
            })
        })
        req.on('error', (err) => {
            if (!isRetry && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                return pedidoGet(path, true).then(res)
            }
            res({ status: 0, data: null })
        })
        req.on('timeout', () => {
            req.destroy()
            if (!isRetry) {
                return pedidoGet(path, true).then(res)
            }
            res({ status: 0, data: null })
        })
    })
}

async function fetchFirebase(path) {
    if (!firebaseUrl) return null
    const r = await comAutenticacao(() => pedidoGet(path))
    if (r.status === 401) console.error('[GET_ERROR]', String(path).split('?')[0], 'HTTP 401 (sem autorização)')
    return r.data
}

async function putFirebase(path, data) {
    if (!firebaseUrl) return false
    const r = await comAutenticacao(() => putPedido(path, data))
    if (r.status === 401) console.error('[PUT_ERROR]', path, 'HTTP 401 (sem autorização)')
    return r.ok
}

function putPedido(path, data, isRetry = false) {
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
                res({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode })
            })
            req.on('error', (err) => {
                if (!isRetry && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                    return putPedido(path, data, true).then(res)
                }
                console.error('[PUT_ERROR]', path, err.message)
                res({ ok: false, status: 0 })
            })
            req.on('timeout', () => {
                req.destroy()
                if (!isRetry) {
                    return putPedido(path, data, true).then(res)
                }
                console.error('[PUT_TIMEOUT]', path)
                res({ ok: false, status: 0 })
            })
            req.write(pData)
            req.end()
        } catch (err) {
            console.error('[PUT_EXCEPTION]', path, err.message)
            res({ ok: false, status: 0 })
        }
    })
}

async function patchFirebase(path, data) {
    if (!firebaseUrl) return false
    const r = await comAutenticacao(() => patchPedido(path, data))
    if (r.status === 401) console.error('[PATCH_ERROR]', path, 'HTTP 401 (sem autorização)')
    return r.ok
}

function patchPedido(path, data, isRetry = false) {
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
                res({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode })
            })
            req.on('error', (err) => {
                if (!isRetry && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                    return patchPedido(path, data, true).then(res)
                }
                console.error('[PATCH_ERROR]', path, err.message)
                res({ ok: false, status: 0 })
            })
            req.on('timeout', () => {
                req.destroy()
                if (!isRetry) {
                    return patchPedido(path, data, true).then(res)
                }
                console.error('[PATCH_TIMEOUT]', path)
                res({ ok: false, status: 0 })
            })
            req.write(pData)
            req.end()
        } catch (err) {
            console.error('[PATCH_EXCEPTION]', path, err.message)
            res({ ok: false, status: 0 })
        }
    })
}

async function deleteFirebase(path) {
    if (!firebaseUrl) return false
    const r = await comAutenticacao(() => deletePedido(path))
    return r.ok
}

function deletePedido(path) {
    return new Promise(res => {
        try {
            const url = buildFirebaseUrl(path)
            const req = https.request(url, {
                method: 'DELETE',
                agent: httpsAgent,
                timeout: 10000
            }, r => {
                r.resume()
                res({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode })
            })
            req.on('error', () => res({ ok: false, status: 0 }))
            req.on('timeout', () => { req.destroy(); res({ ok: false, status: 0 }) })
            req.end()
        } catch {
            res({ ok: false, status: 0 })
        }
    })
}

module.exports = {
    FIREBASE_DB_URL: firebaseUrl,
    FIREBASE_HOST: firebaseHost,
    FIREBASE_AUTH_ENABLED: !!(serviceAccount || firebaseAuth),
    FIREBASE_SERVICE_ACCOUNT_ENABLED: !!serviceAccount,
    prepararAutenticacao,
    httpsAgent,
    buildFirebaseUrl,
    fetchFirebase,
    putFirebase,
    patchFirebase,
    deleteFirebase
}
