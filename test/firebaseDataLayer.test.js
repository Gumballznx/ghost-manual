const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

// Firebase falso, injetado antes de carregar a camada de dados
const chamadas = []
let dadosRemotos = null
const fake = {
    FIREBASE_DB_URL: 'https://teste.invalid',
    fetchFirebase: async (p) => { chamadas.push(['GET', p]); return dadosRemotos },
    putFirebase: async (p, d) => { chamadas.push(['PUT', p, d]); return true },
    patchFirebase: async (p, d) => { chamadas.push(['PATCH', p, d]); return true }
}
const cfgPath = require.resolve(path.join(__dirname, '../src/utils/firebaseConfig'))
require.cache[cfgPath] = { id: cfgPath, filename: cfgPath, loaded: true, exports: fake }

const { createStore } = require('../src/utils/firebaseDataLayer')
const espera = () => new Promise(r => setTimeout(r, 5))

test('grupo acrescentado pelo outro bot não é apagado; só vai o que mudou aqui', async () => {
    chamadas.length = 0
    dadosRemotos = { 'g1@g___dot___us': { authorized: true }, 'g2@g___dot___us': { authorized: true } }
    const st = createStore('teste_manual', 'bot_data/teste_manual', null, {}, 0)
    const dados = await st.load()
    st.save(null, true) // nada mudou
    dados['g1@g.us'].expiraEm = 123
    delete dados['g2@g.us']
    st.save(null, true)
    await espera()
    assert.equal(chamadas.filter(c => c[0] === 'PUT').length, 0)
    const patches = chamadas.filter(c => c[0] === 'PATCH')
    assert.equal(patches.length, 1)
    assert.deepEqual(patches[0][2], { 'g1@g___dot___us': { authorized: true, expiraEm: 123 }, 'g2@g___dot___us': null })
})

test('leitura falhada não regrava a cópia local por cima do Firebase', async () => {
    chamadas.length = 0
    dadosRemotos = null
    const fs = require('fs'), os = require('os')
    const ficheiro = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gm-')), 'local.json')
    fs.writeFileSync(ficheiro, JSON.stringify({ 'g1@g.us': { authorized: true } }))
    const st = createStore('teste_manual_local', 'bot_data/teste_manual_local', ficheiro, {}, 0)
    const dados = await st.load()
    await espera()
    assert.equal(chamadas.filter(c => c[0] !== 'GET').length, 0)
    dados['g9@g.us'] = { authorized: true }
    st.save(null, true)
    await espera()
    const escritas = chamadas.filter(c => c[0] !== 'GET')
    assert.equal(escritas.length, 1)
    assert.deepEqual(escritas[0], ['PATCH', 'bot_data/teste_manual_local', { 'g9@g___dot___us': { authorized: true } }])
})
