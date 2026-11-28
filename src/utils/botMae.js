// Conexão mãe (socket principal): em grupos só serve menus, ligação de sub-bots e
// poucos comandos de apoio, e só em grupos autorizados com ".botmae autorizar".
// Tudo o resto (tabela, pagamentos, configuração, compras...) fica para os sub-bots.
const configManager = require('./configManager')

const PERMITIDOS = new Set([
  // menus
  'menu', 'menumembro', 'menumemb', 'menucomum', 'menuadm', 'menudono', 'menuconect', 'menuconfigurar',
  'menunano', 'menunanos', 'menuprefix', 'menuprefixo', 'prefixmenu', 'prefixos', 'painelconect',
  'conexoes', 'configurarmenu', 'nano', 'nanos', 'ajuda', 'help', 'ping',
  // ligação e gestão de sub-bots
  'conect', 'conectar', 'qr', 'qrcode', 'subbot', 'subbots', 'delsubbot', 'deletesubbot', 'meusgrupos',
  'meusgruposub', 'desconectar', 'desconect', 'desconectarbot', 'statusconect',
  'conectarmae', 'conectarprincipal', 'reconectarmae', 'reconectarprincipal', 'pairmae', 'pairprincipal',
  'qrmae', 'qrprincipal',
  // apoio
  'linkgp', 'linkgrupo', 'grupos', 'listagrupos',
  // abrir/fechar grupo (e agendamento)
  'grupo', 'abrir', 'fechar'
])

function palavraDoComando(texto) {
  const t = String(texto || '')
    .replace(/[​-‏‪-‮⁠﻿]/g, '')
    .trim()
    .toLowerCase()
  const m = t.match(/^[^a-z0-9\s]{1,3}\s?([a-z0-9]+)/)
  return m ? m[1] : ''
}

function grupoAutorizado(gid) {
  return configManager.getGroupEntry(gid)?.botMaeAutorizado === true
}

function definirAutorizacao(gid, valor) {
  const cfg = configManager.loadGroupConfig()
  const chave = gid.replace(/\./g, '___dot___')
  const alvo = cfg[chave] || cfg[gid] || (cfg[chave] = {})
  if (valor) alvo.botMaeAutorizado = true
  else delete alvo.botMaeAutorizado
  configManager.saveGroupConfig(cfg, true)
}

// true = a conexão mãe deve ignorar esta mensagem de grupo
function mensagemBloqueada(gid, texto) {
  const palavra = palavraDoComando(texto)
  if (palavra === 'botmae') return false
  if (!grupoAutorizado(gid)) return true
  return !PERMITIDOS.has(palavra)
}

module.exports = { PERMITIDOS, palavraDoComando, grupoAutorizado, definirAutorizacao, mensagemBloqueada }
