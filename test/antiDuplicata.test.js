const test = require('node:test')
const assert = require('node:assert/strict')
const ad = require('../src/utils/antiDuplicata')

const subbots = { '258840000000': { grupos: ['a@g.us', 'b@g.us', 'c@g.us', 'x@g.us', 'e___dot___x@g.us'] } }
const AGORA = 1000
const entradas = {
    'a@g.us': { authorized: true },
    'b@g.us': { authorized: true, expiraEm: 5000 },
    'c@g.us': { authorized: true, expiraEm: 500 },      // licença expirada
    'x@g.us': { authorized: false },                    // sem licença
    'e.x@g.us': { authorized: true }
}

test('outros grupos do mesmo sub-bot com licença ativa', () => {
    const r = ad.gruposDoMesmoSubbot(subbots, g => entradas[g], 'a@g.us', AGORA)
    assert.equal(r.subbot, '258840000000')
    assert.deepEqual(r.grupos.sort(), ['b@g.us', 'e.x@g.us'].sort())
    // grupo que não é de nenhum sub-bot: não funciona
    assert.deepEqual(ad.gruposDoMesmoSubbot(subbots, g => entradas[g], 'zzz@g.us', AGORA), { subbot: '', grupos: [] })
})

test('duplicados: casa por número ou por LID, em vários grupos, e respeita quem se ignora', () => {
    const aqui = [
        { id: '111@lid', phoneNumber: '258841111111@s.whatsapp.net' },
        { id: '258842222222@s.whatsapp.net' },
        { id: '258843333333@s.whatsapp.net', admin: 'admin' },
        { id: '258844444444@s.whatsapp.net' }
    ]
    const outros = [
        { id: 'b@g.us', nome: 'Grupo B', participantes: [{ id: '258841111111@s.whatsapp.net' }, { id: '258843333333@s.whatsapp.net' }] },
        { id: 'c@g.us', nome: 'Grupo C', participantes: [{ id: '222@lid', phoneNumber: '258842222222@s.whatsapp.net' }, { id: '111@lid' }] }
    ]
    const ignorar = (chaves, p) => p.admin === 'admin'
    const r = ad.duplicadosEntre(aqui, outros, ignorar)
    assert.equal(r.length, 2)
    const um = r.find(x => x.numero === '258841111111')
    assert.deepEqual(um.grupos.sort(), ['Grupo B', 'Grupo C'])
    assert.deepEqual(r.find(x => x.numero === '258842222222').grupos, ['Grupo C'])
    assert.ok(!r.find(x => x.numero === '258843333333'))
    assert.ok(!r.find(x => x.numero === '258844444444'))
})

test('grupos que o bot não consegue ler ficam à parte', async () => {
    const r = await ad.lerOutrosGrupos(['b@g.us', 'c@g.us'], async gid => (gid === 'b@g.us' ? { subject: 'B', participants: [] } : null))
    assert.equal(r.outros.length, 1)
    assert.deepEqual(r.naoLidos, ['c@g.us'])
})

const cmd = require('../src/comandos/adm/antiDuplicataCmd')
const protecao = require('../src/middlewares/antiDuplicataAtivo')

const metas = {
    'a@g.us': { subject: 'A', participants: [
        { id: '258841111111@s.whatsapp.net' },
        { id: '258842222222@s.whatsapp.net' },
        { id: '258849999999@s.whatsapp.net', admin: 'admin' },
        { id: '258848888888@s.whatsapp.net' }
    ] },
    'b@g.us': { subject: 'B', participants: [
        { id: '258841111111@s.whatsapp.net' }, { id: '258849999999@s.whatsapp.net' }, { id: '258847777777@s.whatsapp.net' }
    ] }
}
const baileys = { isOwnerCheck: () => true, isAdmin: async () => true }
const mkCfg = (extra = {}) => {
    const grupos = { 'a@g.us': { authorized: true, ...extra } }
    return { loadGroupConfig: () => grupos, saveGroupConfig: g => Object.assign(grupos, g), getGroupEntry: gid => grupos[gid] || {}, _g: grupos }
}
const baseDeps = cfg => ({
    baileys, configManager: cfg,
    gruposDoSubbot: gid => (gid === 'a@g.us' ? { subbot: '258840000000', grupos: ['b@g.us', 'c@g.us'] } : { subbot: '', grupos: [] }),
    lerGrupo: async gid => metas[gid] || null,
    numerosDeBots: () => new Set(['258848888888']),
    eDonoOuSubdono: () => false,
    concorrentesCmd: { numerosDeBots: () => new Set(), removerEmBloco: async (s, g, ids) => { removeu.push(...ids); return new Set(ids) } }
})
const removeu = []

