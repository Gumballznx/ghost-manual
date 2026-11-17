const config = require('../../../data/config.json')
const configManager = require('../../utils/configManager')
const { isAdmin, isOwnerCheck, isLeaderCheck, getGroupMetadataCached } = require('../../utils/baileys')
const { concorrentesStore } = require('../../utils/firebaseDataLayer')

if (!global.concorrentesMapeados) {
    global.concorrentesMapeados = {}
}

async function coletarAdminsDeOutrosGrupos(sock, currentGroupId) {
    const groupConfig = configManager.loadGroupConfig()
    let allGroups = {}
    try {
        allGroups = await sock.groupFetchAllParticipating()
    } catch {
        allGroups = groupConfig
    }

    const otherGroupIds = Object.keys(allGroups).filter(id => id.endsWith('@g.us') && id !== currentGroupId)
    const adminMap = new Map()

    for (const otherGid of otherGroupIds) {
        const dotGid = otherGid.replace(/\./g, '___dot___')
        const gInfo = groupConfig[otherGid] || groupConfig[dotGid]
        if (gInfo && gInfo.authorized === false) {
            continue
        }

        let otherMeta = allGroups[otherGid]
        if (!otherMeta || !otherMeta.participants) {
            try {
                otherMeta = await getGroupMetadataCached(sock, otherGid)
            } catch {
                continue
            }
        }

        if (!otherMeta || !otherMeta.participants) continue

        const otherGroupName = otherMeta.subject || 'Outro Grupo'
        const otherAdmins = otherMeta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin')

        for (const adminP of otherAdmins) {
            const adminId = adminP.id || ''
            const adminNum = adminId.split('@')[0].split(':')[0].replace(/\D/g, '')
            if (!adminNum) continue

            if (isLeaderCheck(adminId) || isOwnerCheck(adminId)) continue

            if (!adminMap.has(adminNum)) {
                adminMap.set(adminNum, {
                    id: adminId,
                    numero: adminNum,
                    grupos: [otherGroupName],
                    gruposIds: [otherGid]
                })
            } else {
                const entry = adminMap.get(adminNum)
                if (!entry.grupos.includes(otherGroupName)) {
                    entry.grupos.push(otherGroupName)
                    entry.gruposIds.push(otherGid)
                }
            }
        }
    }

    return adminMap
}

/**
 * Números dos membros a pôr na lista de concorrentes: todos menos o próprio bot, o dono e os
 * subdonos. Devolve { novos: [números], ignorados: quantos ficaram de fora }.
 */
function numerosParaAnticoncorrencia(participantes, { numeroDoBot = '', eDonoOuSubdono = () => false } = {}) {
    const novos = []
    let ignorados = 0
    let membros = 0
    const digitos = v => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
    for (const p of participantes) {
        const id = p?.id || p?.jid || ''
        // O WhatsApp identifica o membro pelo número e/ou pelo ID interno (LID); guarda os dois para
        // o reconhecer em qualquer grupo.
        const chaves = [...new Set([digitos(p?.phoneNumber), digitos(p?.jid), digitos(id), digitos(p?.lid)].filter(Boolean))]
        if (!chaves.length) continue
        if (chaves.some(c => (numeroDoBot && c === numeroDoBot) || eDonoOuSubdono(c)) || eDonoOuSubdono(id)) {
            ignorados++
            continue
        }
        membros++
        for (const c of chaves) if (!novos.includes(c)) novos.push(c)
    }
    return { novos, ignorados, membros }
}

const digitosDe = v => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')

/** Números do próprio bot e dos seus sub-bots: nunca são banidos. */
function numerosDeBots(sock) {
    const nums = new Set([digitosDe(sock?.user?.id), digitosDe(sock?.user?.lid)].filter(Boolean))
    try {
        const sm = require('../../subbots/subbotManager')
        if (typeof sm.numerosDosSubbots === 'function') for (const n of sm.numerosDosSubbots()) nums.add(n)
    } catch {}
    try {
        const sm = require('../../bot/subbotManager')
        if (sm && typeof sm.listarSubbots === 'function') for (const s of sm.listarSubbots()) nums.add(digitosDe(s.numero))
    } catch {}
    nums.delete('')
    return nums
}

