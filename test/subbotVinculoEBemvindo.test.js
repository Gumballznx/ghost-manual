const test = require('node:test')
const assert = require('node:assert/strict')
const EventEmitter = require('node:events')
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SUBBOTS_FILE = path.join(ROOT, 'data/subbots.json')
const SESSIONS_DIR = path.join(ROOT, 'session_subbots')

const subbotsExistedBefore = fs.existsSync(SUBBOTS_FILE)
const subbotsBackupBefore = subbotsExistedBefore ? fs.readFileSync(SUBBOTS_FILE, 'utf8') : null
const sessionsExistedBefore = fs.existsSync(SESSIONS_DIR)

const fakeSockets = []
const createdSessionPaths = []

function makeFakeSocket(userJid) {
  const ev = new EventEmitter()
  const sock = {
    ev,
    ws: { close: () => {} },
    user: userJid ? { id: userJid } : null,
    authState: { creds: { registered: true, account: { details: 'ok' } } },
    sentMessages: [],
    sendPresenceUpdate: async () => {},
    uploadPreKeys: async () => {},
    profilePictureUrl: async () => null,
    groupGetInviteInfo: async () => null,
    groupMetadata: async (gid) => ({ id: gid, subject: 'Grupo Teste', participants: [{ id: userJid || '258840000001@s.whatsapp.net' }] }),
    sendMessage: async (jid, content, opts) => {
      sock.sentMessages.push({ jid, content, opts })
      return { key: { id: 'msg_' + sock.sentMessages.length } }
    }
  }
  return sock
}

const fakeGroupConfig = {}
const fakeBemvindo = {}

const mocksByExact = {
  pino: () => () => ({}),
  '@hapi/boom': {
    Boom: class Boom extends Error {
      constructor(err) {
        super(err?.message || '')
        this.output = { statusCode: err?.output?.statusCode }
      }
    }
  },
  '@whiskeysockets/baileys': {
    makeWASocket: () => {
      const sock = makeFakeSocket()
      fakeSockets.push(sock)
      return sock
    },
    DisconnectReason: { loggedOut: 401, forbidden: 403, restartRequired: 515 },
    useMultiFileAuthState: async (sessionPath) => {
      createdSessionPaths.push(sessionPath)
      return {
        state: { creds: { registered: true, account: { details: 'ok' } }, keys: {} },
        saveCreds: async () => {}
      }
    },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] })
  },
  qrcode: {
    toBuffer: async () => Buffer.from('qr')
  }
}

const sessionPrunerPath = require.resolve('../src/utils/sessionPruner')
require.cache[sessionPrunerPath] = {
  id: sessionPrunerPath,
  filename: sessionPrunerPath,
  loaded: true,
  exports: { limparArquivosSessao: async () => {} }
}

const fakeDataLayerPath = require.resolve('../src/utils/firebaseDataLayer')
require.cache[fakeDataLayerPath] = {
  id: fakeDataLayerPath,
  filename: fakeDataLayerPath,
  loaded: true,
  exports: {
    groupConfigStore: {
      loadSync: () => fakeGroupConfig,
      getCache: () => fakeGroupConfig,
      save: () => {}
    },
    bemvindoStore: {
      loadSync: () => fakeBemvindo,
      getCache: () => fakeBemvindo,
      save: () => {}
    },
    concorrentesStore: {
      loadSync: () => ({}),
      getCache: () => ({}),
      save: () => {}
    }
  }
}

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocksByExact, request)) {
    return mocksByExact[request]
  }
  return origLoad.apply(this, arguments)
}

const subbotManager = require('../src/bot/subbotManager')
const subbotCmd = require('../src/comandos/adm/subbot')
const bemvindoMiddleware = require('../src/middlewares/bemvindo')
const config = require('../data/config.json')

const GRUPO_CONEXAO = '120363000000000001@g.us'
const GRUPO_DESTINO = '120363000000000002@g.us'
const GRUPO_NAO_VINCULADO = '120363000000000003@g.us'

async function aguardarCondicao(fn, timeoutMs = 2000) {
  const inicio = Date.now()
  while (!fn() && Date.now() - inicio < timeoutMs) {
    await new Promise(r => setTimeout(r, 20))
  }
}

test.after(() => {
  Module._load = origLoad
  for (const active of subbotManager.activeSubbots.values()) {
    try { active.sock?.ev?.removeAllListeners() } catch {}
  }
  for (const p of createdSessionPaths) {
    try { fs.rmSync(p, { recursive: true, force: true }) } catch {}
  }
  if (!sessionsExistedBefore && fs.existsSync(SESSIONS_DIR)) {
    try { fs.rmSync(SESSIONS_DIR, { recursive: true, force: true }) } catch {}
  }
  if (subbotsExistedBefore) {
    fs.writeFileSync(SUBBOTS_FILE, subbotsBackupBefore, 'utf8')
  } else if (fs.existsSync(SUBBOTS_FILE)) {
    fs.unlinkSync(SUBBOTS_FILE)
  }
})

