// Só para grupos ligados a um sub-bot (.subbot vincular): conta os outros grupos desse sub-bot com
// licença ativa.
// .duplicados          mapeia quem deste grupo está noutro grupo do mesmo sub-bot
// .banduplicados       bane esses membros deste grupo (em bloco; nunca admins, dono/subdonos nem bots)
// .antiduplicata on|off|status|permitir @user   protecção que fica ligada: quem entra já estando
//                      noutro grupo da Central é banido
const config = require('../../../data/config.json')
const ad = require('../../utils/antiDuplicata')

const MAX_LISTA = 25

function caixa(titulo, linhas) {
    return [`╭─── ${titulo} ───╮`, '│', ...linhas.map(l => (l ? `│ ${l}` : '│')), '│', '╰────────────────────────────╯'].join('\n')
}

/** Grupos do mesmo sub-bot com licença ativa (lê o gestor de sub-bots e a configuração dos grupos). */
function gruposDoSubbotAtual(gid, configManager) {
    const subbotManager = require('../../bot/subbotManager')
    const { getDataMocambique } = require('../../utils/timezone')
    return ad.gruposDoMesmoSubbot(subbotManager.dados?.subbots || {}, g => configManager.getGroupEntry(g), gid, getDataMocambique().getTime())
}

/** Mapeia os duplicados do grupo. Devolve { central, duplicados, naoLidos, totalOutros } ou { erro }. */
async function mapear({ sock, from, deps }) {
    const { subbot, grupos } = deps.gruposDoSubbot(from)
    if (!subbot) return { erro: 'Este grupo não está ligado a um sub-bot. Esta função é só para quem tem sub-bot (use .subbot vincular).' }
    if (!grupos.length) return { erro: 'O sub-bot não tem outros grupos com licença ativa.' }
    const central = `+${subbot}`
    const meta = await deps.lerGrupo(from)
    if (!meta || !Array.isArray(meta.participants)) return { erro: 'Não consegui ler os membros deste grupo. Tente de novo.' }
    const { outros, naoLidos } = await ad.lerOutrosGrupos(grupos, deps.lerGrupo)
    const admins = new Set(meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').flatMap(p => ad.chavesDoParticipante(p)))
    const bots = deps.numerosDeBots(sock)
    const duplicados = ad.duplicadosEntre(meta.participants, outros, (chaves, p) =>
        chaves.some(c => admins.has(c) || bots.has(c) || deps.eDonoOuSubdono(c)) || deps.eDonoOuSubdono(p?.id || ''))
    const permitidos = new Set((deps.permitidos(from) || []).map(String))
    const finais = duplicados.filter(d => !d.chaves.some(c => permitidos.has(c)))
    return { central, duplicados: finais, naoLidos, totalOutros: outros.length, membros: meta.participants.length }
}

function textoMapa(r, prefix) {
    if (!r.duplicados.length) {
        return caixa('✅ *SEM DUPLICADOS*', [
            `Sub-bot: \`${r.central}\``,
            `Nenhum dos ${r.membros} membros está noutro grupo (${r.totalOutros} grupo(s) verificados).`,
            ...(r.naoLidos.length ? ['', `⚠️ ${r.naoLidos.length} grupo(s) do sub-bot não foram lidos (o bot não está lá).`] : [])
        ])
    }
    const linhas = [
        `Sub-bot: \`${r.central}\``,
        `👥 *${r.duplicados.length}* membro(s) deste grupo também estão noutro grupo do mesmo sub-bot`,
        ''
    ]
    r.duplicados.slice(0, MAX_LISTA).forEach((d, i) => linhas.push(`${i + 1}. @${d.numero} — ${d.grupos.join(', ')}`))
    if (r.duplicados.length > MAX_LISTA) linhas.push(`... e mais ${r.duplicados.length - MAX_LISTA}`)
    if (r.naoLidos.length) linhas.push('', `⚠️ ${r.naoLidos.length} grupo(s) do sub-bot não foram lidos (o bot não está lá).`)
    linhas.push('', `🔨 Banir todos: \`${prefix}banduplicados\``, `🛡️ Proteção automática: \`${prefix}antiduplicata on\``)
    return caixa('🔎 *MEMBROS DUPLICADOS*', linhas)
}

module.exports = async function antiDuplicataCmd(sock, msg, from, sender, text, deps = {}) {
    const prefix = config.prefix || '.'
    const partes = String(text || '').trim().split(/\s+/)
    const cmd = (partes[0] || '').toLowerCase()
    const eMapa = [prefix + 'duplicados', prefix + 'duplicadas', prefix + 'mapearduplicados', prefix + 'duplicatas'].includes(cmd)
    const eBan = [prefix + 'banduplicados', prefix + 'banirduplicados', prefix + 'banduplicadas'].includes(cmd)
    const eToggle = cmd === prefix + 'antiduplicata' || cmd === prefix + 'antiduplicatas' || cmd === prefix + 'antiduplicado'
    if (!eMapa && !eBan && !eToggle) return false
    const responder = (t, mentions) => sock.sendMessage(from, { text: t, mentions: mentions || [] }, { quoted: msg })

    const baileys = deps.baileys || require('../../utils/baileys')
    const configManager = deps.configManager || require('../../utils/configManager')
    if (!from.endsWith('@g.us')) {
        await responder('❌ Use este comando dentro do grupo.')
        return true
    }
    let adm = false
    const dono = baileys.isOwnerCheck(sender, msg)
    if (!dono) { try { adm = await baileys.isAdmin(sock, from, sender) } catch {} }
    if (!dono && !adm) {
        await responder('❌ Só o dono ou um admin do grupo pode usar este comando.')
        return true
    }

    const cc = deps.concorrentesCmd || require('./concorrentesCmd')
    const depsMapa = {
        gruposDoSubbot: deps.gruposDoSubbot || (gid => gruposDoSubbotAtual(gid, configManager)),
        lerGrupo: deps.lerGrupo || (gid => baileys.getGroupMetadataCached(sock, gid)),
        numerosDeBots: deps.numerosDeBots || cc.numerosDeBots,
        eDonoOuSubdono: deps.eDonoOuSubdono || (id => baileys.isOwnerCheck(id)),
        permitidos: gid => (configManager.getGroupEntry(gid)?.antiduplicata_permitidos || [])
    }

    if (eToggle) {
        const sub = (partes[1] || '').toLowerCase()
        const grupos = configManager.loadGroupConfig()
        if (!grupos[from]) grupos[from] = {}
        if (sub === 'on' || sub === 'off') {
            grupos[from].antiduplicata = sub === 'on'
            configManager.saveGroupConfig(grupos)
            await responder(sub === 'on'
                ? caixa('🟢 *ANTI-DUPLICATA LIGADO*', [
                    'Quem entrar neste grupo já estando noutro grupo do mesmo sub-bot (com licença ativa) é banido na hora.',
                    '',
                    `Quem já está cá: \`${prefix}duplicados\` (ver) e \`${prefix}banduplicados\` (banir).`
                ])
                : caixa('🔴 *ANTI-DUPLICATA DESLIGADO*', ['Ninguém será banido automaticamente por estar noutro grupo.']))
            return true
        }
        if (sub === 'permitir' || sub === 'perdoar') {
            const alvos = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            const citado = msg.message?.extendedTextMessage?.contextInfo?.participant
            const alvo = alvos[0] || citado || partes[2]
            const num = ad.digitos(alvo)
            if (!num) {
                await responder(`❌ Marque a pessoa. Ex.: \`${prefix}antiduplicata permitir @pessoa\``)
                return true
            }
            const lista = grupos[from].antiduplicata_permitidos || []
            if (!lista.includes(num)) lista.push(num)
            grupos[from].antiduplicata_permitidos = lista
            configManager.saveGroupConfig(grupos)
            await responder(caixa('✅ *PERMITIDO NESTE GRUPO*', [`@${num} pode ficar aqui mesmo estando noutro grupo do sub-bot.`]), [`${num}@s.whatsapp.net`])
            return true
        }
        const ativo = configManager.getGroupEntry(from)?.antiduplicata === true
        await responder(caixa('🛡️ *ANTI-DUPLICATA*', [
            `Estado: ${ativo ? '🟢 *ligado*' : '🔴 *desligado*'}`,
            '',
            `\`${prefix}antiduplicata on\` / \`off\``,
            `\`${prefix}duplicados\` — ver quem está em mais grupos do sub-bot`,
            `\`${prefix}banduplicados\` — banir esses membros`,
            `\`${prefix}antiduplicata permitir @pessoa\` — deixar uma pessoa ficar`
        ]))
        return true
    }

    try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }) } catch {}
    const r = await mapear({ sock, from, deps: depsMapa })
    if (r.erro) {
        await responder(`❌ ${r.erro}`)
        return true
    }

    if (eMapa) {
        await responder(textoMapa(r, prefix), r.duplicados.slice(0, MAX_LISTA).map(d => `${d.numero}@s.whatsapp.net`))
        return true
    }

    // banir
    if (!r.duplicados.length) {
        await responder(textoMapa(r, prefix))
        return true
    }
    const ids = r.duplicados.map(d => d.id).filter(Boolean)
    const removidos = await cc.removerEmBloco(sock, from, ids)
    const falharam = ids.length - removidos.size
    await responder(caixa('🔨 *DUPLICADOS BANIDOS*', [
        `Sub-bot: \`${r.central}\``,
        `🚫 Removidos: *${removidos.size}* de ${ids.length}`,
        ...(falharam > 0 ? [`⚠️ Não consegui remover ${falharam} (o bot precisa de ser admin do grupo).`] : []),
        '',
        `🛡️ Para barrar quem entrar depois: \`${prefix}antiduplicata on\``
    ]))
    return true
}

module.exports.mapear = mapear
module.exports.gruposDoSubbotAtual = gruposDoSubbotAtual
