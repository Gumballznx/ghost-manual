const test = require('node:test')
const assert = require('node:assert')
const { numerosParaAnticoncorrencia } = require('../src/comandos/adm/concorrentesCmd')

test('adiciona todos menos o bot, o dono e os subdonos', () => {
    const participantes = [
        { id: '258841111111@s.whatsapp.net' },
        { id: '258842222222@s.whatsapp.net' },
        { id: '258849999999@s.whatsapp.net' }, // bot
        { id: '258840000000@s.whatsapp.net' }, // dono
        { id: '258841111111@s.whatsapp.net' }  // repetido
    ]
    const r = numerosParaAnticoncorrencia(participantes, {
        numeroDoBot: '258849999999',
        eDonoOuSubdono: id => String(id).includes('258840000000')
    })
    assert.deepStrictEqual(r.novos, ['258841111111', '258842222222'])
    assert.strictEqual(r.ignorados, 2)
})

test('guarda o número e o LID do mesmo membro', () => {
    const r = numerosParaAnticoncorrencia([{ id: '214752727082308@lid', phoneNumber: '258845551234@s.whatsapp.net' }])
    assert.deepStrictEqual(r.novos.sort(), ['214752727082308', '258845551234'])
})