test('sub-bot conectado em um grupo nao pode ser vinculado ao mesmo grupo', async () => {
  subbotManager.dados = { subbots: {}, autorizados: ['258840000099'], versaoVinculo: 2 }
  subbotManager.activeSubbots.clear()
  subbotManager.groupToSubbot.clear()

  const num = '258841111111'
  await subbotManager.conectarSubbot({
    numero: num,
    method: 'code',
    grupoId: GRUPO_CONEXAO,
    autorJid: '258840000099@s.whatsapp.net'
  })

  const subSock = fakeSockets[fakeSockets.length - 1]
  subSock.user = { id: `${num}:1@s.whatsapp.net` }
  subSock.ev.emit('connection.update', { connection: 'open' })
  await new Promise(r => setTimeout(r, 10))

  assert.equal(subbotManager.getGrupoConexao(num), GRUPO_CONEXAO)
  assert.equal(subbotManager.podeVincularGrupo(num, GRUPO_CONEXAO).ok, false)
  assert.throws(() => subbotManager.vincularGrupo(num, GRUPO_CONEXAO), /mesmo grupo/i)

  const sent = []
  const cmdSock = {
    sendMessage: async (jid, content) => { sent.push({ jid, content }) }
  }
  const msg = { key: { remoteJid: GRUPO_CONEXAO, fromMe: false }, message: { conversation: `${config.prefix}subbot vincular ${num}` } }
  const handled = await subbotCmd(cmdSock, msg, GRUPO_CONEXAO, '258840000099@s.whatsapp.net', `${config.prefix}subbot vincular ${num}`)
  assert.equal(handled, true)
  assert.match(sent[0].content.text, /VÍNCULO NÃO PERMITIDO/i)
  assert.equal(subbotManager.getSubbotDoGrupo(GRUPO_CONEXAO), null)

  subSock.groupGetInviteInfo = async () => ({ id: GRUPO_CONEXAO, subject: 'Grupo Conexao' })
  const sentLink = []
  const cmdSock2 = {
    sendMessage: async (jid, content) => { sentLink.push({ jid, content }) }
  }
  const msgLink = { key: { remoteJid: '258840000099@s.whatsapp.net', fromMe: false }, message: { conversation: `${config.prefix}subbot vincular https://chat.whatsapp.com/ABC123 ${num}` } }
  await subbotCmd(cmdSock2, msgLink, '258840000099@s.whatsapp.net', '258840000099@s.whatsapp.net', `${config.prefix}subbot vincular https://chat.whatsapp.com/ABC123 ${num}`)
  assert.match(sentLink[0].content.text, /VÍNCULO NÃO PERMITIDO/i)

  assert.equal(subbotManager.podeVincularGrupo(num, GRUPO_DESTINO).ok, true)
  const sentOk = []
  const cmdSock3 = {
    sendMessage: async (jid, content) => { sentOk.push({ jid, content }) }
  }
  const msgOk = { key: { remoteJid: GRUPO_DESTINO, fromMe: false }, message: { conversation: `${config.prefix}subbot vincular ${num}` } }
  await subbotCmd(cmdSock3, msgOk, GRUPO_DESTINO, '258840000099@s.whatsapp.net', `${config.prefix}subbot vincular ${num}`)
  assert.match(sentOk[0].content.text, /GRUPO VINCULADO/i)
  assert.equal(subbotManager.groupToSubbot.get(GRUPO_DESTINO), num)
})

test('sub-bot conectado por QR em grupo preserva grupoConexao apos resolver numero real e recarregar', async () => {
  subbotManager.dados = { subbots: {}, autorizados: ['258840000099'], versaoVinculo: 2 }
  subbotManager.activeSubbots.clear()
  subbotManager.groupToSubbot.clear()

  await subbotManager.conectarSubbot({
    numero: '',
    method: 'qr',
    grupoId: GRUPO_CONEXAO,
    autorJid: '258840000099@s.whatsapp.net'
  })

  const qrSock = fakeSockets[fakeSockets.length - 1]
  const realNum = '258842222222'
  qrSock.user = { id: `${realNum}:2@s.whatsapp.net` }
  qrSock.ev.emit('connection.update', { connection: 'open' })
  await new Promise(r => setTimeout(r, 10))

  assert.equal(subbotManager.dados.subbots[realNum].grupoConexao, GRUPO_CONEXAO)
  assert.equal(subbotManager.podeVincularGrupo(realNum, GRUPO_CONEXAO).ok, false)

  subbotManager.activeSubbots.clear()
  await subbotManager.conectarSubbot({
    numero: realNum,
    autorJid: '258840000099@s.whatsapp.net'
  })
  assert.equal(subbotManager.getGrupoConexao(realNum), GRUPO_CONEXAO)
  assert.equal(subbotManager.podeVincularGrupo(realNum, GRUPO_CONEXAO).ok, false)
})

