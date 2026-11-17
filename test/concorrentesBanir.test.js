const test = require('node:test')
const assert = require('node:assert/strict')
const cmd = require('../src/comandos/adm/concorrentesCmd')
const { alvosSeguros, removerEmBloco } = cmd

test('nunca remove admins, bots, dono ou subdonos', () => {
    const lista = [
        { id: '111@lid', numero: '258841111111' },
        { id: '222@lid', numero: '258842222222' }, // admin
        { id: '333@lid', numero: '258843333333' }, // bot
        { id: '444@lid', numero: '258844444444' }  // dono
    ]
    const r = alvosSeguros(lista, {
        admins: new Set(['222']),
        bots: new Set(['258843333333']),
        eDonoOuSubdono: id => String(id).includes('258844444444')
    })
    assert.deepEqual(r.map(c => c.id), ['111@lid'])
})

test('remove todos de uma vez (em blocos), não um a um', async () => {
    const chamadas = []
    const sock = { groupParticipantsUpdate: async (g, ids) => { chamadas.push(ids); return ids.map(jid => ({ jid, status: '200' })) } }
    const ids = Array.from({ length: 60 }, (_, i) => `${i}@lid`)
    const removidos = await removerEmBloco(sock, 'g@g.us', ids, 50)
    assert.equal(chamadas.length, 2)
    assert.equal(chamadas[0].length, 50)
    assert.equal(removidos.size, 60)
})

test('.concorrentes listar só mostra; nunca remove ninguém', async () => {
    const g = 'grupo-teste@g.us'
    global.concorrentesMapeados = global.concorrentesMapeados || {}
    global.concorrentesMapeados[g] = { timestamp: Date.now(), lista: [{ id: '111@lid', numero: '111' }] }
    const enviados = []
    let removeu = false
    const sock = {
        user: { id: '258849999999@s.whatsapp.net' },
        groupMetadata: async () => ({ subject: 'T', participants: [{ id: '111@lid' }, { id: '258840000001@s.whatsapp.net', admin: 'admin' }] }),
        groupParticipantsUpdate: async () => { removeu = true; return [] },
        sendMessage: async (to, m) => { enviados.push(m) }
    }
    for (const t of ['.concorrentes listar', '.concorrentes lista', '.anticoncorrentes listar', '.concorrentes xyz']) {
        const r = await cmd(sock, { key: {} }, g, '258840000001@s.whatsapp.net', t)
        assert.equal(r, true, t)
    }
    assert.equal(removeu, false)
    assert.ok(enviados.some(m => /LISTA DE CONCORRENTES/.test(m.text || '')))
})
