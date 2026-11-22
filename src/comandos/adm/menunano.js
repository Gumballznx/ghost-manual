const fs = require('fs')
const path = require('path')
const { isAdmin, isOwnerCheck } = require('../../utils/baileys.js')
const config = require('../../../data/config.json')
const { getPrefixForChat } = require('../../utils/configManager')

const menuNanoHandler = async (sock, msg, from, sender, text) => {
    const rawCmd = (text || '').trim().toLowerCase().split(/\s+/)[0]
    const basePrefix = config.prefix || '.'
    const currentPrefix = (getPrefixForChat && typeof getPrefixForChat === 'function')
        ? getPrefixForChat(from)
        : basePrefix

    const isMatch = rawCmd === (currentPrefix + 'menunano') ||
                    rawCmd === (basePrefix + 'menunano') ||
                    rawCmd === (currentPrefix + 'nano') ||
                    rawCmd === (basePrefix + 'nano') ||
                    rawCmd === '.menunano' ||
                    rawCmd === '.nano'

    // Se o usuário digitou '.nano nome/...' ou '.nano algo', não é para abrir o menu
    const isOnlyNano = rawCmd === (currentPrefix + 'nano') || rawCmd === (basePrefix + 'nano') || rawCmd === '.nano'
    const fullTextTrimmed = (text || '').trim()
    if (isOnlyNano && fullTextTrimmed.length > rawCmd.length) {
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
        '╭┈⊰ 👻 『 *MENU NANO* 』',
        `┊Olá, ${userName}!`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const blocoGithub = [
        '╭┈❁ 🐙 *GITHUB*',
        '┊•.̇𖥨֗💻⭟ github.com/Gumballznx/ghost-manual',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const bloco1 = [
        '╭┈❁ *⚡ COMANDOS NANO*',
        '┊',
        `┊•.̇𖥨֗👻⭟${prefix}nano <nome>/<resposta>`,
        `┊•.̇𖥨֗👻⭟${prefix}nano tabela/<resposta>`,
        `┊•.̇𖥨֗👻⭟${prefix}listanano`,
        `┊•.̇𖥨֗👻⭟${prefix}limparnano <nome>`,
        `┊•.̇𖥨֗👻⭟${prefix}limparnano confirmar`,
        `┊•.̇𖥨֗👻⭟${prefix}delnano <nome>`,
        `┊•.̇𖥨֗👻⭟${prefix}removernano <nome>`,
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

menuNanoHandler.nome = 'menunano'
menuNanoHandler.name = 'menunano'
menuNanoHandler.aliases = ['nano']
menuNanoHandler.categoria = 'adm'
menuNanoHandler.descricao = 'Menu de gerenciamento de comandos nano (exatos)'
menuNanoHandler.uso = `${config.prefix}menunano`

module.exports = menuNanoHandler
