// Anti-duplicata (manual): membros de um grupo que também estão noutro grupo do MESMO sub-bot.
// - mapear: quem do grupo está noutros grupos da Central (e em quais);
// - banir: tira esses membros do grupo onde o comando é usado (nunca admins, dono/subdonos nem bots);
// - proteção automática: quem entra já estando noutro grupo da Central é banido.

const digitos = v => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const normCentral = v => String(v || '').replace(/—|–|－/g, '-').trim().toUpperCase()

/** Identificadores de um participante (número e/ou LID do WhatsApp), só dígitos. */
function chavesDoParticipante(p) {
    const id = typeof p === 'string' ? p : (p?.id || p?.jid || '')
    return [...new Set([digitos(id), digitos(p?.jid), digitos(p?.phoneNumber), digitos(p?.lid)].filter(Boolean))]
}

const normGrupo = g => String(g || '').trim().replace(/___dot___/g, '.')

/** Licença do grupo ativa? (autorizado e dentro do prazo). `agora` em ms (hora de Moçambique). */
function licencaAtiva(entrada, agora) {
    return !!entrada && entrada.authorized === true && (!entrada.expiraEm || agora < entrada.expiraEm)
}

/**
 * Grupos do MESMO sub-bot que `groupId` com licença ativa. `subbots` = { numero: { grupos: [...] } }
 * (os registos do sub-bot), `getEntrada(gid)` = configuração do grupo. Só funciona em grupos ligados a
 * um sub-bot (.subbot vincular). Devolve { subbot, grupos }.
 */
function gruposDoMesmoSubbot(subbots, getEntrada, groupId, agora) {
    const gid = normGrupo(groupId)
    let numero = ''
    for (const [num, sb] of Object.entries(subbots || {})) {
        if ((sb?.grupos || []).map(normGrupo).includes(gid)) { numero = num; break }
    }
    if (!numero) return { subbot: '', grupos: [] }
    const grupos = []
    for (const g of (subbots[numero].grupos || []).map(normGrupo)) {
        if (g === gid || !g.endsWith('@g.us') || grupos.includes(g)) continue
        if (!licencaAtiva(getEntrada(g), agora)) continue
        grupos.push(g)
    }
    return { subbot: numero, grupos }
}

/**
 * Para cada participante de `participantes`, em que outros grupos da Central ele está.
 * `outros` = [{ id, nome, participantes }]. `ignorar(chaves, p)` = true para quem não conta
 * (admins deste grupo, bots, dono/subdonos). Devolve [{ id, numero, chaves, grupos: [nomes] }].
 */
function duplicadosEntre(participantes, outros, ignorar = () => false) {
    const indice = new Map() // chave -> [nome do grupo]
    for (const o of outros) {
        for (const p of o.participantes || []) {
            for (const c of chavesDoParticipante(p)) {
                const lista = indice.get(c) || []
                if (!lista.includes(o.nome)) lista.push(o.nome)
                indice.set(c, lista)
            }
        }
    }
    const res = []
    for (const p of participantes || []) {
        const chaves = chavesDoParticipante(p)
        if (!chaves.length || ignorar(chaves, p)) continue
        const grupos = []
        for (const c of chaves) for (const nome of indice.get(c) || []) if (!grupos.includes(nome)) grupos.push(nome)
        if (!grupos.length) continue
        const id = typeof p === 'string' ? p : (p?.id || p?.jid || '')
        res.push({ id, numero: digitos(p?.phoneNumber) || digitos(p?.jid) || digitos(id), chaves, grupos })
    }
    return res
}

/**
 * Lê os outros grupos da Central. `lerGrupo(gid)` devolve { subject, participants } ou null.
 * Devolve { outros, naoLidos } (grupos que o bot não conseguiu ler: não está lá).
 */
async function lerOutrosGrupos(gids, lerGrupo) {
    const outros = []
    const naoLidos = []
    for (const gid of gids) {
        let meta = null
        try { meta = await lerGrupo(gid) } catch { meta = null }
        if (meta && Array.isArray(meta.participants)) outros.push({ id: gid, nome: meta.subject || 'Outro grupo', participantes: meta.participants })
        else naoLidos.push(gid)
    }
    return { outros, naoLidos }
}

module.exports = { digitos, normGrupo, licencaAtiva, chavesDoParticipante, gruposDoMesmoSubbot, duplicadosEntre, lerOutrosGrupos }
