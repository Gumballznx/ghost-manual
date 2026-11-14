const fs = require('fs')
const path = require('path')
const config = require(path.join(__dirname, '../../../data/config.json'))
const subbotManager = require('../../bot/subbotManager')

async function handleMenuConect(sock, msg, from, sender, text) {
  const prefix = config.prefix || '.'
  const rawText = (text || '').trim()
  const rawCmd = rawText.toLowerCase().split(/\s+/)[0]

  const isMenuCmd = rawCmd === (prefix + 'menuconect') ||
                    rawCmd === (prefix + 'painelconect') ||
                    rawCmd === (prefix + 'conexoes') ||
                    rawCmd === '.menuconect' ||
                    rawCmd === '.painelconect' ||
                    rawCmd === '.conexoes'

  if (!isMenuCmd) {
    return false
  }

  const isAutorizado = subbotManager.isAutorizado(sender, msg)
  if (!isAutorizado) {
    await sock.sendMessage(from, {
      text: '❌ *Apenas o Dono, Subdonos ou Revendedores autorizados podem acessar este menu.*'
    }, { quoted: msg })
    return true
  }

  const userName = msg.pushName || 'Revendedor'

  const header = [
    '╭┈⊰ 👻 『 *PAINEL DE CONEXÕES & SUB-BOTS* 』',
    `┊Olá, ${userName}!`,
    '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
  ].join('\n')

  const blocoConexao = [
    '╭┈❁ *🔌 MÉTODOS DE CONEXÃO (A-Z)*',
    '┊',
    `┊•.̇𖥨֗👻⭟${prefix}conect <numero>`,
    `┊•.̇𖥨֗👻⭟${prefix}qr`,
    '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
  ].join('\n')

  const blocoGestao = [
    '╭┈❁ *📊 GESTÃO DE SESSÕES & GRUPOS*',
    '┊',
    `┊•.̇𖥨֗👻⭟${prefix}subbots`,
    `┊•.̇𖥨֗👻⭟${prefix}subbot grupos`,
    `┊•.̇𖥨֗👻⭟${prefix}meusgrupos`,
    `┊•.̇𖥨֗👻⭟${prefix}subbot vincular [link]`,
    `┊•.̇𖥨֗👻⭟${prefix}subbot desvincular`,
    `┊•.̇𖥨֗👻⭟${prefix}desconectar <numero>`,
    '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
  ].join('\n')

  const blocoDono = [
    '╭┈❁ *👑 CONTROLE DE ACESSO & RESGATE*',
    '┊',
    `┊•.̇𖥨֗👑⭟${prefix}conectarmae <numero>`,
    `┊•.̇𖥨֗👑⭟${prefix}qrmae`,
    `┊•.̇𖥨֗👻⭟${prefix}subbot autorizar <numero | @user>`,
    `┊•.̇𖥨֗👻⭟${prefix}subbot desautorizar <numero>`,
    `┊•.̇𖥨֗👻⭟${prefix}subbot autorizados`,
    '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
  ].join('\n')

  const blocoGithub = [
    '╭┈❁ 🐙 *GITHUB*',
    '┊•.̇𖥨֗💻⭟ github.com/Gumballznx/ghost-manual',
    '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
  ].join('\n')

  const menuText = [header, blocoGithub, blocoConexao, blocoGestao, blocoDono].join('\n\n')
  const logoPath = path.join(__dirname, '../../../assets', 'menuadm.jpg')

  if (fs.existsSync(logoPath)) {
    await sock.sendMessage(from, {
      image: fs.readFileSync(logoPath),
      caption: menuText
    }, { quoted: msg })
  } else {
    await sock.sendMessage(from, { text: menuText }, { quoted: msg })
  }

  return true
}

handleMenuConect.nome = 'menuconect'
handleMenuConect.aliases = ['painelconect', 'conexoes']
handleMenuConect.categoria = 'adm'
handleMenuConect.descricao = 'Exibe o menu de conexões e pareamento'
handleMenuConect.uso = '.menuconect'
handleMenuConect.execute = handleMenuConect

module.exports = handleMenuConect
