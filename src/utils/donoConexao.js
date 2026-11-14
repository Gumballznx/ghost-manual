// Verifica se quem enviou a mensagem é o "dono da conexão" (sub-bot) que atende o grupo.
// Vale quando:
//  - a mensagem foi enviada pelo próprio número do sub-bot (fromMe numa conexão de sub-bot), ou
//  - o remetente é o número/criador de um sub-bot que tem este grupo na lista "grupos".
// Em ambos os casos o sub-bot precisa estar vinculado ao grupo em questão.

function limparNumero(jid) {
    return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function isDonoConexaoDoGrupo(sock, sender, msg, groupJid) {
    if (!groupJid || !String(groupJid).endsWith('@g.us')) return false
    let subbotManager
    try {
        subbotManager = require('../bot/subbotManager')
    } catch {
        return false
    }
    const subbots = (subbotManager && subbotManager.dados && subbotManager.dados.subbots) || {}
    const dotJid = groupJid.replace(/\./g, '___dot___')
    const atendeGrupo = (sb) => Array.isArray(sb && sb.grupos) && (sb.grupos.includes(groupJid) || sb.grupos.includes(dotJid))

    // 1) Mensagem enviada pelo próprio número do sub-bot que atende o grupo
    if (msg && msg.key && msg.key.fromMe && msg._viaSubbot) {
        const numSock = limparNumero(sock && sock.user && sock.user.id)
        if (numSock) {
            for (const [num, sb] of Object.entries(subbots)) {
                if (limparNumero(num) === numSock && atendeGrupo(sb)) return true
            }
        }
    }

    // 2) Remetente é dono (número ou criador) de um sub-bot vinculado ao grupo
    if (sender && typeof subbotManager.getSubbotsDoUsuario === 'function') {
        try {
            const meus = subbotManager.getSubbotsDoUsuario(sender) || []
            if (meus.some(atendeGrupo)) return true
        } catch {}
    }
    return false
}

module.exports = { isDonoConexaoDoGrupo }