test('sub-bot conectado no PV (grupoId null) pode ser vinculado a qualquer grupo', async () => {
  subbotManager.dados = { subbots: {}, autorizados: ['258840000099'], versaoVinculo: 2 }
  subbotManager.activeSubbots.clear()
  subbotManager.groupToSubbot.clear()

  const num = '258843333333'
  await subbotManager.conectarSubbot({
    numero: num,
    method: 'code',
    grupoId: null,
    autorJid: '258840000099@s.whatsapp.net'
  })

  assert.equal(subbotManager.getGrupoConexao(num), null)
  assert.equal(subbotManager.podeVincularGrupo(num, GRUPO_CONEXAO).ok, true)
  assert.equal(subbotManager.vincularGrupo(num, GRUPO_CONEXAO), true)
})

test('sub-bot processa group-participants.update apenas nos grupos vinculados e envia boas-vindas', async () => {
  subbotManager.dados = { subbots: {}, autorizados: ['258840000099'], versaoVinculo: 2 }
  subbotManager.activeSubbots.clear()
  subbotManager.groupToSubbot.clear()

  const eventosRecebidos = []
  subbotManager.setProcessarEventoGrupoFn(async (sock, update) => {
    eventosRecebidos.push({ sock, update })
    await bemvindoMiddleware(sock, update)
  })

  const num = '258844444444'
  await subbotManager.conectarSubbot({
    numero: num,
    method: 'code',
    grupoId: GRUPO_CONEXAO,
    autorJid: '258840000099@s.whatsapp.net'
  })

  const subSock = fakeSockets[fakeSockets.length - 1]
  subSock.user = { id: `${num}:1@s.whatsapp.net`, lid: '999888777666@lid' }
  subSock.ev.emit('connection.update', { connection: 'open' })
  await new Promise(r => setTimeout(r, 10))

  subbotManager.vincularGrupo(num, GRUPO_DESTINO)

  const dotDest = GRUPO_DESTINO.replace(/\./g, '___dot___')
  fakeGroupConfig[dotDest] = { authorized: true }
  fakeGroupConfig[GRUPO_DESTINO] = { bemvindo: true, boasVindas: true }
  fakeBemvindo[GRUPO_DESTINO] = true

  subSock.ev.emit('group-participants.update', {
    id: GRUPO_NAO_VINCULADO,
    action: 'add',
    participants: ['258849999999@s.whatsapp.net']
  })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(eventosRecebidos.length, 0)

  subSock.ev.emit('group-participants.update', {
    id: GRUPO_DESTINO,
    action: 'add',
    participants: [`${num}@s.whatsapp.net`, '258845555555@s.whatsapp.net']
  })
  await aguardarCondicao(() => subSock.sentMessages.length > 0, 2000)
  assert.equal(eventosRecebidos.length, 1)
  assert.equal(subSock.sentMessages.length, 1)
  assert.equal(subSock.sentMessages[0].jid, GRUPO_DESTINO)
  assert.match(subSock.sentMessages[0].content.text, /SEJA BEM-VINDO/)
  assert.match(subSock.sentMessages[0].content.text, /@258845555555/)
  assert.doesNotMatch(subSock.sentMessages[0].content.text, new RegExp(`@${num}`))
})

test('bemvindo faz fallback para texto caso envio com imagem falhe', async () => {
  const grp = '120363000000000004@g.us'
  fakeGroupConfig[grp] = { authorized: true, bemvindo: true }
  fakeBemvindo[grp] = true

  const sent = []
  const sock = {
    user: { id: '258840000001@s.whatsapp.net' },
    profilePictureUrl: async () => 'https://example.com/avatar.jpg',
    sendMessage: async (jid, content) => {
      if (content.image) throw new Error('Timed Out (7s)')
      sent.push({ jid, content })
      return { key: { id: '1' } }
    }
  }

  await bemvindoMiddleware(sock, {
    id: grp,
    action: 'add',
    participants: [{ id: '258846666666@s.whatsapp.net' }]
  })

  assert.equal(sent.length, 1)
  assert.match(sent[0].content.text, /@258846666666/)
  assert.match(sent[0].content.text, /SEJA BEM-VINDO/)
})
