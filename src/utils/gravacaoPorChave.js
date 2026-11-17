/**
 * Gravação "só do que mudou" para nós do Firebase partilhados por mais de um processo.
 *
 * O ghost-auto e o ghost-manual usam os mesmos nós (ex.: bot_data/group_config). Antes, cada um
 * gravava o objeto INTEIRO que tinha em memória (PUT); se o outro bot tinha acrescentado um grupo
 * depois, essa gravação apagava-o (foi assim que um aluguel de 40 dias desapareceu).
 *
 * Agora cada processo guarda a "base" — o que viu no Firebase (ou gravou) por chave de topo — e
 * só envia (PATCH) as chaves que ele próprio mudou; chaves que ele apagou vão como null. Chaves
 * que só o outro processo conhece nunca são tocadas.
 */

function mapaPorChave(obj) {
    const m = new Map()
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) m.set(k, JSON.stringify(v))
    }
    return m
}

const eObjetoSimples = v => !!v && typeof v === 'object' && !Array.isArray(v)

function criarRastreador() {
    let base = null

    return {
        /** Define a base a partir do que está no Firebase (ou no ficheiro local, já sanitizado). */
        definirBase(objSanitizado) { base = mapaPorChave(objSanitizado) },
        temBase() { return base !== null },
        /**
         * Compara o payload (já sanitizado) com a base.
         * Devolve { alteracoes, atual }: alteracoes = { chave: valor | null }; atual = nova base a
         * confirmar depois de a gravação dar certo.
         */
        diferencas(payloadSanitizado) {
            const atual = mapaPorChave(payloadSanitizado)
            const alteracoes = {}
            for (const [k, v] of atual) {
                if (!base || base.get(k) !== v) alteracoes[k] = payloadSanitizado[k]
            }
            if (base) {
                for (const k of base.keys()) if (!atual.has(k)) alteracoes[k] = null
            }
            return { alteracoes, atual }
        },
        confirmar(atual) { base = atual },
    }
}

module.exports = { criarRastreador, mapaPorChave, eObjetoSimples }