test('.duplicados mostra só quem está noutro grupo (sem admins nem bots) e avisa dos grupos não lidos', async () => {
    const out = []
    const sock = { sendMessage: async (f, m) => { if (m.text) out.push(m.text) } }
    assert.equal(await cmd(sock, { key: {} }, 'a@g.us', 'u@s', '.duplicados', baseDeps(mkCfg())), true)
    assert.match(out[0], /1\* membro/)
    assert.match(out[0], /@258841111111 — B/)
    assert.doesNotMatch(out[0], /258849999999/)
    assert.match(out[0], /1 grupo\(s\) do sub-bot não foram lidos/)
})

test('.banduplicados remove em bloco só os duplicados', async () => {
    removeu.length = 0
    const out = []
    const sock = { sendMessage: async (f, m) => { if (m.text) out.push(m.text) } }
    await cmd(sock, { key: {} }, 'a@g.us', 'u@s', '.banduplicados', baseDeps(mkCfg()))
    assert.deepEqual(removeu, ['258841111111@s.whatsapp.net'])
    assert.match(out[0], /Removidos: \*1\* de 1/)
})

test('.antiduplicata on/off e permitir guardam no grupo', async () => {
    const cfg = mkCfg()
    const sock = { sendMessage: async () => {} }
    const deps = baseDeps(cfg)
    await cmd(sock, { key: {} }, 'a@g.us', 'u@s', '.antiduplicata on', deps)
    assert.equal(cfg._g['a@g.us'].antiduplicata, true)
    await cmd(sock, { key: {}, message: { extendedTextMessage: { contextInfo: { mentionedJid: ['258841111111@s.whatsapp.net'] } } } }, 'a@g.us', 'u@s', '.antiduplicata permitir @x', deps)
    assert.deepEqual(cfg._g['a@g.us'].antiduplicata_permitidos, ['258841111111'])
    await cmd(sock, { key: {} }, 'a@g.us', 'u@s', '.antiduplicata off', deps)
    assert.equal(cfg._g['a@g.us'].antiduplicata, false)
})

test('proteção automática: bane quem entra já estando noutro grupo da Central, não admins nem permitidos', async () => {
    const enviadas = []
    const sock = { sendMessage: async (f, m) => { enviadas.push(m.text) }, groupParticipantsUpdate: async () => {} }
    const cfg = mkCfg({ antiduplicata: true, antiduplicata_permitidos: ['258847777777'] })
    const deps = {
        configManager: cfg,
        gruposDoSubbot: gid => (gid === 'a@g.us' ? { subbot: '258840000000', grupos: ['b@g.us'] } : { subbot: '', grupos: [] }),
        lerGrupo: async gid => metas[gid] || null,
        numerosDeBots: () => new Set(),
        eDonoOuSubdono: () => false
    }
    const r = await protecao(sock, { action: 'add', id: 'a@g.us', participants: ['258841111111@s.whatsapp.net', '258849999999@s.whatsapp.net', '258847777777@s.whatsapp.net', '258846666666@s.whatsapp.net'] }, deps)
    assert.deepEqual(r, ['258841111111@s.whatsapp.net'])
    assert.match(enviadas[0], /ANTI-DUPLICATA ATIVADO/)
    // desligado: não faz nada
    assert.equal(await protecao(sock, { action: 'add', id: 'a@g.us', participants: ['258841111111@s.whatsapp.net'] }, { ...deps, configManager: mkCfg({ antiduplicata: false }) }), undefined)
})

test('grupo sem sub-bot: o comando explica que é só para quem tem sub-bot', async () => {
    const out = []
    const sock = { sendMessage: async (f, m) => { if (m.text) out.push(m.text) } }
    await cmd(sock, { key: {} }, 'z@g.us', 'u@s', '.duplicados', baseDeps(mkCfg()))
    assert.match(out[out.length - 1], /só para quem tem sub-bot/)
})
