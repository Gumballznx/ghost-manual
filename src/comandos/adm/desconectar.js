const path = require('path')
const config = require(path.join(__dirname, '../../../data/config.json'))
const { isLeaderCheck, isSubdonoCheck } = require('../../utils/baileys')
const subbotManager = require('../../bot/subbotManager')
const { cardGhost } = require('../../utils/cardGhost')

async function handleDesconectar(sock, msg, from, sender, text) {
  const prefix = config.prefix || '.'
  const rawText = (text || '').trim()
  const parts = rawText.split(/\s+/)
  const rawCmd = (parts[0] || '').toLowerCase()

  const isDesconectCmd = rawCmd === (prefix + 'desconectar') ||
                         rawCmd === (prefix + 'desconect') ||
                         rawCmd === (prefix + 'desconectarbot')
  const isStatusCmd = rawCmd === (prefix + 'statusconect')

  if (!isDesconectCmd && !isStatusCmd) {
    return false
  }

  const isAutorizado = subbotManager.isAutorizado(sender, msg)
  if (!isAutorizado) {
    await sock.sendMessage(from, {
      text: cardGhost('ERRO', [['❌', `*Você não tem permissão para gerenciar conexões de sub-bots.*`]])
    }, { quoted: msg })
    return true
  }

  const isOwnerOrSubdono = isLeaderCheck(sender, msg) || isSubdonoCheck(sender)

  // Status de conexão
  if (isStatusCmd) {
    const isGroup = from.endsWith('@g.us')
    const subNoGrupo = isGroup ? subbotManager.getSubbotDoGrupo(from) : null

    if (subNoGrupo) {
      await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *STATUS DA CONEXÃO* 』',
          '┊',
          '┊•.̇𖥨֗🏢⭟ *Atendimento:* Sub-Bot Dedicado',
          `┊•.̇𖥨֗📱⭟ *Número:* ${subbotManager.rotulo(subNoGrupo.numero)}`,
          `┊•.̇𖥨֗🟢⭟ *Status:* ${subNoGrupo.status ? subNoGrupo.status.toUpperCase() : 'ONLINE'}`,
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
    } else {
      await sock.sendMessage(from, {
        text: [
          '╭┈⊰ 👻 『 *STATUS DA CONEXÃO* 』',
          '┊',
          '┊•.̇𖥨֗🤖⭟ *Atendimento:* Bot Principal',
          '┊•.̇𖥨֗ℹ️⭟ Este grupo não possui sub-bot conectado.',
          `┊•.̇𖥨֗💡⭟ Conecte um chip usando: \`${prefix}conect\` ou \`${prefix}qr\``,
          '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
        ].join('\n')
      }, { quoted: msg })
    }
    return true
  }

  // Desconectar sub-bot
  let rawNumber = parts[1] ? parts[1].trim() : ''

  // Se não passou número e está dentro de um grupo que tem subbot vinculado
  if (!rawNumber && from.endsWith('@g.us')) {
    const subNoGrupo = subbotManager.getSubbotDoGrupo(from)
    if (subNoGrupo) {
      rawNumber = subNoGrupo.numero
    }
  }

  // Se o revendedor não passou número, mas tem apenas 1 subbot dele
  if (!rawNumber && !isOwnerOrSubdono) {
    const meus = subbotManager.getSubbotsDoUsuario(sender)
    if (meus.length === 1) {
      rawNumber = meus[0].numero
    }
  }

  if (!rawNumber) {
    await sock.sendMessage(from, {
      text: cardGhost('ERRO', [['❌', `*Informe o número do sub-bot a ser desconectado.*`], ['💡', `Exemplo: \`${prefix}desconectar 25884xxxxxxx\``]])
    }, { quoted: msg })
    return true
  }

  // Mesma regra do .subbot del: aceita o nº da lista ou o número, e só confirma
  // a remoção se o sub-bot existia de fato
  const { executarRemoverSubbot } = require('./subbot')
  return await executarRemoverSubbot(sock, msg, from, sender, rawNumber, isOwnerOrSubdono)
}

handleDesconectar.nome = 'desconectar'
handleDesconectar.aliases = ['desconect', 'desconectarbot', 'statusconect']
handleDesconectar.categoria = 'adm'
handleDesconectar.descricao = 'Desconectar sub-bot ou consultar status da conexão'
handleDesconectar.uso = '.desconectar [numero]'
handleDesconectar.execute = handleDesconectar

module.exports = handleDesconectar
