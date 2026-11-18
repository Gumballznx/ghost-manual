const fs = require('fs')
const path = require('path')
const { isAdmin, isOwnerCheck } = require('../../utils/baileys.js')
const config = require('../../../data/config.json')
const { getPrefixForChat } = require('../../utils/configManager')

const menuConfigurarHandler = async (sock, msg, from, sender, text) => {
    const rawCmd = (text || '').trim().toLowerCase().split(/\s+/)[0]
    const basePrefix = config.prefix || '.'
    const currentPrefix = (getPrefixForChat && typeof getPrefixForChat === 'function')
        ? getPrefixForChat(from)
        : basePrefix

    const isMatch = rawCmd === (currentPrefix + 'menuconfigurar') ||
                    rawCmd === (basePrefix + 'menuconfigurar') ||
                    rawCmd === '.menuconfigurar'

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
        '╭┈⊰ 👻 『 *MENU CONFIGURAR* 』',
        `┊Olá, ${userName}!`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const blocoGithub = [
        '╭┈❁ 🐙 *GITHUB*',
        '┊•.̇𖥨֗💻⭟ github.com/Gumballznx/ghost-manual',
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const bloco1 = [
        '╭┈❁ *📊 CONFIGURAÇÃO DE TABELAS*',
        '┊',
        `┊•.̇𖥨֗👻⭟${prefix}configurar tabela/<texto>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar diarios/<texto>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar semanal/<texto>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar mensal/<texto>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar diamante/<texto>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar saldo/<texto>`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const bloco2 = [
        '╭┈❁ *👀 CONSULTA & REMOÇÃO*',
        '┊',
        `┊•.̇𖥨֗👻⭟${prefix}configurar ver tabela`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar ver diarios`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar ver semanal`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar ver mensal`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar ver diamante`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar ver saldo`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover tabela`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover diarios`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover semanal`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover mensal`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover diamante`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover saldo`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const bloco3 = [
        '╭┈❁ *💳 CONTAS DE PAGAMENTO*',
        '┊',
        `┊•.̇𖥨֗👻⭟${prefix}configurar E-mola <numero> <nome>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar M-Pesa <numero> <nome>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar listar`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover E-mola <numero>`,
        `┊•.̇𖥨֗👻⭟${prefix}configurar remover M-Pesa <numero>`,
        '╰─┈┈┈┈┈◜❁◞┈┈┈┈┈─╯'
    ].join('\n')

    const menuText = [header, '', blocoGithub, '', bloco1, '', bloco2, '', bloco3].join('\n')

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

menuConfigurarHandler.nome = 'menuconfigurar'
menuConfigurarHandler.name = 'menuconfigurar'
menuConfigurarHandler.aliases = ['configurarmenu']
menuConfigurarHandler.categoria = 'adm'
menuConfigurarHandler.descricao = 'Menu de configuração de tabelas e pagamentos'
menuConfigurarHandler.uso = `${config.prefix}menuconfigurar`

module.exports = menuConfigurarHandler
