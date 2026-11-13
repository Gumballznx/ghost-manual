// Autenticação no Firebase Realtime Database com uma conta de serviço do Google,
// sem dependências extra: assina um JWT com a chave privada da conta e troca-o por um
// token de acesso OAuth2 (válido 1 h). O token vai em cada pedido REST como `access_token`.
//
// O ficheiro JSON da conta de serviço NUNCA vai para o repositório (.gitignore já bloqueia
// *firebase-adminsdk*.json): fica só no servidor e é indicado pelo caminho em
// data/config.json ("firebaseServiceAccount") ou na variável FIREBASE_SERVICE_ACCOUNT.

const crypto = require('crypto')
const fs = require('fs')
const https = require('https')

const URL_TOKEN = 'https://oauth2.googleapis.com/token'
const ESCOPOS = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/firebase.database'
].join(' ')
// Renova o token 5 minutos antes de expirar.
const MARGEM_RENOVACAO_MS = 5 * 60 * 1000

function carregar(caminho) {
    try {
        const conta = JSON.parse(fs.readFileSync(caminho, 'utf8'))
        if (!conta.client_email || !conta.private_key) {
            console.error('[FIREBASE] ❌ O ficheiro da conta de serviço não tem client_email/private_key:', caminho)
            return null
        }
        return conta
    } catch (err) {
        console.error('[FIREBASE] ❌ Não foi possível ler a conta de serviço em', caminho, '-', err.message)
        return null
    }
}

function base64url(dados) {
    return Buffer.from(dados).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** JWT assinado (RS256) que a Google troca por um token de acesso. */
function criarJwt(conta, agoraSeg = Math.floor(Date.now() / 1000)) {
    const cabecalho = { alg: 'RS256', typ: 'JWT' }
    if (conta.private_key_id) cabecalho.kid = conta.private_key_id
    const corpo = {
        iss: conta.client_email,
        scope: ESCOPOS,
        aud: conta.token_uri || URL_TOKEN,
        iat: agoraSeg,
        exp: agoraSeg + 3600
    }
    const semAssinatura = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`
    const assinatura = crypto.createSign('RSA-SHA256').update(semAssinatura).sign(conta.private_key)
    return `${semAssinatura}.${base64url(assinatura)}`
}

function pedirTokenAGoogle(conta) {
    const corpo = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: criarJwt(conta)
    }).toString()
    return new Promise((resolve, reject) => {
        const req = https.request(conta.token_uri || URL_TOKEN, {
            method: 'POST',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(corpo)
            }
        }, r => {
            let d = ''
            r.on('data', c => d += c)
            r.on('end', () => {
                let json = null
                try { json = JSON.parse(d) } catch {}
                if (r.statusCode === 200 && json && json.access_token) {
                    return resolve({ token: json.access_token, expiraEm: Date.now() + (Number(json.expires_in) || 3600) * 1000 })
                }
                reject(new Error(`HTTP ${r.statusCode}${json && json.error ? ` (${json.error}${json.error_description ? ': ' + json.error_description : ''})` : ''}`))
            })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('tempo esgotado ao pedir o token')) })
        req.write(corpo)
        req.end()
    })
}

let emCache = null
let pedidoEmCurso = null

/**
 * Token de acesso válido. Reaproveita o atual até 5 min antes de expirar e nunca faz
 * dois pedidos à Google ao mesmo tempo. `pedir` só existe para os testes.
 */
async function obterToken(conta, { forcarNovo = false, pedir = pedirTokenAGoogle, agora = Date.now } = {}) {
    if (!forcarNovo && emCache && emCache.expiraEm - MARGEM_RENOVACAO_MS > agora()) return emCache.token
    if (!pedidoEmCurso) {
        pedidoEmCurso = pedir(conta)
            .then(novo => { emCache = novo; return novo.token })
            .finally(() => { pedidoEmCurso = null })
    }
    return pedidoEmCurso
}

function _limparCache() {
    emCache = null
    pedidoEmCurso = null
}

module.exports = { carregar, criarJwt, obterToken, _limparCache }
