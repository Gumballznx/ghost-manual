const test = require('node:test')
const assert = require('node:assert')
const m = require('../src/utils/mensagensEnviadas')

test('guarda o que o socket envia e devolve no getMessage (para reenvio)', async () => {
  const sock = { sendMessage: async (jid, c) => ({ key: { id: 'ABC1', remoteJid: jid }, message: { conversation: c.text } }) }
  m.registarSocket(sock)
  await sock.sendMessage('1@g.us', { text: 'ola' })
  assert.deepStrictEqual(await m.getMessage({ id: 'ABC1' }), { conversation: 'ola' })
  assert.strictEqual(await m.getMessage({ id: 'NAO-EXISTE' }), undefined)
})

test('registar duas vezes nao embrulha de novo', async () => {
  let n = 0
  const sock = { sendMessage: async () => { n++; return { key: { id: 'X' + n }, message: {} } } }
  m.registarSocket(sock); m.registarSocket(sock)
  await sock.sendMessage('a', {})
  assert.strictEqual(n, 1)
})
