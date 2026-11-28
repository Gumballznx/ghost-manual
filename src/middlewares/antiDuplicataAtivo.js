// Proteção do anti-duplicata (.antiduplicata on): quem entra no grupo já estando noutro grupo do
// mesmo sub-bot (com licença ativa) é banido. Nunca admins, dono/subdonos nem bots.
const configManager = require('../utils/configManager')
const { isOwnerCheck, isLeaderCheck, getGroupMetadataCached } = require('../utils/baileys')
const ad = require('../utils/antiDuplicata')

async function antiDuplicataAtivo(sock, update, deps = {}) {
    if (update.action !== 'add') return
    const { id: groupId, participants } = update
    if (!groupId || !groupId.endsWith('@g.us')) return

    const gInfo = (deps.configManager || configManager).getGroupEntry(groupId)
    if (!gInfo?.authorized || gInfo?.antiduplicata !== true) return

    const { grupos } = deps.gruposDoSubbot
        ? deps.gruposDoSubbot(groupId)
        : require('../comandos/adm/antiDuplicataCmd').gruposDoSubbotAtual(groupId, deps.configManager || configManager)
    if (!grupos.length) return

    const lerGrupo = deps.lerGrupo || (gid => getGroupMetadataCached(sock, gid))
    const { outros } = await ad.lerOutrosGrupos(grupos, lerGrupo)
    if (!outros.length) return

    const bots = deps.numerosDeBots ? deps.numerosDeBots(sock) : require('../comandos/adm/concorrentesCmd').numerosDeBots(sock)
    const eDono = deps.eDonoOuSubdono || (id => isLeaderCheck(id) || isOwnerCheck(id))
    const permitidos = new Set((gInfo.antiduplicata_permitidos || []).map(String))

    // Admins de ESTE grupo nunca são banidos (quem tem poder aqui pode estar em vários grupos).
    let admins = new Set()
    try {
        const meta = await lerGrupo(groupId)
        admins = new Set((meta?.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin').flatMap(p => ad.chavesDoParticipante(p)))
    } catch {}

    const novos = (participants || []).map(p => (typeof p === 'string' ? { id: p } : p))
    const dup = ad.duplicadosEntre(novos, outros, chaves =>
        chaves.some(c => admins.has(c) || bots.has(c) || permitidos.has(c) || eDono(c)))
    const removidos = []
    for (const d of dup) {
        const jid = d.id || `${d.numero}@s.whatsapp.net`
        removidos.push(jid)
        try {
            await sock.sendMessage(groupId, {
                text: `🛡️ *ANTI-DUPLICATA ATIVADO*\n\n🚫 @${d.numero} já está noutro grupo deste sub-bot (_${d.grupos.join(', ')}_) e foi banido automaticamente deste grupo.`,
                mentions: [jid]
            })
            setTimeout(async () => {
                try { await sock.groupParticipantsUpdate(groupId, [jid], 'remove') } catch (err) { console.error('[Anti-Duplicata] Erro ao banir:', err.message) }
            }, 800)
        } catch (err) {
            console.error('[Anti-Duplicata] Erro ao avisar:', err.message)
        }
    }
    return removidos
}

module.exports = antiDuplicataAtivo
