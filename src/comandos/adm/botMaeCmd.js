const config = require('../../../data/config.json')
const { isOwnerCheck, isSubdonoCheck } = require('../../utils/baileys')
const botMae = require('../../utils/botMae')

async function botMaeCmd(sock, msg, from, sender, text) {
  const partes = String(text || '').trim().split(/\s+/)
  if (botMae.palavraDoComando(partes[0]) !== 'botmae') return false
  const prefix = config.prefix || '.'

  if (!(isOwnerCheck(sender, msg) || isSubdonoCheck(sender))) {
    await sock.sendMessage(from, { text: 'Apenas o dono e os subdonos podem usar este comando.' }, { quoted: msg })
    return true
  }
  if (!from.endsWith('@g.us')) {
    await sock.sendMessage(from, { text: `Use dentro do grupo: ${prefix}botmae autorizar | remover | status` }, { quoted: msg })
    return true
  }

  const acao = (partes[1] || 'status').toLowerCase()
  const ativo = botMae.grupoAutorizado(from)
  if (acao === 'autorizar' || acao === 'on') {
    botMae.definirAutorizacao(from, true)
    await sock.sendMessage(from, { text: 'Bot mãe autorizado neste grupo. Responde só a menus, ligação de sub-bots, link do grupo, listagem e abrir/fechar. O resto fica para os sub-bots.' }, { quoted: msg })
  } else if (acao === 'remover' || acao === 'off') {
    botMae.definirAutorizacao(from, false)
    await sock.sendMessage(from, { text: 'Bot mãe removido deste grupo. Passa a ignorar tudo aqui, exceto o comando .botmae.' }, { quoted: msg })
  } else {
    await sock.sendMessage(from, { text: `Bot mãe neste grupo: ${ativo ? 'AUTORIZADO' : 'NÃO autorizado'}.\n${prefix}botmae autorizar | remover` }, { quoted: msg })
  }
  return true
}

botMaeCmd.nome = 'botmae'
botMaeCmd.categoria = 'adm'
botMaeCmd.descricao = 'Autoriza o bot mãe a responder (menus e ligações) neste grupo'
botMaeCmd.uso = '.botmae autorizar | remover | status'
botMaeCmd.execute = botMaeCmd

module.exports = botMaeCmd