/** Quem pode ser removido: nunca admins, dono/subdonos nem bots. */
function alvosSeguros(lista, { admins = new Set(), bots = new Set(), eDonoOuSubdono = () => false } = {}) {
    return lista.filter(c => {
        const chaves = [digitosDe(c.id), digitosDe(c.numero)].filter(Boolean)
        return !chaves.some(k => admins.has(k) || bots.has(k) || eDonoOuSubdono(k)) && !eDonoOuSubdono(c.id)
    })
}

/** Remove todos de uma vez (em blocos), como o .banghost. Devolve os ids removidos. */
async function removerEmBloco(sock, groupId, ids, tamanho = 50) {
    const removidos = new Set()
    for (let i = 0; i < ids.length; i += tamanho) {
        const bloco = ids.slice(i, i + tamanho)
        try {
            const res = await sock.groupParticipantsUpdate(groupId, bloco, 'remove')
            if (Array.isArray(res) && res.length) {
                for (const r of res) {
                    const ok = String(r?.status ?? '200') === '200'
                    const id = r?.jid || r?.id
                    if (ok && id) removidos.add(id)
                }
                // Algumas versões não devolvem o id: conta o bloco inteiro se não houve falhas.
                if (!res.some(r => r?.jid || r?.id) && res.every(r => String(r?.status ?? '200') === '200')) bloco.forEach(id => removidos.add(id))
            } else {
                bloco.forEach(id => removidos.add(id))
            }
        } catch (err) {
            console.error('[CONCORRENTES] Erro ao remover bloco:', err.message)
        }
    }
    return removidos
}

