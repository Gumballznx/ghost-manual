const test = require('node:test')
const assert = require('node:assert')
const Module = require('module')

// configManager falso em memória
const cfg = {}
const fake = {
  loadGroupConfig: () => cfg,
  getGroupEntry: gid => cfg[gid.replace(/\./g, '___dot___')] || cfg[gid] || {},
  saveGroupConfig: () => {}
}
const orig = Module._load
Module._load = function (req, ...r) { return req.endsWith('configManager') ? fake : orig.call(this, req, ...r) }
const botMae = require('../src/utils/botMae')
Module._load = orig

const G = '120363000000000001@g.us'

test('palavra do comando ignora prefixo e marcas invisiveis', () => {
  assert.strictEqual(botMae.palavraDoComando('.Menu'), 'menu')
  assert.strictEqual(botMae.palavraDoComando('‎!botmae autorizar'), 'botmae')
  assert.strictEqual(botMae.palavraDoComando('ola'), '')
  assert.strictEqual(botMae.palavraDoComando(''), '')
})

test('grupo nao autorizado: so .botmae passa', () => {
  assert.strictEqual(botMae.mensagemBloqueada(G, '.menu'), true)
  assert.strictEqual(botMae.mensagemBloqueada(G, '.tabela'), true)
  assert.strictEqual(botMae.mensagemBloqueada(G, ''), true)
  assert.strictEqual(botMae.mensagemBloqueada(G, '.botmae autorizar'), false)
})

test('grupo autorizado: menus e ligacoes passam, o resto fica para os sub-bots', () => {
  botMae.definirAutorizacao(G, true)
  assert.strictEqual(botMae.grupoAutorizado(G), true)
  for (const c of ['.menu', '.menuadm', '.conect 2588', '.qr', '.subbot vincular', '.linkgp', '.grupos', '.grupo abrir 08:00', '.fechar'])
    assert.strictEqual(botMae.mensagemBloqueada(G, c), false, c)
  for (const c of ['.tabela', '.pagamentos', '.config', '.comprar', '.enviarmb 84 1GB', '.ban', 'ola', '845568576 10GB'])
    assert.strictEqual(botMae.mensagemBloqueada(G, c), true, c)
})

test('remover autorizacao volta a bloquear', () => {
  botMae.definirAutorizacao(G, false)
  assert.strictEqual(botMae.grupoAutorizado(G), false)
  assert.strictEqual(botMae.mensagemBloqueada(G, '.menu'), true)
})
