const fs = require('fs')
const path = require('path')
const { isAdmin, isOwnerCheck } = require('../../utils/baileys.js')
const config = require('../../../data/config.json')
const { getPrefixForChat } = require('../../utils/configManager')

const menuNanosHandler = async (sock, msg, from, sender, text) => {
    const rawCmd = (text || '').trim().toLowerCase().split(/\s+/)[0]
    const basePrefix = config.prefix || '.'
    const currentPrefix = (getPrefixForChat && typeof getPrefixForChat === 'function')
        ? getPrefixForChat(from)
        : basePrefix

    const isMatch = rawCmd === (currentPrefix + 'menunanos') ||
                    rawCmd === (basePrefix + 'menunanos') ||
                    rawCmd === (currentPrefix + 'nanos') ||
                    rawCmd === (basePrefix + 'nanos') ||
                    rawCmd === '.menunanos' ||
                    rawCmd === '.nanos'

    // Se o usuário digitou '.nanos palavra/...' ou '.nanos algo', não é para abrir o menu
    const isOnlyNanos = rawCmd === (currentPrefix + 'nanos') || rawCmd === (basePrefix + 'nanos') || rawCmd === '.nanos'
    const fullTextTrimmed = (text || '').trim()
    if (isOnlyNanos && fullTextTrimmed.length > rawCmd.length) {
        return false
    }

    if (!isMatch) {
        return false
    }

    const isOwner = isOwnerCheck(sender, msg)
    const isGroup = from.endsWith('@g.us')

    if (!isOwner) {
        if (!isGroup) {
            await sock.sendMessage(from, { text: '❌ Este menu é exclusivo para administradores de grupo ou dono do bot.' }, { quoted: msg })
            return true
        }
        let adminStatus = false
        try {
            adminStatus = await isAdmin(sock, from, sender)
        } catch { }

        if (!adminStatus) {
            await sock.sendMessage(from, { text: '❌ Este menu é exclusivo para administradores do grupo.' }, { quoted: msg })
            return true
        }
    }

    const prefix = currentPrefix
    const userName = msg.pushName || 'Administrador'

    const header = [
        '╭┈⊰ 👻 『 *MENU NANOS* 』',
        `┊Olá, ${userName}!`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const blocoGithub = [
        '╭┈❁ 🐙 *GITHUB*',
        '┊•.̇𖥨֗💻⭟ github.com/Gumballznx/ghost-manual',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const bloco1 = [
        '╭┈❁ *💬 COMANDOS NANOS*',
        '┊',
        `┊•.̇𖥨֗👻⭟${prefix}nanos <palavra>/<resposta>`,
        `┊•.̇𖥨֗👻⭟${prefix}listananos`,
        `┊•.̇𖥨֗👻⭟${prefix}limparnanos <palavra>`,
        `┊•.̇𖥨֗👻⭟${prefix}limparnanos confirmar`,
        `┊•.̇𖥨֗👻⭟${prefix}delnanos <palavra>`,
        `┊•.̇𖥨֗👻⭟${prefix}removernanos <palavra>`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const menuText = [header, '', blocoGithub, '', bloco1].join('\n')

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

menuNanosHandler.nome = 'menunanos'
menuNanosHandler.name = 'menunanos'
menuNanosHandler.aliases = ['nanos']
menuNanosHandler.categoria = 'adm'
menuNanosHandler.descricao = 'Menu de gerenciamento de comandos nanos (gatilhos/respostas parciais)'
menuNanosHandler.uso = `${config.prefix}menunanos`

module.exports = menuNanosHandler
