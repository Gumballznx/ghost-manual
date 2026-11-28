const test = require('node:test')
const assert = require('node:assert/strict')

test('só 1 ligação por pessoa: encontra a outra ligação do mesmo dono', () => {
    const sm = require('../src/bot/subbotManager')
    sm.dados = { subbots: {
        '258858209603': { numero: '258858209603', criadoPor: '258871111111@s.whatsapp.net', grupos: [] },
        '258845286985': { numero: '258845286985', criadoPor: '258872222222@s.whatsapp.net', grupos: [] }
    } }
    const outra = sm.outraLigacaoDoUsuario('258871111111@s.whatsapp.net', '258840000000')
    assert.equal(outra && outra.numero, '258858209603')
    // a mesma ligação (religar o mesmo número) não conta
    assert.equal(sm.outraLigacaoDoUsuario('258871111111@s.whatsapp.net', '258858209603'), null)
    // quem não tem ligação pode ligar
    assert.equal(sm.outraLigacaoDoUsuario('258879999999@s.whatsapp.net', '258840000000'), null)
})