module.exports = async function (sock, msg, from, sender, text) {
    const rawTokens = text.trim().split(/\s+/)
    const rawCmd = rawTokens[0].toLowerCase()
    const prefix = config.prefix

    // .addanticoncorrencia todos — põe todos os membros do grupo na lista global de concorrentes.
    // Só dono e subdono; funciona em qualquer grupo, mesmo sem licença.
    if (rawCmd === prefix + 'addanticoncorrencia') {
        if (!from.endsWith('@g.us')) {
            await sock.sendMessage(from, { text: '❌ Use este comando dentro do grupo.' }, { quoted: msg })
            return true
        }
        if (!isOwnerCheck(sender, msg)) {
            await sock.sendMessage(from, { text: '❌ Apenas o dono ou um subdono pode usar este comando.' }, { quoted: msg })
            return true
        }
        if ((rawTokens[1] || '').toLowerCase() !== 'todos') {
            await sock.sendMessage(from, { text: `❌ Use: \`${prefix}addanticoncorrencia todos\`` }, { quoted: msg })
            return true
        }
        let meta
        try { meta = await sock.groupMetadata(from) } catch {
            await sock.sendMessage(from, { text: '❌ Não consegui ler os membros do grupo. Tente de novo.' }, { quoted: msg })
            return true
        }
        const numeroDoBot = String(sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '')
        const { novos, ignorados, membros } = numerosParaAnticoncorrencia(meta?.participants || [], {
            numeroDoBot,
            eDonoOuSubdono: id => isOwnerCheck(id)
        })
        const dados = concorrentesStore.loadSync() || {}
        if (!Array.isArray(dados.global)) dados.global = []
        const jaEstavam = novos.filter(n => dados.global.includes(n)).length
        for (const n of novos) if (!dados.global.includes(n)) dados.global.push(n)
        concorrentesStore.save(dados)
        await sock.sendMessage(from, {
            text: [
                '🚫 *ANTI-CONCORRÊNCIA: GRUPO ADICIONADO*',
                '────────────────────────',
                `👥 *Membros na lista:* ${membros}`,
                `🆕 *Identificadores novos:* ${novos.length - jaEstavam} (número e/ou ID do WhatsApp)`,
                `🛡️ *Não adicionados (dono, subdonos e o bot):* ${ignorados}`,
                '',
                'Serão barrados em todos os grupos com a Anti-Concorrência ativa.'
            ].join('\n')
        }, { quoted: msg })
        return true
    }

    const isAnticoncorrenciaMenu = (
        rawCmd === prefix + 'anticoncorrencia' ||
        rawCmd === prefix + 'anticoncorrentes' ||
        rawCmd === prefix + 'concorrentes' && rawTokens.length === 1 ||
        rawCmd === prefix + 'concorrente' && rawTokens.length === 1
    )

    const isMapCmd = (
        rawCmd === prefix + 'mapearconcorrentes' ||
        rawCmd === prefix + 'mapearconcorrente' ||
        rawCmd === prefix + 'mapconcorrentes'
    )

    const isPermitirCmd = (
        rawCmd === prefix + 'concorrente' && (rawTokens[1] === 'permitir' || rawTokens[1] === 'perdoar' || rawTokens[1] === 'whitelist') ||
        rawCmd === prefix + 'anticoncorrencia' && (rawTokens[1] === 'permitir' || rawTokens[1] === 'perdoar' || rawTokens[1] === 'whitelist')
    )

    const isProibirCmd = (
        rawCmd === prefix + 'concorrente' && (rawTokens[1] === 'proibir' || rawTokens[1] === 'bloquear' || rawTokens[1] === 'del') ||
        rawCmd === prefix + 'anticoncorrencia' && (rawTokens[1] === 'proibir' || rawTokens[1] === 'bloquear' || rawTokens[1] === 'del')
    )

    const isAddManualCmd = (
        rawCmd === prefix + 'concorrente' && (rawTokens[1] === 'add' || rawTokens[1] === 'adicionar') ||
        rawCmd === prefix + 'anticoncorrencia' && (rawTokens[1] === 'add' || rawTokens[1] === 'adicionar')
    )

    const subcomando = (rawTokens[1] || '').toLowerCase()
    // Só remove com uma palavra de banir explícita (antes QUALQUER palavra, até "listar", banía todos).
    const isActionCmd = (
        ((rawCmd === prefix + 'anticoncorrentes' || rawCmd === prefix + 'concorrentes') &&
            ['banir', 'ban', 'remover', 'kick', 'expulsar'].includes(subcomando)) ||
        (rawCmd === prefix + 'banirconcorrentes')
    )
    const isListarCmd = rawCmd.includes('concorren') && ['listar', 'lista', 'list'].includes(subcomando)
    // .concorrentes <outra coisa> mostra o menu em vez de fazer algo
    const isConcorrentesDesconhecido = (rawCmd === prefix + 'concorrentes' || rawCmd === prefix + 'anticoncorrentes') &&
        rawTokens.length > 1 && !isActionCmd && !isListarCmd && subcomando !== 'on' && subcomando !== 'off'

    const isToggleCmd = (
        (rawCmd === prefix + 'anticoncorrencia' || rawCmd === prefix + 'anticoncorrentes') &&
        (rawTokens[1] === 'on' || rawTokens[1] === 'off')
    )

    if (!isAnticoncorrenciaMenu && !isMapCmd && !isPermitirCmd && !isProibirCmd && !isAddManualCmd && !isActionCmd && !isToggleCmd && !isListarCmd && !isConcorrentesDesconhecido) {
        return false
    }

    const isGroup = from.endsWith('@g.us')
    if (!isGroup) {
        await sock.sendMessage(from, { text: '❌ Este comando só pode ser utilizado dentro de grupos.' }, { quoted: msg })
        return true
    }

    const isOwner = isOwnerCheck(sender, msg)
    let isAdm = false
    try { isAdm = await isAdmin(sock, from, sender) } catch {}

    if (!isOwner && !isAdm) {
        await sock.sendMessage(from, { text: '❌ Apenas administradores do grupo ou o Dono podem executar este comando.' }, { quoted: msg })
        return true
    }

    const dotJid = from.replace(/\./g, '___dot___')
    const groupConfig = configManager.loadGroupConfig()
    if (!groupConfig[from]) groupConfig[from] = {}

    if (isToggleCmd) {
        const option = rawTokens[1].toLowerCase()
        const isAtivar = option === 'on'

        groupConfig[from].anticoncorrencia = isAtivar
        configManager.saveGroupConfig(groupConfig)

        const statusStr = isAtivar ? '🟢 *ATIVADO*' : '🔴 *DESATIVADO*'
        const descStr = isAtivar
            ? 'Concorrentes (admins de outros grupos) e usuários na blacklist que entrarem ou estiverem no grupo serão banidos automaticamente.'
            : 'O banimento automático de concorrentes foi desativado.'

        await sock.sendMessage(from, {
            text: `🛡️ *ANTI-CONCORRÊNCIA: ${statusStr}*\n\n${descStr}\n\n💡 Use \`.concorrentes\` para ver a lista de concorrentes no grupo.`
        }, { quoted: msg })
        return true
    }

    if (isPermitirCmd) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
        const alvo = mentioned[0] || quotedParticipant || rawTokens[2]

        if (!alvo) {
            await sock.sendMessage(from, {
                text: '❌ Marque ou informe o concorrente que deseja permitir neste grupo!\n\n_Exemplo: .concorrente permitir @usuario_'
            }, { quoted: msg })
            return true
        }

        const alvoNum = alvo.split('@')[0].split(':')[0].replace(/\D/g, '')
        if (!groupConfig[from].concorrentes_whitelist) {
            groupConfig[from].concorrentes_whitelist = []
        }

        if (!groupConfig[from].concorrentes_whitelist.includes(alvoNum)) {
            groupConfig[from].concorrentes_whitelist.push(alvoNum)
            configManager.saveGroupConfig(groupConfig)
        }

        await sock.sendMessage(from, {
            text: `✅ *CONCORRENTE LIBERADO NESTE GRUPO!*\n\nO usuário @${alvoNum} foi adicionado à lista de exceções (*whitelist*) deste grupo e não será banido pelo Anti-Concorrência.\n\n_Nota: Ele continuará bloqueado nos demais grupos com proteção ativa._`,
            mentions: [alvo]
        }, { quoted: msg })
        return true
    }

    if (isProibirCmd) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
        const alvo = mentioned[0] || quotedParticipant || rawTokens[2]

        if (!alvo) {
            await sock.sendMessage(from, {
                text: '❌ Marque ou informe o concorrente que deseja bloquear/remover da whitelist!\n\n_Exemplo: .concorrente proibir @usuario_'
            }, { quoted: msg })
            return true
        }

        const alvoNum = alvo.split('@')[0].split(':')[0].replace(/\D/g, '')

        if (groupConfig[from].concorrentes_whitelist) {
            groupConfig[from].concorrentes_whitelist = groupConfig[from].concorrentes_whitelist.filter(n => n !== alvoNum)
            configManager.saveGroupConfig(groupConfig)
        }

        await sock.sendMessage(from, {
            text: `🔒 *CONCORRENTE BLOQUEADO NESTE GRUPO!*\n\nO usuário @${alvoNum} agora está sob as regras normais do Anti-Concorrência neste grupo.`,
            mentions: [alvo]
        }, { quoted: msg })
        return true
    }

    if (isAddManualCmd) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
        const alvo = mentioned[0] || quotedParticipant || rawTokens[2]

        if (!alvo) {
            await sock.sendMessage(from, {
                text: '❌ Marque ou informe o usuário que deseja adicionar como concorrente!\n\n_Exemplo: .concorrente add @usuario_'
            }, { quoted: msg })
            return true
        }

        const alvoNum = alvo.split('@')[0].split(':')[0].replace(/\D/g, '')
        const concStoreData = concorrentesStore.loadSync() || {}
        if (!concStoreData.global) concStoreData.global = []

        if (!concStoreData.global.includes(alvoNum)) {
            concStoreData.global.push(alvoNum)
            concorrentesStore.save(concStoreData)
        }

        await sock.sendMessage(from, {
            text: `🚫 *CONCORRENTE ADICIONADO À BLACKLIST GLOBAL!*\n\nO usuário @${alvoNum} foi marcado como concorrente e será barrado em todos os grupos com Anti-Concorrência ativo.`,
            mentions: [alvo]
        }, { quoted: msg })
        return true
    }

    // .anticoncorrencia listar / .concorrentes listar — quem da lista global está neste grupo. Só mostra, nunca remove.
    if (isListarCmd) {
        const dados = concorrentesStore.loadSync() || {}
        const global = new Set((dados.global || []).map(String))
        const whitelist = new Set(groupConfig[from]?.concorrentes_whitelist || [])
        let participantes = []
        try { participantes = (await sock.groupMetadata(from))?.participants || [] } catch {}
        const digitos = v => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
        const noGrupo = participantes.filter(p => [p.id, p.phoneNumber, p.jid, p.lid].some(c => global.has(digitos(c))))
        const linhas = [
            '🛡️ *LISTA DE CONCORRENTES*',
            '────────────────────────',
            `📌 *Proteção neste grupo:* ${groupConfig[from]?.anticoncorrencia ? '🟢 Ativada' : '🔴 Desativada'}`,
            `🌍 *Na lista global:* ${global.size} registo(s)`,
            `👥 *Neste grupo:* ${noGrupo.length}`,
            ''
        ]
        noGrupo.forEach((p, i) => {
            const liberado = [p.id, p.phoneNumber].some(c => whitelist.has(digitos(c)))
            linhas.push(`*${i + 1}.* @${digitos(p.id)}${liberado ? ' 🟢 *(Liberado neste grupo)*' : ' 🔴'}`)
        })
        if (noGrupo.length === 0) linhas.push('✅ Nenhum membro deste grupo está na lista.')
        linhas.push('', `💡 \`${prefix}concorrentes\` mapeia e \`${prefix}concorrentes banir\` remove.`)
        await sock.sendMessage(from, { text: linhas.join('\n'), mentions: noGrupo.map(p => p.id) }, { quoted: msg })
        return true
    }

    // Menu também para subcomandos desconhecidos (antes o bot ficava calado).
    const subDesconhecido = isConcorrentesDesconhecido ||
        (rawCmd.includes('anticoncorrencia') && rawTokens.length > 1 && !isToggleCmd && !isPermitirCmd && !isProibirCmd && !isAddManualCmd)
    if ((isAnticoncorrenciaMenu && rawTokens.length === 1 && rawCmd.includes('anticoncorrencia')) || subDesconhecido) {
        const status = groupConfig[from]?.anticoncorrencia ? '🟢 *ATIVADO*' : '🔴 *DESATIVADO*'
        const whitelist = groupConfig[from]?.concorrentes_whitelist || []
        const whitelistStr = whitelist.length > 0 ? whitelist.map(w => `@${w}`).join(', ') : '_Nenhum (bloqueando todos)_'

        await sock.sendMessage(from, {
            text: [
                '🛡️ *SISTEMA ANTI-CONCORRÊNCIA*',
                '────────────────────────',
                `📌 *Status no Grupo:* ${status}`,
                `🤝 *Liberados (Whitelist Local):* ${whitelistStr}`,
                '',
                '📋 *Comandos de Gerenciamento:*',
                `• \`${prefix}anticoncorrencia on\` ➔ Ativa a proteção automática`,
                `• \`${prefix}anticoncorrencia off\` ➔ Desativa a proteção`,
                `• \`${prefix}anticoncorrencia listar\` ➔ Mostra quem da lista está no grupo`,
                `• \`${prefix}concorrentes\` ➔ Mapeia concorrentes presentes no grupo`,
                `• \`${prefix}concorrentes banir\` ➔ Bane todos os concorrentes mapeados`,
                `• \`${prefix}concorrente permitir @user\` ➔ Libera um parceiro apenas neste grupo`,
                `• \`${prefix}concorrente proibir @user\` ➔ Revoga a liberação do concorrente`
            ].join('\n'),
            mentions: whitelist.map(w => `${w}@s.whatsapp.net`)
        }, { quoted: msg })
        return true
    }

    if (isMapCmd || (rawCmd === prefix + 'concorrentes' && rawTokens.length === 1)) {
        try { await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }) } catch {}

        try {
            const currentGroupMeta = await sock.groupMetadata(from)
            const currentParticipants = currentGroupMeta.participants || []
            const currentAdmins = currentParticipants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => (p.id || '').split('@')[0].split(':')[0].replace(/\D/g, ''))

            const currentCommonMembers = currentParticipants.filter(p => !p.admin)
            // Cada membro comum por número de telefone e por ID interno do WhatsApp (LID), com o seu
            // ID real: é com ele que se marca (@) e se remove. Antes montava-se "<número>@s.whatsapp.net"
            // mesmo quando o número era um LID: a marcação mostrava o LID e o ban falhava.
            const idDoMembro = new Map()
            for (const p of currentCommonMembers) {
                const idReal = p.id || ''
                for (const chave of [idReal, p.phoneNumber, p.jid, p.lid]) {
                    const digitos = String(chave || '').split('@')[0].split(':')[0].replace(/\D/g, '')
                    if (digitos && !idDoMembro.has(digitos)) idDoMembro.set(digitos, idReal)
                }
            }
            const commonMemberNums = new Set(idDoMembro.keys())

            const adminMap = await coletarAdminsDeOutrosGrupos(sock, from)

            const concStoreData = concorrentesStore.loadSync() || {}
            const manualGlobal = concStoreData.global || []

            const whitelistLocal = new Set(groupConfig[from]?.concorrentes_whitelist || [])
            const concorrentesEncontrados = []

            const jaEncontrados = new Set()
            for (const [adminNum, info] of adminMap.entries()) {
                if (commonMemberNums.has(adminNum) && !currentAdmins.includes(adminNum)) {
                    const idReal = idDoMembro.get(adminNum)
                    if (jaEncontrados.has(idReal)) continue
                    jaEncontrados.add(idReal)
                    concorrentesEncontrados.push({
                        ...info,
                        id: idReal,
                        isWhitelisted: whitelistLocal.has(adminNum)
                    })
                }
            }

            for (const manualNum of manualGlobal) {
                if (commonMemberNums.has(manualNum) && !currentAdmins.includes(manualNum) && !adminMap.has(manualNum)) {
                    const idReal = idDoMembro.get(manualNum)
                    if (jaEncontrados.has(idReal)) continue
                    jaEncontrados.add(idReal)
                    concorrentesEncontrados.push({
                        id: idReal,
                        numero: manualNum,
                        grupos: ['Lista global'],
                        gruposIds: [],
                        isWhitelisted: whitelistLocal.has(manualNum)
                    })
                }
            }

            global.concorrentesMapeados[from] = {
                timestamp: Date.now(),
                lista: concorrentesEncontrados
            }

            if (concorrentesEncontrados.length === 0) {
                try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }) } catch {}
                await sock.sendMessage(from, {
                    text: [
                        '🛡️ *MAPEAMENTO DE CONCORRÊNCIA*',
                        '────────────────────────',
                        '✅ *Nenhum concorrente detectado!*',
                        '',
                        'Nenhum administrador de outros grupos autorizados foi encontrado como membro comum neste grupo.'
                    ].join('\n')
                }, { quoted: msg })
                return true
            }

            const linhas = [
                '🛡️ *CONCORRENTES IDENTIFICADOS NO GRUPO*',
                '────────────────────────',
                `👥 *Grupo:* ${currentGroupMeta.subject}`,
                `🚨 *Total Detectados:* ${concorrentesEncontrados.length} concorrente(s)`,
                ''
            ]

            const mentions = []
            concorrentesEncontrados.forEach((c, idx) => {
                const statusTag = c.isWhitelisted ? ' 🟢 *(Liberado neste grupo)*' : ' 🔴 *(Bloqueável)*'
                // Marca com o ID real do membro: o WhatsApp mostra o nome/contacto da pessoa.
                linhas.push(`*${idx + 1}.* @${String(c.id).split('@')[0]}${statusTag}`)
                mentions.push(c.id)
            })

            linhas.push('')
            linhas.push('────────────────────────')
            linhas.push('💡 *Para banir os concorrentes:*')
            linhas.push(`👉 \`${prefix}concorrentes banir\` (bane todos os concorrentes não liberados)`)
            linhas.push(`👉 \`${prefix}concorrente permitir @user\` (libera parceiro neste grupo)`)

            try { await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } }) } catch {}

            await sock.sendMessage(from, {
                text: linhas.join('\n'),
                mentions
            }, { quoted: msg })

            return true

        } catch (err) {
            console.error('[CONCORRENTES-MAP] Erro ao mapear:', err)
            await sock.sendMessage(from, { text: `❌ *Erro ao mapear concorrentes:* ${err.message}` }, { quoted: msg })
            return true
        }
    }

    if (isActionCmd) {
        const cache = global.concorrentesMapeados[from]
        if (!cache || !cache.lista || cache.lista.length === 0 || (Date.now() - cache.timestamp > 15 * 60 * 1000)) {
            await sock.sendMessage(from, {
                text: `⚠️ *Execute primeiro o mapeamento:* digite \`${prefix}concorrentes\` para identificar os concorrentes antes de banir.`
            }, { quoted: msg })
            return true
        }

        const whitelistLocal = new Set(groupConfig[from]?.concorrentes_whitelist || [])
        // Lê os admins de agora (podem ter mudado desde o mapeamento) e nunca remove admins, dono,
        // subdonos nem bots.
        const admins = new Set()
        try {
            const meta = await sock.groupMetadata(from)
            for (const p of meta?.participants || []) {
                if (p.admin) for (const v of [p.id, p.phoneNumber, p.jid, p.lid]) { const d = digitosDe(v); if (d) admins.add(d) }
            }
        } catch {}
        const alvosParaBanir = alvosSeguros(
            cache.lista.filter(c => !whitelistLocal.has(c.numero) && !c.isWhitelisted),
            { admins, bots: numerosDeBots(sock), eDonoOuSubdono: id => isOwnerCheck(id) }
        )

        if (alvosParaBanir.length === 0) {
            await sock.sendMessage(from, {
                text: '✅ Todos os concorrentes detectados estão na sua lista de permissões (whitelist) e foram poupados.'
            }, { quoted: msg })
            return true
        }

        try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }) } catch {}

        // Todos de uma vez (em blocos), não um a um.
        const idDe = a => a.id || `${a.numero}@s.whatsapp.net`
        const idsRemovidos = await removerEmBloco(sock, from, alvosParaBanir.map(idDe))
        const removidos = alvosParaBanir.filter(a => idsRemovidos.has(idDe(a)))
        const mentions = removidos.map(idDe)

        const numerosRemovidos = new Set(removidos.map(r => r.numero))
        cache.lista = cache.lista.filter(c => !numerosRemovidos.has(c.numero))

        try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }) } catch {}

        const relatorio = [
            '🛡️ *CONCORRENTES REMOVIDOS COM SUCESSO!*',
            '────────────────────────',
            `🚫 *Total Removidos:* ${removidos.length} concorrente(s)`,
            ''
        ]

        removidos.forEach((r, i) => {
            relatorio.push(`*${i + 1}.* @${String(r.id || r.numero).split('@')[0]}`)
        })

        await sock.sendMessage(from, {
            text: relatorio.join('\n'),
            mentions
        }, { quoted: msg })

        return true
    }

    return false
}

module.exports.numerosParaAnticoncorrencia = numerosParaAnticoncorrencia
module.exports.alvosSeguros = alvosSeguros
module.exports.removerEmBloco = removerEmBloco
